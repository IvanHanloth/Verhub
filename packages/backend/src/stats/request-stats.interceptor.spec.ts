import { CallHandler, ExecutionContext } from "@nestjs/common"
import { Reflector } from "@nestjs/core"
import { PublicEndpoint, StatPlatform } from "@prisma/client"
import { of, throwError, lastValueFrom } from "rxjs"

import { RequestStatsInterceptor } from "./request-stats.interceptor"

type RequestShape = {
  params?: Record<string, string>
  headers?: Record<string, unknown>
  query?: Record<string, unknown>
  body?: Record<string, unknown>
}

function createContext(request: RequestShape): ExecutionContext {
  return {
    getHandler: () => () => undefined,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext
}

function createHandler(result: unknown = { ok: true }): CallHandler {
  return { handle: () => of(result) }
}

function createInterceptor(endpoint: PublicEndpoint | undefined) {
  const reflector = { get: jest.fn().mockReturnValue(endpoint) } as unknown as Reflector
  const statsService = { recordRequestSafely: jest.fn(), recordClientVersionSafely: jest.fn() }
  const interceptor = new RequestStatsInterceptor(reflector, statsService as never)
  return { interceptor, statsService }
}

describe("RequestStatsInterceptor", () => {
  it("records a tracked route with the platform from the User-Agent", async () => {
    const { interceptor, statsService } = createInterceptor(PublicEndpoint.VERSION_LATEST)
    const context = createContext({
      params: { projectKey: "verhub" },
      headers: { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
    })

    await lastValueFrom(interceptor.intercept(context, createHandler()))

    expect(statsService.recordRequestSafely).toHaveBeenCalledWith({
      projectKey: "verhub",
      endpoint: PublicEndpoint.VERSION_LATEST,
      platform: StatPlatform.WINDOWS,
      ip: null,
    })
  })

  it("passes the forwarded client address on for region resolution", async () => {
    const { interceptor, statsService } = createInterceptor(PublicEndpoint.VERSION_LATEST)
    const context = createContext({
      params: { projectKey: "verhub" },
      headers: { "x-forwarded-for": "203.0.113.9, 10.0.0.1" },
    })

    await lastValueFrom(interceptor.intercept(context, createHandler()))

    expect(statsService.recordRequestSafely).toHaveBeenCalledWith(
      expect.objectContaining({ ip: "203.0.113.9" }),
    )
  })

  it("prefers the SDK platform header over the User-Agent", async () => {
    const { interceptor, statsService } = createInterceptor(PublicEndpoint.VERSION_CHECK_UPDATE)
    const context = createContext({
      params: { projectKey: "verhub" },
      headers: {
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        "x-verhub-platform": "ios",
      },
    })

    await lastValueFrom(interceptor.intercept(context, createHandler()))

    expect(statsService.recordRequestSafely).toHaveBeenCalledWith(
      expect.objectContaining({ platform: StatPlatform.IOS }),
    )
  })

  it("reads the platform from the request body when no header is sent", async () => {
    const { interceptor, statsService } = createInterceptor(PublicEndpoint.FEEDBACK_SUBMIT)
    const context = createContext({
      params: { projectKey: "verhub" },
      headers: {},
      body: { platform: "android" },
    })

    await lastValueFrom(interceptor.intercept(context, createHandler()))

    expect(statsService.recordRequestSafely).toHaveBeenCalledWith(
      expect.objectContaining({ platform: StatPlatform.ANDROID }),
    )
  })

  it("does not record routes without the @TrackEndpoint marker", async () => {
    const { interceptor, statsService } = createInterceptor(undefined)
    const context = createContext({ params: { projectKey: "verhub" }, headers: {} })

    await lastValueFrom(interceptor.intercept(context, createHandler()))

    expect(statsService.recordRequestSafely).not.toHaveBeenCalled()
  })

  it("does not record when the route has no projectKey param", async () => {
    const { interceptor, statsService } = createInterceptor(PublicEndpoint.PROJECT_DETAIL)
    const context = createContext({ params: {}, headers: {} })

    await lastValueFrom(interceptor.intercept(context, createHandler()))

    expect(statsService.recordRequestSafely).not.toHaveBeenCalled()
  })

  it("does not record failed requests", async () => {
    const { interceptor, statsService } = createInterceptor(PublicEndpoint.PROJECT_DETAIL)
    const context = createContext({ params: { projectKey: "verhub" }, headers: {} })
    const handler: CallHandler = { handle: () => throwError(() => new Error("not found")) }

    await expect(lastValueFrom(interceptor.intercept(context, handler))).rejects.toThrow(
      "not found",
    )
    expect(statsService.recordRequestSafely).not.toHaveBeenCalled()
  })

  it("records the version a check-update client reports", async () => {
    const { interceptor, statsService } = createInterceptor(PublicEndpoint.VERSION_CHECK_UPDATE)
    const context = createContext({
      params: { projectKey: "verhub" },
      headers: { "x-verhub-platform": "mac" },
      body: { current_version: "2.3.0" },
    })

    await lastValueFrom(interceptor.intercept(context, createHandler()))

    expect(statsService.recordClientVersionSafely).toHaveBeenCalledWith({
      projectKey: "verhub",
      version: "2.3.0",
      platform: StatPlatform.MAC,
    })
  })

  it("falls back to the comparable version when no display version is sent", async () => {
    const { interceptor, statsService } = createInterceptor(PublicEndpoint.VERSION_CHECK_UPDATE)
    const context = createContext({
      params: { projectKey: "verhub" },
      headers: {},
      body: { current_comparable_version: "2.3.0-rc.1" },
    })

    await lastValueFrom(interceptor.intercept(context, createHandler()))

    expect(statsService.recordClientVersionSafely).toHaveBeenCalledWith(
      expect.objectContaining({ version: "2.3.0-rc.1" }),
    )
  })

  it("does not record a version bucket when the client reports none", async () => {
    const { interceptor, statsService } = createInterceptor(PublicEndpoint.VERSION_CHECK_UPDATE)
    const context = createContext({
      params: { projectKey: "verhub" },
      headers: {},
      body: { current_version: "   " },
    })

    await lastValueFrom(interceptor.intercept(context, createHandler()))

    expect(statsService.recordRequestSafely).toHaveBeenCalled()
    expect(statsService.recordClientVersionSafely).not.toHaveBeenCalled()
  })

  it("only reads a reported version on check-update", async () => {
    const { interceptor, statsService } = createInterceptor(PublicEndpoint.VERSION_LATEST)
    const context = createContext({
      params: { projectKey: "verhub" },
      headers: {},
      body: { current_version: "2.3.0" },
    })

    await lastValueFrom(interceptor.intercept(context, createHandler()))

    expect(statsService.recordClientVersionSafely).not.toHaveBeenCalled()
  })
})
