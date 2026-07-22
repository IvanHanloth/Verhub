import { CallHandler, ExecutionContext } from "@nestjs/common"
import { Reflector } from "@nestjs/core"
import { Platform, PublicEndpoint } from "@prisma/client"
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
  const statsService = {
    recordRequestSafely: jest.fn(),
    recordClientVersionSafely: jest.fn(),
    recordPlatformVersionSafely: jest.fn(),
  }
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
      platform: Platform.WINDOWS,
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
      expect.objectContaining({ platform: Platform.IOS }),
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
      expect.objectContaining({ platform: Platform.ANDROID }),
    )
  })

  it("records the OS version on every tracked route, not just check-update", async () => {
    // 系统版本描述的是设备本身，任何一次调用都带得出来；客户端版本只有
    // check-update 才报得出，两者的采集面因此不同。
    const { interceptor, statsService } = createInterceptor(PublicEndpoint.VERSION_LATEST)
    const context = createContext({
      params: { projectKey: "verhub" },
      headers: { "x-verhub-platform": "windows", "x-verhub-platform-version": "11" },
    })

    await lastValueFrom(interceptor.intercept(context, createHandler()))

    expect(statsService.recordPlatformVersionSafely).toHaveBeenCalledWith({
      projectKey: "verhub",
      platform: Platform.WINDOWS,
      platformVersion: "11",
    })
  })

  it("splits an OS version the client packed into the platform field", async () => {
    const { interceptor, statsService } = createInterceptor(PublicEndpoint.VERSION_LATEST)
    const context = createContext({
      params: { projectKey: "verhub" },
      headers: {},
      query: { platform: "ubuntu 24.04" },
    })

    await lastValueFrom(interceptor.intercept(context, createHandler()))

    expect(statsService.recordRequestSafely).toHaveBeenCalledWith(
      expect.objectContaining({ platform: Platform.LINUX }),
    )
    expect(statsService.recordPlatformVersionSafely).toHaveBeenCalledWith(
      expect.objectContaining({ platform: Platform.LINUX, platformVersion: "ubuntu 24.04" }),
    )
  })

  it("counts traffic that reports no OS version in an empty-detail bucket", async () => {
    // 空串照样落一行：否则「多少流量根本没报系统版本」无从回答，占比分母也会失真。
    const { interceptor, statsService } = createInterceptor(PublicEndpoint.VERSION_LATEST)
    const context = createContext({ params: { projectKey: "verhub" }, headers: {} })

    await lastValueFrom(interceptor.intercept(context, createHandler()))

    expect(statsService.recordPlatformVersionSafely).toHaveBeenCalledWith(
      expect.objectContaining({ platform: Platform.OTHERS, platformVersion: "" }),
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
      platform: Platform.MACOS,
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
