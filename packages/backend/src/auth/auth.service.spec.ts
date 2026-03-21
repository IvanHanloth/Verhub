import { Logger, UnauthorizedException } from "@nestjs/common"

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
      allProjects: true,
      projectIds: [],
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
      data: { lastUsedAt: expect.any(Number) },
    })
  })

  it("rejects api key if required scope is missing", async () => {
    const prisma = createPrismaMock()
    prisma.apiKey.findFirst.mockResolvedValue({
      id: "api-key-1",
      scopes: ["projects:read"],
      allProjects: true,
      projectIds: [],
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

  it("rejects forbidden admin profile update scope for api key", async () => {
    const prisma = createPrismaMock()
    prisma.apiKey.findFirst.mockResolvedValue({
      id: "api-key-1",
      scopes: ["tokens:write", "projects:read"],
      allProjects: true,
      projectIds: [],
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

    const valid = await service.validateApiKey("sk_live_demo", "admin:profile:update")

    expect(valid).toBe(false)
    expect(prisma.apiKey.update).not.toHaveBeenCalled()
  })

  it("enforces project scope when api key is limited to project ids", async () => {
    const prisma = createPrismaMock()
    prisma.apiKey.findFirst.mockResolvedValue({
      id: "api-key-1",
      scopes: ["versions:read"],
      allProjects: false,
      projectIds: ["project-1"],
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

    const allowed = await service.validateApiKey("sk_live_demo", "versions:read", {
      projectId: "project-1",
    })
    const denied = await service.validateApiKey("sk_live_demo", "versions:read", {
      projectId: "project-2",
    })

    expect(allowed).toBe(true)
    expect(denied).toBe(false)
  })

  it("accepts previous key during grace period", async () => {
    const prisma = createPrismaMock()
    prisma.apiKey.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: "api-key-1",
        scopes: ["versions:read"],
        allProjects: true,
        projectIds: [],
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

    const valid = await service.validateApiKey("sk_live_previous", "versions:read")

    expect(valid).toBe(true)
    expect(prisma.apiKey.update).toHaveBeenCalledWith({
      where: { id: "api-key-1" },
      data: { lastUsedAt: expect.any(Number) },
    })
  })

  it("rejects expired api key and writes warning log without deleting record", async () => {
    const prisma = createPrismaMock()
    prisma.apiKey.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({
      id: "expired-key-id",
      expiresAt: 1,
    })

    const warnSpy = jest.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined)

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

    const valid = await service.validateApiKey("sk_live_expired", "versions:read")

    expect(valid).toBe(false)
    expect(prisma.apiKey.update).not.toHaveBeenCalled()
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("expired token rejected key_id=expired-key-id"),
    )

    warnSpy.mockRestore()
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
        updatedAt: expect.any(Number),
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
      expiresAt: Math.floor(Date.now() / 1000) + 29 * 24 * 60 * 60,
      createdAt: Math.floor(Date.now() / 1000),
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
        allProjects: true,
        projectIds: [],
        createdById: "admin-id",
        expiresAt: expect.any(Number),
      },
      select: {
        id: true,
        name: true,
        scopes: true,
        allProjects: true,
        projectIds: true,
        expiresAt: true,
        createdAt: true,
      },
    })
  })

  it("creates non-expiring api key with project whitelist", async () => {
    const prisma = createPrismaMock()
    prisma.project.count.mockResolvedValue(2)
    prisma.apiKey.create.mockResolvedValue({
      id: "key-id",
      name: "ci-key",
      scopes: ["versions:write"],
      allProjects: false,
      projectIds: ["project-1", "project-2"],
      expiresAt: null,
      createdAt: Math.floor(Date.now() / 1000),
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

    const result = await service.createApiKey(
      {
        name: "ci-key",
        all_projects: false,
        project_ids: ["project-1", "project-2"],
        never_expires: true,
      },
      "admin-id",
    )

    expect(result.expires_at).toBeNull()
    expect(prisma.apiKey.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          allProjects: false,
          projectIds: ["project-1", "project-2"],
          expiresAt: null,
        }),
      }),
    )
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
    expect(infoSpy).not.toHaveBeenCalledWith(
      expect.stringMatching(/^\[verhub\]\[bootstrap\] password=provided-password$/),
    )

    infoSpy.mockRestore()
  })
})
