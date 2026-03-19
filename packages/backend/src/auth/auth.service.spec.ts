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
    update: jest.Mock
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
      update: jest.fn(),
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

    const service = new AuthService(prisma as never, jwtService as never, configService as never)
    const removeBootstrapSpy = jest
      .spyOn(
        service as unknown as { removeBootstrapCredentialFile: () => Promise<void> },
        "removeBootstrapCredentialFile",
      )
      .mockResolvedValue(undefined)

    const result = await service.login({ username: "admin", password: "admin123" })

    expect(result.access_token).toBe("jwt-token")
    expect(result.expires_in).toBe(7200)
    expect(result.user).toEqual({
      id: "admin-id",
      username: "admin",
      role: "ADMIN",
      must_change_password: false,
    })
    expect(removeBootstrapSpy).toHaveBeenCalled()
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

  it("validates api key with required scope and updates last used time", async () => {
    const prisma = createPrismaMock()
    prisma.apiKey.findFirst.mockResolvedValue({
      id: "api-key-1",
      scopes: ["versions:write"],
    })
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
    const result = await service.validateApiKey("sk_live_demo", "versions:write")

    expect(result).toBe(true)
    expect(prisma.apiKey.findFirst).toHaveBeenCalled()
    expect(prisma.apiKey.update).toHaveBeenCalledWith({
      where: { id: "api-key-1" },
      data: { lastUsedAt: expect.any(Date) },
    })
  })

  it("rejects api key if required scope is missing", async () => {
    const prisma = createPrismaMock()
    prisma.apiKey.findFirst.mockResolvedValue({
      id: "api-key-1",
      scopes: ["projects:read"],
    })

    const service = new AuthService(
      prisma as never,
      { signAsync: jest.fn() } as never,
      {
        get: jest.fn((key: string) => {
          const values: Record<string, string> = {
            API_KEY_SALT: "pepper",
          }
          return values[key]
        }),
      } as never,
    )

    const valid = await service.validateApiKey("sk_live_demo", "versions:write")

    expect(valid).toBe(false)
    expect(prisma.apiKey.update).not.toHaveBeenCalled()
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
      },
      select: {
        id: true,
        username: true,
      },
    })
  })

  it("initializes admin on first startup and writes bootstrap credential file", async () => {
    const prisma = createPrismaMock()
    prisma.user.count.mockResolvedValue(0)
    prisma.user.create.mockResolvedValue({ id: "admin-id" })

    const service = new AuthService(
      prisma as never,
      { signAsync: jest.fn() } as never,
      {
        get: jest.fn((key: string) => {
          const values: Record<string, string> = {
            ADMIN_PASSWORD: "",
          }
          return values[key]
        }),
      } as never,
    )

    const writeBootstrapSpy = jest
      .spyOn(
        service as unknown as {
          writeBootstrapCredentialFile: (username: string, password: string) => Promise<string>
        },
        "writeBootstrapCredentialFile",
      )
      .mockResolvedValue("/bootstrap/verhub.bootstrap-admin.txt")

    const infoSpy = jest.spyOn(console, "info").mockImplementation(() => undefined)

    await service.onModuleInit()

    expect(prisma.user.create).toHaveBeenCalledWith({
      data: {
        username: "admin",
        passwordHash: expect.any(String),
        role: "ADMIN",
      },
    })
    expect(writeBootstrapSpy).toHaveBeenCalledWith("admin", expect.any(String))
    expect(infoSpy).toHaveBeenCalledWith("[verhub][bootstrap] admin account initialized")
    expect(infoSpy).toHaveBeenCalledWith("[verhub][bootstrap] username=admin")
    expect(infoSpy).toHaveBeenCalledWith(
      expect.stringMatching(/^\[verhub\]\[bootstrap\] password=/),
    )
    expect(infoSpy).toHaveBeenCalledWith(
      "[verhub][bootstrap] credential_file=/bootstrap/verhub.bootstrap-admin.txt",
    )

    infoSpy.mockRestore()
  })

  it("skips admin bootstrap if user already exists", async () => {
    const prisma = createPrismaMock()
    prisma.user.count.mockResolvedValue(1)

    const service = new AuthService(
      prisma as never,
      { signAsync: jest.fn() } as never,
      {
        get: jest.fn(),
      } as never,
    )

    const writeBootstrapSpy = jest
      .spyOn(
        service as unknown as {
          writeBootstrapCredentialFile: (username: string, password: string) => Promise<string>
        },
        "writeBootstrapCredentialFile",
      )
      .mockResolvedValue("/bootstrap/verhub.bootstrap-admin.txt")

    await service.onModuleInit()

    expect(prisma.user.create).not.toHaveBeenCalled()
    expect(writeBootstrapSpy).not.toHaveBeenCalled()
  })

  it("creates api key with default 30-day expiry", async () => {
    const prisma = createPrismaMock()
    prisma.apiKey.create.mockResolvedValue({
      id: "key-id",
      name: "ci-key",
      scopes: ["versions:write"],
      expiresAt: new Date(Date.now() + 29 * 24 * 60 * 60 * 1000),
      createdAt: new Date(),
    })

    const service = new AuthService(
      prisma as never,
      { signAsync: jest.fn() } as never,
      {
        get: jest.fn((key: string) => {
          const values: Record<string, string> = {
            API_KEY_SALT: "pepper",
          }
          return values[key]
        }),
      } as never,
    )

    const result = await service.createApiKey({ name: "ci-key" }, "admin-id")

    expect(result.token.startsWith("vh_")).toBe(true)
    expect(prisma.apiKey.create).toHaveBeenCalledWith({
      data: {
        name: "ci-key",
        keyHash: expect.any(String),
        scopes: ["versions:write"],
        createdById: "admin-id",
        expiresAt: expect.any(Date),
      },
      select: {
        id: true,
        name: true,
        scopes: true,
        expiresAt: true,
        createdAt: true,
      },
    })
  })

  it("does not print bootstrap password when admin password is configured", async () => {
    const prisma = createPrismaMock()
    prisma.user.count.mockResolvedValue(0)
    prisma.user.create.mockResolvedValue({ id: "admin-id" })

    const service = new AuthService(
      prisma as never,
      { signAsync: jest.fn() } as never,
      {
        get: jest.fn((key: string) => {
          const values: Record<string, string> = {
            ADMIN_PASSWORD: "provided-password",
          }
          return values[key]
        }),
      } as never,
    )

    const writeBootstrapSpy = jest
      .spyOn(
        service as unknown as {
          writeBootstrapCredentialFile: (username: string, password: string) => Promise<string>
        },
        "writeBootstrapCredentialFile",
      )
      .mockResolvedValue("/bootstrap/verhub.bootstrap-admin.txt")

    const infoSpy = jest.spyOn(console, "info").mockImplementation(() => undefined)

    await service.onModuleInit()

    expect(writeBootstrapSpy).toHaveBeenCalledWith("admin", "provided-password")
    expect(infoSpy).not.toHaveBeenCalled()

    infoSpy.mockRestore()
  })
})
