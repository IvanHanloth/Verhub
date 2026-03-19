import { ConflictException, NotFoundException } from "@nestjs/common"

import { VersionsService } from "./versions.service"

function createPrismaMock() {
  return {
    project: {
      findUnique: jest.fn(),
    },
    version: {
      count: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    $transaction: jest.fn(),
  }
}

describe("VersionsService", () => {
  it("throws when project does not exist", async () => {
    const prisma = createPrismaMock()
    prisma.project.findUnique.mockResolvedValue(null)

    const service = new VersionsService(prisma as never)

    await expect(service.findAll("missing-project", { limit: 10, offset: 0 })).rejects.toBeInstanceOf(NotFoundException)
  })

  it("creates version with normalized platform", async () => {
    const prisma = createPrismaMock()
    prisma.project.findUnique.mockResolvedValue({ id: "project-1" })
    prisma.version.create.mockResolvedValue({
      id: "version-1",
      version: "1.0.0",
      title: "First Release",
      content: "stable release",
      downloadUrl: "https://example.com/app",
      forced: false,
      platform: "IOS",
      customData: { build: "100" },
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
    })

    const service = new VersionsService(prisma as never)
    const result = await service.create("project-1", {
      version: "1.0.0",
      title: "First Release",
      content: "stable release",
      download_url: "https://example.com/app",
      forced: false,
      platform: "ios",
      custom_data: { build: "100" },
    })

    expect(prisma.version.create).toHaveBeenCalledWith({
      data: {
        projectId: "project-1",
        version: "1.0.0",
        title: "First Release",
        content: "stable release",
        downloadUrl: "https://example.com/app",
        forced: false,
        platform: "IOS",
        customData: { build: "100" },
      },
    })

    expect(result.platform).toBe("ios")
    expect(result.created_at).toBe("2026-01-01T00:00:00.000Z")
  })

  it("throws when version does not exist in project", async () => {
    const prisma = createPrismaMock()
    prisma.version.findFirst.mockResolvedValue(null)

    const service = new VersionsService(prisma as never)

    await expect(service.findOne("project-1", "missing-version")).rejects.toBeInstanceOf(NotFoundException)
  })

  it("throws conflict for duplicate version in same project", async () => {
    const prisma = createPrismaMock()
    prisma.project.findUnique.mockResolvedValue({ id: "project-1" })
    prisma.version.create.mockRejectedValue({ code: "P2002" })

    const service = new VersionsService(prisma as never)

    await expect(
      service.create("project-1", {
        version: "1.0.0",
        title: undefined,
        content: undefined,
        download_url: "https://example.com/app",
        forced: false,
        platform: "web",
        custom_data: undefined,
      }),
    ).rejects.toBeInstanceOf(ConflictException)
  })
})
