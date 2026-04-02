import { UnauthorizedException } from "@nestjs/common"

import * as bcrypt from "bcrypt"

import { AuthService } from "./auth.service"

type PrismaMock = {
  user: {
    count: jest.Mock
    create: jest.Mock
    findFirst: jest.Mock
    findUnique: jest.Mock
    update: jest.Mock
  }
  apiKey: {
    create: jest.Mock
    findFirst: jest.Mock
    findMany: jest.Mock
    findUnique: jest.Mock
    update: jest.Mock
  }
  project: {
    count: jest.Mock
    findUnique: jest.Mock
  }
}

function createPrismaMock(): PrismaMock {
  return {
    user: {
      count: jest.fn(),
      create: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    apiKey: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    project: {
      count: jest.fn(),
      findUnique: jest.fn(),
    },
  }
}

describe("AuthService", () => {
  it("logs in with database admin credentials", async () => {
    const prisma = createPrismaMock()
    prisma.user.findUnique.mockResolvedValue({
      id: "admin-id",
      username: "admin",
      passwordHash: await bcrypt.hash("admin123", 10),
    })

    const jwtService = {
      signAsync: jest.fn().mockResolvedValue("jwt-token"),
    }
    const configService = {
      get: jest.fn((key: string) => {
        const values: Record<string, string> = {
          JWT_SECRET: "test-secret",
          JWT_EXPIRES_IN: "2h",
          API_KEY_SALT: "pepper",
        }

        return values[key]
      }),
    }

    const adminBootstrapService = {
      removeBootstrapCredentialFile: jest.fn().mockResolvedValue(undefined),
    }

    const service = new AuthService(
      prisma as never,
      jwtService as never,
      configService as never,
      adminBootstrapService as never,
    )

    const result = await service.login({ username: "admin", password: "admin123" })

    expect(result.access_token).toBe("jwt-token")
    expect(result.expires_in).toBe(7200)
    expect(result.user).toEqual({
      id: "admin-id",
      username: "admin",
      role: "ADMIN",
      must_change_password: false,
    })
    expect(adminBootstrapService.removeBootstrapCredentialFile).toHaveBeenCalled()
    expect(jwtService.signAsync).toHaveBeenCalledWith(
      {
        sub: "admin-id",
        username: "admin",
        role: "admin",
      },
      {
        secret: "test-secret",
      },
    )
  })

  it("rejects invalid password", async () => {
    const prisma = createPrismaMock()
    prisma.user.findUnique.mockResolvedValue({
      id: "admin-id",
      username: "admin",
      passwordHash: await bcrypt.hash("admin123", 10),
    })

    const jwtService = {
      signAsync: jest.fn(),
    }
    const configService = {
      get: jest.fn((key: string) => {
        const values: Record<string, string> = {
          JWT_SECRET: "test-secret",
          JWT_EXPIRES_IN: "2h",
          API_KEY_SALT: "pepper",
        }

        return values[key]
      }),
    }

    const service = new AuthService(prisma as never, jwtService as never, configService as never)

    await expect(
      service.login({ username: "admin", password: "wrong-password" }),
    ).rejects.toBeInstanceOf(UnauthorizedException)
  })

  it("updates admin profile with current password", async () => {
    const prisma = createPrismaMock()
    prisma.user.findFirst.mockResolvedValue({
      id: "admin-id",
      username: "admin",
      passwordHash: await bcrypt.hash("old-password", 10),
    })
    prisma.user.update.mockResolvedValue({ id: "admin-id", username: "admin-next" })

    const service = new AuthService(
      prisma as never,
      { signAsync: jest.fn() } as never,
      {
        get: jest.fn(),
      } as never,
    )

    const result = await service.updateAdminProfile({
      current_password: "old-password",
      username: "admin-next",
      new_password: "new-password",
    })

    expect(result).toEqual({
      id: "admin-id",
      username: "admin-next",
      role: "ADMIN",
      must_change_password: false,
    })
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "admin-id" },
      data: {
        username: "admin-next",
        passwordHash: expect.any(String),
        updatedAt: expect.any(Number),
      },
      select: {
        id: true,
        username: true,
      },
    })
  })
})
