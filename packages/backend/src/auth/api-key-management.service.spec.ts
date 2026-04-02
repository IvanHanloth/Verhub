import { Logger } from "@nestjs/common"

import { ApiKeyManagementService } from "./api-key-management.service"

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

function createConfigService(values: Record<string, string> = {}) {
  return {
    get: jest.fn((key: string) => {
      const defaults: Record<string, string> = {
        API_KEY_SALT: "pepper",
        ...values,
      }
      return defaults[key]
    }),
  }
}

describe("ApiKeyManagementService", () => {
  it("validates api key with required scope and updates last used time", async () => {
    const prisma = createPrismaMock()
    prisma.apiKey.findFirst.mockResolvedValue({
      id: "api-key-1",
      scopes: ["versions:write"],
      allProjects: true,
      projectIds: [],
    })
    prisma.apiKey.update.mockResolvedValue({ id: "api-key-1" })

    const service = new ApiKeyManagementService(prisma as never, createConfigService() as never)
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

    const service = new ApiKeyManagementService(prisma as never, createConfigService() as never)
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

    const service = new ApiKeyManagementService(prisma as never, createConfigService() as never)
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

    const service = new ApiKeyManagementService(prisma as never, createConfigService() as never)

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

    const service = new ApiKeyManagementService(prisma as never, createConfigService() as never)
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

    const service = new ApiKeyManagementService(prisma as never, createConfigService() as never)
    const valid = await service.validateApiKey("sk_live_expired", "versions:read")

    expect(valid).toBe(false)
    expect(prisma.apiKey.update).not.toHaveBeenCalled()
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("expired token rejected key_id=expired-key-id"),
    )

    warnSpy.mockRestore()
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

    const service = new ApiKeyManagementService(prisma as never, createConfigService() as never)
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

    const service = new ApiKeyManagementService(prisma as never, createConfigService() as never)
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

  it("listApiKeys returns formatted list", async () => {
    const prisma = createPrismaMock()
    prisma.apiKey.findMany.mockResolvedValue([
      {
        id: "k1",
        name: "key-1",
        scopes: ["versions:write"],
        allProjects: true,
        projectIds: [],
        isActive: true,
        expiresAt: null,
        previousKeyExpiresAt: null,
        lastUsedAt: null,
        createdAt: 1000,
        revokedAt: null,
      },
    ])

    const service = new ApiKeyManagementService(prisma as never, createConfigService() as never)
    const result = await service.listApiKeys()

    expect(result.data).toHaveLength(1)
    expect(result.data[0].id).toBe("k1")
    expect(result.data[0].is_active).toBe(true)
  })

  it("getApiScopes returns available and default scopes", () => {
    const prisma = createPrismaMock()
    const service = new ApiKeyManagementService(prisma as never, createConfigService() as never)
    const scopes = service.getApiScopes()

    expect(scopes.data).toBeDefined()
    expect(scopes.default).toBeDefined()
    expect(Array.isArray(scopes.data)).toBe(true)
  })

  it("updateApiKey updates an existing key", async () => {
    const prisma = createPrismaMock()
    prisma.apiKey.findUnique.mockResolvedValue({
      id: "k1",
      name: "old-name",
      scopes: ["versions:read"],
      allProjects: true,
      projectIds: [],
      expiresAt: null,
      createdAt: 1000,
    })
    prisma.apiKey.update.mockResolvedValue({
      id: "k1",
      name: "new-name",
      scopes: ["versions:read"],
      allProjects: true,
      projectIds: [],
      expiresAt: null,
      createdAt: 1000,
    })

    const service = new ApiKeyManagementService(prisma as never, createConfigService() as never)
    const result = await service.updateApiKey("k1", { name: "new-name" })

    expect(result.name).toBe("new-name")
  })

  it("updateApiKey throws when key not found", async () => {
    const prisma = createPrismaMock()
    prisma.apiKey.findUnique.mockResolvedValue(null)

    const service = new ApiKeyManagementService(prisma as never, createConfigService() as never)
    await expect(service.updateApiKey("missing", { name: "x" })).rejects.toThrow()
  })

  it("rotateApiKey generates new token with grace period", async () => {
    const prisma = createPrismaMock()
    prisma.apiKey.findUnique.mockResolvedValue({
      id: "k1",
      keyHash: "old-hash",
      isActive: true,
      revokedAt: null,
      expiresAt: null,
    })
    prisma.apiKey.update.mockResolvedValue({})

    const service = new ApiKeyManagementService(prisma as never, createConfigService() as never)
    const result = await service.rotateApiKey("k1", { grace_period_minutes: 30 })

    expect(result.id).toBe("k1")
    expect(result.token.startsWith("vh_")).toBe(true)
    expect(result.grace_period_minutes).toBe(30)
    expect(result.previous_key_expires_at).toBeGreaterThan(0)
  })

  it("rotateApiKey throws for inactive key", async () => {
    const prisma = createPrismaMock()
    prisma.apiKey.findUnique.mockResolvedValue(null)

    const service = new ApiKeyManagementService(prisma as never, createConfigService() as never)
    await expect(service.rotateApiKey("missing", {})).rejects.toThrow()
  })

  it("rotateApiKey throws for expired key", async () => {
    const prisma = createPrismaMock()
    prisma.apiKey.findUnique.mockResolvedValue({
      id: "k1",
      keyHash: "h",
      isActive: true,
      revokedAt: null,
      expiresAt: 1, // expired (timestamp 1)
    })

    const service = new ApiKeyManagementService(prisma as never, createConfigService() as never)
    await expect(service.rotateApiKey("k1", {})).rejects.toThrow()
  })

  it("revokeApiKey marks key as inactive", async () => {
    const prisma = createPrismaMock()
    prisma.apiKey.update.mockResolvedValue({})

    const service = new ApiKeyManagementService(prisma as never, createConfigService() as never)
    await service.revokeApiKey("k1")

    expect(prisma.apiKey.update).toHaveBeenCalledWith({
      where: { id: "k1" },
      data: {
        isActive: false,
        revokedAt: expect.any(Number),
      },
    })
  })

  it("validateApiKey returns false when no key found at all", async () => {
    const prisma = createPrismaMock()
    prisma.apiKey.findFirst.mockResolvedValue(null)

    const service = new ApiKeyManagementService(prisma as never, createConfigService() as never)
    const result = await service.validateApiKey("sk_unknown", "versions:read")

    expect(result).toBe(false)
  })

  it("validates api key with projectKey scope via project lookup", async () => {
    const prisma = createPrismaMock()
    prisma.apiKey.findFirst.mockResolvedValue({
      id: "k1",
      scopes: ["versions:read"],
      allProjects: false,
      projectIds: ["my-app"],
    })
    prisma.apiKey.update.mockResolvedValue({})
    prisma.project.findUnique.mockResolvedValue({ projectKey: "my-app" })

    const service = new ApiKeyManagementService(prisma as never, createConfigService() as never)
    const valid = await service.validateApiKey("sk_live_demo", "versions:read", {
      projectKey: "my-app",
    })

    expect(valid).toBe(true)
  })

  it("rejects api key with project-limited scope and no project context", async () => {
    const prisma = createPrismaMock()
    prisma.apiKey.findFirst.mockResolvedValue({
      id: "k1",
      scopes: ["versions:read"],
      allProjects: false,
      projectIds: ["proj"],
    })

    const service = new ApiKeyManagementService(prisma as never, createConfigService() as never)
    const valid = await service.validateApiKey("sk_live_demo", "versions:read")

    expect(valid).toBe(false)
  })
})
