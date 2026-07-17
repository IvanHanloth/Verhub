import { ExecutionContext, UnauthorizedException } from "@nestjs/common"

import { AdminOrApiKeyGuard } from "./admin-or-api-key.guard"

function contextWithHeaders(headers: Record<string, string | string[] | undefined>) {
  return {
    switchToHttp: () => ({ getRequest: () => ({ headers }) }),
  } as unknown as ExecutionContext
}

describe("AdminOrApiKeyGuard", () => {
  const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1MSJ9.sig"
  const apiKey = "vh_0123456789abcdef"

  it("routes a bearer JWT to the JWT guard", async () => {
    const jwtGuard = { canActivate: jest.fn().mockResolvedValue(true) }
    const apiKeyGuard = { canActivate: jest.fn() }
    const guard = new AdminOrApiKeyGuard(jwtGuard as never, apiKeyGuard as never)

    const context = contextWithHeaders({ authorization: `Bearer ${jwt}` })
    expect(await guard.canActivate(context)).toBe(true)
    expect(apiKeyGuard.canActivate).not.toHaveBeenCalled()
  })

  it("routes a vh_-prefixed bearer token to the API key guard", async () => {
    const jwtGuard = { canActivate: jest.fn() }
    const apiKeyGuard = { canActivate: jest.fn().mockResolvedValue(true) }
    const guard = new AdminOrApiKeyGuard(jwtGuard as never, apiKeyGuard as never)

    const context = contextWithHeaders({ authorization: `Bearer ${apiKey}` })
    expect(await guard.canActivate(context)).toBe(true)
    expect(jwtGuard.canActivate).not.toHaveBeenCalled()
  })

  it("routes the legacy X-API-Key header to the API key guard", async () => {
    const jwtGuard = { canActivate: jest.fn() }
    const apiKeyGuard = { canActivate: jest.fn().mockResolvedValue(true) }
    const guard = new AdminOrApiKeyGuard(jwtGuard as never, apiKeyGuard as never)

    const context = contextWithHeaders({ "x-api-key": apiKey })
    expect(await guard.canActivate(context)).toBe(true)
    expect(jwtGuard.canActivate).not.toHaveBeenCalled()
  })

  it("surfaces the JWT guard's own error rather than an api key error", async () => {
    const jwtGuard = {
      canActivate: jest.fn().mockRejectedValue(new UnauthorizedException("Invalid bearer token")),
    }
    const apiKeyGuard = { canActivate: jest.fn() }
    const guard = new AdminOrApiKeyGuard(jwtGuard as never, apiKeyGuard as never)

    const context = contextWithHeaders({ authorization: `Bearer ${jwt}` })
    await expect(guard.canActivate(context)).rejects.toThrow("Invalid bearer token")
    expect(apiKeyGuard.canActivate).not.toHaveBeenCalled()
  })

  it("rejects when no credential is supplied", async () => {
    const jwtGuard = { canActivate: jest.fn() }
    const apiKeyGuard = { canActivate: jest.fn() }
    const guard = new AdminOrApiKeyGuard(jwtGuard as never, apiKeyGuard as never)

    await expect(guard.canActivate(contextWithHeaders({}))).rejects.toBeInstanceOf(
      UnauthorizedException,
    )
    expect(jwtGuard.canActivate).not.toHaveBeenCalled()
    expect(apiKeyGuard.canActivate).not.toHaveBeenCalled()
  })
})
