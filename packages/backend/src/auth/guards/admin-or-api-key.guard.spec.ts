import { ExecutionContext } from "@nestjs/common"

import { AdminOrApiKeyGuard } from "./admin-or-api-key.guard"

describe("AdminOrApiKeyGuard", () => {
  const mockContext = {} as ExecutionContext

  it("returns true when JWT guard succeeds", async () => {
    const jwtGuard = { canActivate: jest.fn().mockResolvedValue(true) }
    const apiKeyGuard = { canActivate: jest.fn().mockResolvedValue(false) }
    const guard = new AdminOrApiKeyGuard(jwtGuard as never, apiKeyGuard as never)

    const result = await guard.canActivate(mockContext)
    expect(result).toBe(true)
    expect(apiKeyGuard.canActivate).not.toHaveBeenCalled()
  })

  it("falls back to API key guard when JWT guard throws", async () => {
    const jwtGuard = { canActivate: jest.fn().mockRejectedValue(new Error("JWT failed")) }
    const apiKeyGuard = { canActivate: jest.fn().mockResolvedValue(true) }
    const guard = new AdminOrApiKeyGuard(jwtGuard as never, apiKeyGuard as never)

    const result = await guard.canActivate(mockContext)
    expect(result).toBe(true)
    expect(apiKeyGuard.canActivate).toHaveBeenCalledWith(mockContext)
  })

  it("rejects when both guards fail", async () => {
    const jwtGuard = { canActivate: jest.fn().mockRejectedValue(new Error("JWT failed")) }
    const apiKeyGuard = { canActivate: jest.fn().mockRejectedValue(new Error("API key failed")) }
    const guard = new AdminOrApiKeyGuard(jwtGuard as never, apiKeyGuard as never)

    await expect(guard.canActivate(mockContext)).rejects.toThrow("API key failed")
  })
})
