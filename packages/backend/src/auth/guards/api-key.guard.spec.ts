import { ExecutionContext, UnauthorizedException } from "@nestjs/common"

import { ApiKeyGuard } from "./api-key.guard"

function createMockExecutionContext(
  headers: Record<string, string | undefined>,
  params?: Record<string, unknown>,
  query?: Record<string, unknown>,
  body?: Record<string, unknown>,
): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ headers, params, query, body }),
    }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext
}

describe("ApiKeyGuard", () => {
  const reflector = {
    getAllAndOverride: jest.fn(),
  }

  it("rejects requests without x-api-key header", async () => {
    const apiKeyService = { validateApiKey: jest.fn() }
    reflector.getAllAndOverride.mockReturnValue("versions:write")
    const guard = new ApiKeyGuard(apiKeyService as never, reflector as never)
    const context = createMockExecutionContext({})

    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException)
  })

  it("rejects when api key validation fails", async () => {
    const apiKeyService = { validateApiKey: jest.fn().mockResolvedValue(false) }
    reflector.getAllAndOverride.mockReturnValue("versions:write")
    const guard = new ApiKeyGuard(apiKeyService as never, reflector as never)
    const context = createMockExecutionContext({ "x-api-key": "bad-key" })

    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException)
    expect(apiKeyService.validateApiKey).toHaveBeenCalledWith("bad-key", "versions:write", {
      projectId: undefined,
      projectKey: undefined,
    })
  })

  it("allows when api key is valid", async () => {
    const apiKeyService = { validateApiKey: jest.fn().mockResolvedValue(true) }
    reflector.getAllAndOverride.mockReturnValue("versions:write")
    const guard = new ApiKeyGuard(apiKeyService as never, reflector as never)
    const context = createMockExecutionContext({ "x-api-key": "valid-key" })

    const result = await guard.canActivate(context)
    expect(result).toBe(true)
  })

  it("extracts projectKey from params", async () => {
    const apiKeyService = { validateApiKey: jest.fn().mockResolvedValue(true) }
    reflector.getAllAndOverride.mockReturnValue("versions:write")
    const guard = new ApiKeyGuard(apiKeyService as never, reflector as never)
    const context = createMockExecutionContext(
      { "x-api-key": "valid-key" },
      { projectKey: "my-project" },
    )

    await guard.canActivate(context)
    expect(apiKeyService.validateApiKey).toHaveBeenCalledWith("valid-key", "versions:write", {
      projectId: undefined,
      projectKey: "my-project",
    })
  })

  it("extracts project_key from query", async () => {
    const apiKeyService = { validateApiKey: jest.fn().mockResolvedValue(true) }
    reflector.getAllAndOverride.mockReturnValue("versions:write")
    const guard = new ApiKeyGuard(apiKeyService as never, reflector as never)
    const context = createMockExecutionContext(
      { "x-api-key": "valid-key" },
      {},
      { project_key: "queried-project" },
    )

    await guard.canActivate(context)
    expect(apiKeyService.validateApiKey).toHaveBeenCalledWith("valid-key", "versions:write", {
      projectId: undefined,
      projectKey: "queried-project",
    })
  })

  it("extracts projectId from body", async () => {
    const apiKeyService = { validateApiKey: jest.fn().mockResolvedValue(true) }
    reflector.getAllAndOverride.mockReturnValue("versions:write")
    const guard = new ApiKeyGuard(apiKeyService as never, reflector as never)
    const context = createMockExecutionContext(
      { "x-api-key": "valid-key" },
      {},
      {},
      { projectId: "body-project-id" },
    )

    await guard.canActivate(context)
    expect(apiKeyService.validateApiKey).toHaveBeenCalledWith("valid-key", "versions:write", {
      projectId: "body-project-id",
      projectKey: undefined,
    })
  })

  it("handles array x-api-key header (takes first)", async () => {
    const apiKeyService = { validateApiKey: jest.fn().mockResolvedValue(true) }
    reflector.getAllAndOverride.mockReturnValue("versions:write")
    const guard = new ApiKeyGuard(apiKeyService as never, reflector as never)
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({
          headers: { "x-api-key": ["first-key", "second-key"] },
          params: {},
          query: {},
          body: {},
        }),
      }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as unknown as ExecutionContext

    await guard.canActivate(context)
    expect(apiKeyService.validateApiKey).toHaveBeenCalledWith("first-key", "versions:write", {
      projectId: undefined,
      projectKey: undefined,
    })
  })

  it("denies an api key on an endpoint that declares no scope", async () => {
    const apiKeyService = { validateApiKey: jest.fn().mockResolvedValue(true) }
    reflector.getAllAndOverride.mockReturnValue(undefined)
    const guard = new ApiKeyGuard(apiKeyService as never, reflector as never)
    const context = createMockExecutionContext({ "x-api-key": "valid-key" })

    // Fail closed: a missing @RequireApiScope must never mean "any key allowed".
    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException)
    expect(apiKeyService.validateApiKey).not.toHaveBeenCalled()
  })

  it("accepts an api key sent as a bearer token", async () => {
    const apiKeyService = { validateApiKey: jest.fn().mockResolvedValue(true) }
    reflector.getAllAndOverride.mockReturnValue("versions:write")
    const guard = new ApiKeyGuard(apiKeyService as never, reflector as never)
    const context = createMockExecutionContext({ authorization: "Bearer vh_abc123" })

    expect(await guard.canActivate(context)).toBe(true)
    expect(apiKeyService.validateApiKey).toHaveBeenCalledWith("vh_abc123", "versions:write", {
      projectId: undefined,
      projectKey: undefined,
    })
  })

  it("ignores a bearer token that is a JWT rather than an api key", async () => {
    const apiKeyService = { validateApiKey: jest.fn() }
    reflector.getAllAndOverride.mockReturnValue("versions:write")
    const guard = new ApiKeyGuard(apiKeyService as never, reflector as never)
    const context = createMockExecutionContext({ authorization: "Bearer eyJhbGci.eyJzdWIi.sig" })

    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException)
    expect(apiKeyService.validateApiKey).not.toHaveBeenCalled()
  })

  it("ignores empty/whitespace string values for project fields", async () => {
    const apiKeyService = { validateApiKey: jest.fn().mockResolvedValue(true) }
    reflector.getAllAndOverride.mockReturnValue("versions:write")
    const guard = new ApiKeyGuard(apiKeyService as never, reflector as never)
    const context = createMockExecutionContext({ "x-api-key": "valid-key" }, { projectKey: "  " })

    await guard.canActivate(context)
    expect(apiKeyService.validateApiKey).toHaveBeenCalledWith("valid-key", "versions:write", {
      projectId: undefined,
      projectKey: undefined,
    })
  })
})
