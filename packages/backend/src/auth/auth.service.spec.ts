import { UnauthorizedException } from "@nestjs/common"

import * as bcrypt from "bcrypt"

import { AuthService } from "./auth.service"

type PrismaMock = {
  user: {
    findUnique: jest.Mock
  }
  apiKey: {
    findFirst: jest.Mock
    update: jest.Mock
  }
}

function createPrismaMock(): PrismaMock {
  return {
    user: {
      findUnique: jest.fn(),
    },
    apiKey: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
  }
}

describe("AuthService", () => {
  it("logs in with env admin credentials", async () => {
    const prisma = createPrismaMock()
    prisma.user.findUnique.mockResolvedValue(null)

    const passwordHash = await bcrypt.hash("admin123", 10)
    const jwtService = {
      signAsync: jest.fn().mockResolvedValue("jwt-token"),
    }
    const configService = {
      get: jest.fn((key: string) => {
        const values: Record<string, string> = {
          ADMIN_USERNAME: "admin",
          ADMIN_PASSWORD_HASH: passwordHash,
          JWT_SECRET: "test-secret",
          JWT_EXPIRES_IN: "2h",
          API_KEY_SALT: "pepper",
        }

        return values[key]
      }),
    }

    const service = new AuthService(prisma as never, jwtService as never, configService as never)
    const result = await service.login({ username: "admin", password: "admin123" })

    expect(result.access_token).toBe("jwt-token")
    expect(result.expires_in).toBe(7200)
    expect(jwtService.signAsync).toHaveBeenCalled()
  })

  it("rejects invalid password", async () => {
    const prisma = createPrismaMock()
    prisma.user.findUnique.mockResolvedValue(null)

    const passwordHash = await bcrypt.hash("admin123", 10)
    const jwtService = {
      signAsync: jest.fn(),
    }
    const configService = {
      get: jest.fn((key: string) => {
        const values: Record<string, string> = {
          ADMIN_USERNAME: "admin",
          ADMIN_PASSWORD_HASH: passwordHash,
          JWT_SECRET: "test-secret",
          JWT_EXPIRES_IN: "2h",
          API_KEY_SALT: "pepper",
        }

        return values[key]
      }),
    }

    const service = new AuthService(prisma as never, jwtService as never, configService as never)

    await expect(service.login({ username: "admin", password: "wrong-password" })).rejects.toBeInstanceOf(
      UnauthorizedException,
    )
  })

  it("validates api key and updates last used time", async () => {
    const prisma = createPrismaMock()
    prisma.user.findUnique.mockResolvedValue(null)

    const rawApiKey = "sk_live_demo"
    const keyHash = "574b4cee76f6106863d9bf22684aa89726418946d6fe53ecc51e4df06920207d"

    prisma.apiKey.findFirst.mockResolvedValue({ id: "api-key-1" })
    prisma.apiKey.update.mockResolvedValue({ id: "api-key-1" })

    const jwtService = {
      signAsync: jest.fn(),
    }
    const configService = {
      get: jest.fn((key: string) => {
        const values: Record<string, string> = {
          API_KEY_SALT: "pepper",
        }

        return values[key]
      }),
    }

    const service = new AuthService(prisma as never, jwtService as never, configService as never)
    const result = await service.validateApiKey(rawApiKey)

    expect(result).toBe(true)
    expect(prisma.apiKey.findFirst).toHaveBeenCalledWith({
      where: {
        keyHash,
        isActive: true,
        revokedAt: null,
      },
      select: { id: true },
    })
    expect(prisma.apiKey.update).toHaveBeenCalled()
  })
})
