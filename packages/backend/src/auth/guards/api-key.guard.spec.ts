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
    reflector.getAllAndOverride.mockReturnValue(undefined)
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
    reflector.getAllAndOverride.mockReturnValue(undefined)
    const guard = new ApiKeyGuard(apiKeyService as never, reflector as never)
    const context = createMockExecutionContext({ "x-api-key": "valid-key" })

    const result = await guard.canActivate(context)
    expect(result).toBe(true)
  })

  it("extracts projectKey from params", async () => {
    const apiKeyService = { validateApiKey: jest.fn().mockResolvedValue(true) }
    reflector.getAllAndOverride.mockReturnValue(undefined)
    const guard = new ApiKeyGuard(apiKeyService as never, reflector as never)
    const context = createMockExecutionContext(
      { "x-api-key": "valid-key" },
      { projectKey: "my-project" },
    )

    await guard.canActivate(context)
    expect(apiKeyService.validateApiKey).toHaveBeenCalledWith("valid-key", undefined, {
      projectId: undefined,
      projectKey: "my-project",
    })
  })

  it("extracts project_key from query", async () => {
    const apiKeyService = { validateApiKey: jest.fn().mockResolvedValue(true) }
    reflector.getAllAndOverride.mockReturnValue(undefined)
    const guard = new ApiKeyGuard(apiKeyService as never, reflector as never)
    const context = createMockExecutionContext(
      { "x-api-key": "valid-key" },
      {},
      { project_key: "queried-project" },
    )

    await guard.canActivate(context)
    expect(apiKeyService.validateApiKey).toHaveBeenCalledWith("valid-key", undefined, {
      projectId: undefined,
      projectKey: "queried-project",
    })
  })

  it("extracts projectId from body", async () => {
    const apiKeyService = { validateApiKey: jest.fn().mockResolvedValue(true) }
    reflector.getAllAndOverride.mockReturnValue(undefined)
    const guard = new ApiKeyGuard(apiKeyService as never, reflector as never)
    const context = createMockExecutionContext(
      { "x-api-key": "valid-key" },
      {},
      {},
      { projectId: "body-project-id" },
    )

    await guard.canActivate(context)
    expect(apiKeyService.validateApiKey).toHaveBeenCalledWith("valid-key", undefined, {
      projectId: "body-project-id",
      projectKey: undefined,
    })
  })

  it("handles array x-api-key header (takes first)", async () => {
    const apiKeyService = { validateApiKey: jest.fn().mockResolvedValue(true) }
    reflector.getAllAndOverride.mockReturnValue(undefined)
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
    expect(apiKeyService.validateApiKey).toHaveBeenCalledWith("first-key", undefined, {
      projectId: undefined,
      projectKey: undefined,
    })
  })

  it("ignores empty/whitespace string values for project fields", async () => {
    const apiKeyService = { validateApiKey: jest.fn().mockResolvedValue(true) }
    reflector.getAllAndOverride.mockReturnValue(undefined)
    const guard = new ApiKeyGuard(apiKeyService as never, reflector as never)
    const context = createMockExecutionContext({ "x-api-key": "valid-key" }, { projectKey: "  " })

    await guard.canActivate(context)
    expect(apiKeyService.validateApiKey).toHaveBeenCalledWith("valid-key", undefined, {
      projectId: undefined,
      projectKey: undefined,
    })
  })
})
