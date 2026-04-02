import { ExecutionContext, UnauthorizedException } from "@nestjs/common"

import { JwtAdminGuard } from "./jwt-admin.guard"

function createMockExecutionContext(authorizationHeader?: string): ExecutionContext {
  const request: Record<string, unknown> = {
    headers: {
      authorization: authorizationHeader,
    },
  }
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext
}

describe("JwtAdminGuard", () => {
  const configService = {
    get: jest.fn((key: string) => {
      if (key === "JWT_SECRET") return "test-secret"
      return undefined
    }),
  }

  it("rejects requests without authorization header", async () => {
    const prisma = { user: { findUnique: jest.fn() } }
    const guard = new JwtAdminGuard(configService as never, prisma as never)
    const context = createMockExecutionContext(undefined)
    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException)
  })

  it("rejects requests without Bearer prefix", async () => {
    const prisma = { user: { findUnique: jest.fn() } }
    const guard = new JwtAdminGuard(configService as never, prisma as never)
    const context = createMockExecutionContext("Token abc123")
    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException)
  })

  it("rejects when JWT_SECRET is not configured", async () => {
    const configWithoutSecret = { get: jest.fn().mockReturnValue(undefined) }
    const prisma = { user: { findUnique: jest.fn() } }
    const guard = new JwtAdminGuard(configWithoutSecret as never, prisma as never)
    const context = createMockExecutionContext("Bearer some-token")
    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException)
  })

  it("rejects invalid JWT tokens", async () => {
    const prisma = { user: { findUnique: jest.fn() } }
    const guard = new JwtAdminGuard(configService as never, prisma as never)
    const context = createMockExecutionContext("Bearer invalid-token")
    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException)
  })
})
