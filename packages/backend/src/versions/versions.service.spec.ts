import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common"

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
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      updateMany: jest.fn(),
    },
    $transaction: jest.fn(),
  }
}

describe("VersionsService", () => {
  it("throws when project does not exist", async () => {
    const prisma = createPrismaMock()
    prisma.project.findUnique.mockResolvedValue(null)

    const service = new VersionsService(prisma as never)

    await expect(
      service.findAll("missing-project", { limit: 10, offset: 0 }),
    ).rejects.toBeInstanceOf(NotFoundException)
  })

  it("creates version with normalized platform", async () => {
    const prisma = createPrismaMock()
    prisma.project.findUnique.mockResolvedValue({ projectKey: "project-1" })
    prisma.version.create.mockResolvedValue({
      id: "version-1",
      version: "1.0.0",
      comparableVersion: "1.0.0",
      title: "First Release",
      content: "stable release",
      downloadUrl: "https://example.com/app",
      downloadLinks: [{ url: "https://example.com/app", name: "Installer", platform: "web" }],
      forced: false,
      platform: "IOS",
      customData: { build: "100" },
      isLatest: true,
      isPreview: false,
      isMilestone: false,
      isDeprecated: false,
      publishedAt: 1767225600,
      createdAt: 1767225600,
    })

    prisma.version.updateMany.mockResolvedValue({ count: 1 })

    const service = new VersionsService(prisma as never)
    const result = await service.create("project-1", {
      version: "1.0.0",
      comparable_version: "1.0.0",
      title: "First Release",
      content: "stable release",
      download_url: "https://example.com/app",
      download_links: [{ url: "https://example.com/app", name: "Installer", platform: "web" }],
      platform: "ios",
      custom_data: { build: "100" },
    })

    expect(prisma.version.create).toHaveBeenCalledWith({
      data: {
        projectKey: "project-1",
        version: "1.0.0",
        comparableVersion: "1.0.0",
        title: "First Release",
        content: "stable release",
        downloadUrl: "https://example.com/app",
        downloadLinks: [{ url: "https://example.com/app", name: "Installer", platform: "web" }],
        forced: false,
        isMilestone: false,
        isDeprecated: false,
        platform: "IOS",
        platforms: ["IOS"],
        customData: { build: "100" },
        isLatest: true,
        isPreview: false,
        publishedAt: expect.any(Number),
      },
    })

    expect(result.platform).toBe("ios")
    expect(result.comparable_version).toBe("1.0.0")
    expect(result.download_links).toEqual([
      { url: "https://example.com/app", name: "Installer", platform: "web" },
    ])
    expect(result.is_latest).toBe(true)
    expect(result.is_preview).toBe(false)
    expect(result.published_at).toBe(1767225600)
  })

  it("throws when version does not exist in project", async () => {
    const prisma = createPrismaMock()
    prisma.version.findFirst.mockResolvedValue(null)

    const service = new VersionsService(prisma as never)

    await expect(service.findOne("project-1", "missing-version")).rejects.toBeInstanceOf(
      NotFoundException,
    )
  })

  it("throws conflict for duplicate version in same project", async () => {
    const prisma = createPrismaMock()
    prisma.project.findUnique.mockResolvedValue({ projectKey: "project-1" })
    prisma.version.create.mockRejectedValue({ code: "P2002" })

    const service = new VersionsService(prisma as never)

    await expect(
      service.create("project-1", {
        version: "1.0.0",
        comparable_version: "1.0.0",
        title: undefined,
        content: undefined,
        download_url: undefined,
        platform: "web",
        custom_data: undefined,
      }),
    ).rejects.toBeInstanceOf(ConflictException)
  })

  it("allows creating version without download url", async () => {
    const prisma = createPrismaMock()
    prisma.project.findUnique.mockResolvedValue({ projectKey: "project-1" })
    prisma.version.create.mockResolvedValue({
      id: "version-2",
      version: "1.0.1",
      comparableVersion: "1.0.1",
      title: null,
      content: null,
      downloadUrl: null,
      downloadLinks: null,
      forced: false,
      platform: null,
      customData: null,
      isLatest: true,
      isPreview: false,
      isMilestone: false,
      isDeprecated: false,
      publishedAt: 1767225600,
      createdAt: 1767225600,
    })

    prisma.version.updateMany.mockResolvedValue({ count: 0 })

    const service = new VersionsService(prisma as never)
    const result = await service.create("project-1", {
      version: "1.0.1",
      comparable_version: "1.0.1",
      title: undefined,
      content: undefined,
      download_url: undefined,
      platform: undefined,
      custom_data: undefined,
    })

    expect(prisma.version.create).toHaveBeenCalledWith({
      data: {
        projectKey: "project-1",
        version: "1.0.1",
        comparableVersion: "1.0.1",
        title: undefined,
        content: undefined,
        downloadUrl: undefined,
        downloadLinks: undefined,
        forced: false,
        isMilestone: false,
        isDeprecated: false,
        platform: undefined,
        platforms: [],
        customData: undefined,
        isLatest: true,
        isPreview: false,
        publishedAt: expect.any(Number),
      },
    })
    expect(result.download_url).toBeNull()
    expect(result.download_links).toEqual([])
  })

  it("marks explicit preview version as non-latest", async () => {
    const prisma = createPrismaMock()
    prisma.project.findUnique.mockResolvedValue({ projectKey: "project-1" })
    prisma.version.create.mockResolvedValue({
      id: "version-preview",
      version: "2.0.0-beta.1",
      comparableVersion: "2.0.0-beta.1",
      title: "Preview",
      content: null,
      downloadUrl: null,
      downloadLinks: null,
      forced: false,
      platform: "WEB",
      customData: null,
      isLatest: false,
      isPreview: true,
      isMilestone: false,
      isDeprecated: false,
      publishedAt: 1767225600,
      createdAt: 1767225600,
    })

    const service = new VersionsService(prisma as never)
    await service.create("project-1", {
      version: "2.0.0-beta.1",
      comparable_version: "2.0.0-beta.1",
      is_preview: true,
    })

    expect(prisma.version.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          isLatest: false,
          isPreview: true,
          isMilestone: false,
          isDeprecated: false,
        }),
      }),
    )
  })

  // ── getStatistics ──

  it("getStatistics returns aggregated metrics", async () => {
    const prisma = createPrismaMock()
    prisma.version.count.mockResolvedValueOnce(10).mockResolvedValueOnce(2)
    prisma.version.findMany.mockResolvedValue([
      { projectKey: "a" },
      { projectKey: "b" },
      { projectKey: "c" },
    ])
    prisma.version.findFirst
      .mockResolvedValueOnce({ createdAt: 9999 })
      .mockResolvedValueOnce({ createdAt: 1000 })

    const service = new VersionsService(prisma as never)
    const stats = await service.getStatistics()

    expect(stats.total_versions).toBe(10)
    expect(stats.total_projects).toBe(3)
    expect(stats.forced_versions).toBe(2)
    expect(stats.latest_version_time).toBe(9999)
    expect(stats.first_version_time).toBe(1000)
  })

  it("getStatistics returns null times when no versions", async () => {
    const prisma = createPrismaMock()
    prisma.version.count.mockResolvedValue(0)
    prisma.version.findMany.mockResolvedValue([])
    prisma.version.findFirst.mockResolvedValue(null)

    const service = new VersionsService(prisma as never)
    const stats = await service.getStatistics()

    expect(stats.latest_version_time).toBeNull()
    expect(stats.first_version_time).toBeNull()
  })

  // ── findAll ──

  it("findAll returns paginated versions", async () => {
    const prisma = createPrismaMock()
    prisma.project.findUnique.mockResolvedValue({ projectKey: "proj" })
    prisma.$transaction.mockResolvedValue([
      1,
      [
        {
          id: "v1",
          version: "1.0.0",
          comparableVersion: "1.0.0",
          title: null,
          content: null,
          downloadUrl: null,
          downloadLinks: null,
          forced: false,
          platform: null,
          customData: null,
          isLatest: true,
          isPreview: false,
          isMilestone: false,
          isDeprecated: false,
          publishedAt: 1000,
          createdAt: 1000,
        },
      ],
    ])

    const service = new VersionsService(prisma as never)
    const result = await service.findAll("proj", { limit: 10, offset: 0 })

    expect(result.total).toBe(1)
    expect(result.data[0].version).toBe("1.0.0")
  })

  // ── findOneById ──

  it("findOneById returns version", async () => {
    const prisma = createPrismaMock()
    prisma.version.findUnique.mockResolvedValue({
      id: "v1",
      version: "1.0.0",
      comparableVersion: "1.0.0",
      title: null,
      content: null,
      downloadUrl: null,
      downloadLinks: null,
      forced: false,
      platform: null,
      customData: null,
      isLatest: true,
      isPreview: false,
      isMilestone: false,
      isDeprecated: false,
      publishedAt: 1000,
      createdAt: 1000,
    })

    const service = new VersionsService(prisma as never)
    const result = await service.findOneById("v1")

    expect(result.id).toBe("v1")
  })

  it("findOneById throws when not found", async () => {
    const prisma = createPrismaMock()
    prisma.version.findUnique.mockResolvedValue(null)

    const service = new VersionsService(prisma as never)
    await expect(service.findOneById("missing")).rejects.toBeInstanceOf(NotFoundException)
  })

  // ── findLatestByProjectKey ──

  it("findLatestByProjectKey returns isLatest version", async () => {
    const prisma = createPrismaMock()
    prisma.project.findUnique.mockResolvedValue({ projectKey: "proj" })
    prisma.version.findFirst.mockResolvedValue({
      id: "v1",
      version: "2.0.0",
      comparableVersion: "2.0.0",
      title: null,
      content: null,
      downloadUrl: null,
      downloadLinks: null,
      forced: false,
      platform: null,
      customData: null,
      isLatest: true,
      isPreview: false,
      isMilestone: false,
      isDeprecated: false,
      publishedAt: 2000,
      createdAt: 2000,
    })

    const service = new VersionsService(prisma as never)
    const result = await service.findLatestByProjectKey("proj")

    expect(result.version).toBe("2.0.0")
  })

  it("findLatestByProjectKey falls back to stable when no isLatest", async () => {
    const prisma = createPrismaMock()
    prisma.project.findUnique.mockResolvedValue({ projectKey: "proj" })
    prisma.version.findFirst
      .mockResolvedValueOnce(null) // first call: isLatest=true → null
      .mockResolvedValueOnce({
        // second call: fallback stable
        id: "v2",
        version: "1.5.0",
        comparableVersion: "1.5.0",
        title: null,
        content: null,
        downloadUrl: null,
        downloadLinks: null,
        forced: false,
        platform: null,
        customData: null,
        isLatest: false,
        isPreview: false,
        isMilestone: false,
        isDeprecated: false,
        publishedAt: 1500,
        createdAt: 1500,
      })

    const service = new VersionsService(prisma as never)
    const result = await service.findLatestByProjectKey("proj")

    expect(result.version).toBe("1.5.0")
  })

  it("findLatestByProjectKey falls back to any version", async () => {
    const prisma = createPrismaMock()
    prisma.project.findUnique.mockResolvedValue({ projectKey: "proj" })
    prisma.version.findFirst
      .mockResolvedValueOnce(null) // isLatest=true
      .mockResolvedValueOnce(null) // isPreview=false
      .mockResolvedValueOnce({
        // any version
        id: "v3",
        version: "3.0.0-beta",
        comparableVersion: "3.0.0-beta",
        title: null,
        content: null,
        downloadUrl: null,
        downloadLinks: null,
        forced: false,
        platform: null,
        customData: null,
        isLatest: false,
        isPreview: true,
        isMilestone: false,
        isDeprecated: false,
        publishedAt: 3000,
        createdAt: 3000,
      })

    const service = new VersionsService(prisma as never)
    const result = await service.findLatestByProjectKey("proj")

    expect(result.version).toBe("3.0.0-beta")
  })

  it("findLatestByProjectKey throws when project missing", async () => {
    const prisma = createPrismaMock()
    prisma.project.findUnique.mockResolvedValue(null)

    const service = new VersionsService(prisma as never)
    await expect(service.findLatestByProjectKey("missing")).rejects.toBeInstanceOf(
      NotFoundException,
    )
  })

  it("findLatestByProjectKey throws when no versions at all", async () => {
    const prisma = createPrismaMock()
    prisma.project.findUnique.mockResolvedValue({ projectKey: "proj" })
    prisma.version.findFirst.mockResolvedValue(null)

    const service = new VersionsService(prisma as never)
    await expect(service.findLatestByProjectKey("proj")).rejects.toBeInstanceOf(NotFoundException)
  })

  // ── findLatestPreviewByProjectKey ──

  it("findLatestPreviewByProjectKey returns preview", async () => {
    const prisma = createPrismaMock()
    prisma.project.findUnique.mockResolvedValue({ projectKey: "proj" })
    prisma.version.findFirst.mockResolvedValue({
      id: "vp",
      version: "2.0.0-beta",
      comparableVersion: "2.0.0-beta",
      title: null,
      content: null,
      downloadUrl: null,
      downloadLinks: null,
      forced: false,
      platform: null,
      customData: null,
      isLatest: false,
      isPreview: true,
      isMilestone: false,
      isDeprecated: false,
      publishedAt: 2000,
      createdAt: 2000,
    })

    const service = new VersionsService(prisma as never)
    const result = await service.findLatestPreviewByProjectKey("proj")

    expect(result?.version).toBe("2.0.0-beta")
  })

  it("findLatestPreviewByProjectKey returns null when no preview", async () => {
    const prisma = createPrismaMock()
    prisma.project.findUnique.mockResolvedValue({ projectKey: "proj" })
    prisma.version.findFirst.mockResolvedValue(null)

    const service = new VersionsService(prisma as never)
    const result = await service.findLatestPreviewByProjectKey("proj")

    expect(result).toBeNull()
  })

  // ── findByVersionNumber ──

  it("findByVersionNumber exact match", async () => {
    const prisma = createPrismaMock()
    prisma.project.findUnique.mockResolvedValue({ projectKey: "proj" })
    prisma.version.findFirst.mockResolvedValue({
      id: "v1",
      version: "1.2.3",
      comparableVersion: "1.2.3",
      title: null,
      content: null,
      downloadUrl: null,
      downloadLinks: null,
      forced: false,
      platform: null,
      customData: null,
      isLatest: false,
      isPreview: false,
      isMilestone: false,
      isDeprecated: false,
      publishedAt: 1000,
      createdAt: 1000,
    })

    const service = new VersionsService(prisma as never)
    const result = await service.findByVersionNumber("proj", "1.2.3")

    expect(result.version).toBe("1.2.3")
  })

  it("findByVersionNumber supports comparableVersion lookup", async () => {
    const prisma = createPrismaMock()
    prisma.project.findUnique.mockResolvedValue({ projectKey: "proj" })
    prisma.version.findFirst.mockResolvedValue({
      comparableVersion: "1.2.3",
      id: "v1",
      version: "v1.2.3",
      title: null,
      content: null,
      downloadUrl: null,
      downloadLinks: null,
      forced: false,
      platform: null,
      customData: null,
      isLatest: false,
      isPreview: false,
      isMilestone: false,
      isDeprecated: false,
      publishedAt: 1000,
      createdAt: 1000,
    })

    const service = new VersionsService(prisma as never)
    const result = await service.findByVersionNumber("proj", "1.2.3")

    expect(result.version).toBe("v1.2.3")
  })

  it("findByVersionNumber throws when no match", async () => {
    const prisma = createPrismaMock()
    prisma.project.findUnique.mockResolvedValue({ projectKey: "proj" })
    prisma.version.findFirst.mockResolvedValue(null)
    prisma.version.findMany.mockResolvedValue([])

    const service = new VersionsService(prisma as never)
    await expect(service.findByVersionNumber("proj", "9.9.9")).rejects.toBeInstanceOf(
      NotFoundException,
    )
  })

  // ── update ──

  it("update modifies a version", async () => {
    const prisma = createPrismaMock()
    prisma.version.findFirst.mockResolvedValue({
      id: "v1",
      projectKey: "proj",
      isLatest: true,
      isPreview: false,
      downloadUrl: "https://old.com",
      downloadLinks: [{ url: "https://old.com" }],
    })
    prisma.version.update.mockResolvedValue({
      id: "v1",
      version: "1.0.1",
      comparableVersion: "1.0.1",
      title: "Updated",
      content: null,
      downloadUrl: "https://new.com",
      downloadLinks: [{ url: "https://new.com" }],
      forced: false,
      platform: null,
      customData: null,
      isLatest: true,
      isPreview: false,
      isMilestone: false,
      isDeprecated: false,
      publishedAt: 1000,
      createdAt: 1000,
    })
    prisma.version.updateMany.mockResolvedValue({ count: 0 })
    prisma.version.count.mockResolvedValue(5)

    const service = new VersionsService(prisma as never)
    const result = await service.update("proj", "v1", {
      title: "Updated",
      download_url: "https://new.com",
    })

    expect(result.title).toBe("Updated")
  })

  it("update throws when version not found", async () => {
    const prisma = createPrismaMock()
    prisma.version.findFirst.mockResolvedValue(null)

    const service = new VersionsService(prisma as never)
    await expect(service.update("proj", "missing", { title: "x" })).rejects.toBeInstanceOf(
      NotFoundException,
    )
  })

  it("update throws conflict on duplicate version", async () => {
    const prisma = createPrismaMock()
    prisma.version.findFirst.mockResolvedValue({
      id: "v1",
      projectKey: "proj",
      isLatest: false,
      isPreview: false,
      downloadUrl: null,
      downloadLinks: null,
      version: "1.0.0",
    })
    prisma.version.count.mockResolvedValue(5)
    prisma.version.update.mockRejectedValue({ code: "P2002" })

    const service = new VersionsService(prisma as never)
    await expect(service.update("proj", "v1", { version: "2.0.0" })).rejects.toBeInstanceOf(
      ConflictException,
    )
  })

  // ── updateById ──

  it("updateById delegates to update", async () => {
    const prisma = createPrismaMock()
    prisma.version.findUnique.mockResolvedValue({ id: "v1", projectKey: "proj" })
    prisma.version.findFirst.mockResolvedValue({
      id: "v1",
      projectKey: "proj",
      isLatest: false,
      isPreview: false,
      downloadUrl: null,
      downloadLinks: null,
    })
    prisma.version.count.mockResolvedValue(5)
    prisma.version.update.mockResolvedValue({
      id: "v1",
      version: "1.0.0",
      comparableVersion: "1.0.0",
      title: "Changed",
      content: null,
      downloadUrl: null,
      downloadLinks: null,
      forced: false,
      platform: null,
      customData: null,
      isLatest: false,
      isPreview: false,
      isMilestone: false,
      isDeprecated: false,
      publishedAt: 1000,
      createdAt: 1000,
    })

    const service = new VersionsService(prisma as never)
    const result = await service.updateById("v1", { title: "Changed" })

    expect(result.title).toBe("Changed")
  })

  it("updateById throws when not found", async () => {
    const prisma = createPrismaMock()
    prisma.version.findUnique.mockResolvedValue(null)

    const service = new VersionsService(prisma as never)
    await expect(service.updateById("missing", { title: "x" })).rejects.toBeInstanceOf(
      NotFoundException,
    )
  })

  // ── remove / removeById ──

  it("remove deletes a version", async () => {
    const prisma = createPrismaMock()
    prisma.version.findFirst.mockResolvedValue({ id: "v1" })
    prisma.version.delete.mockResolvedValue({})

    const service = new VersionsService(prisma as never)
    await service.remove("proj", "v1")

    expect(prisma.version.delete).toHaveBeenCalledWith({ where: { id: "v1" } })
  })

  it("remove throws when not found", async () => {
    const prisma = createPrismaMock()
    prisma.version.findFirst.mockResolvedValue(null)

    const service = new VersionsService(prisma as never)
    await expect(service.remove("proj", "missing")).rejects.toBeInstanceOf(NotFoundException)
  })

  it("removeById delegates to remove", async () => {
    const prisma = createPrismaMock()
    prisma.version.findUnique.mockResolvedValue({ id: "v1", projectKey: "proj" })
    prisma.version.findFirst.mockResolvedValue({ id: "v1" })
    prisma.version.delete.mockResolvedValue({})

    const service = new VersionsService(prisma as never)
    await service.removeById("v1")

    expect(prisma.version.delete).toHaveBeenCalled()
  })

  it("removeById throws when not found", async () => {
    const prisma = createPrismaMock()
    prisma.version.findUnique.mockResolvedValue(null)

    const service = new VersionsService(prisma as never)
    await expect(service.removeById("missing")).rejects.toBeInstanceOf(NotFoundException)
  })

  // ── getStatus ──

  it("getStatus returns module info", () => {
    const prisma = createPrismaMock()
    const service = new VersionsService(prisma as never)
    expect(service.getStatus()).toEqual({ module: "versions", implemented: true })
  })

  // ── validateVersionRules ──

  it("throws when latest version is deprecated", async () => {
    const prisma = createPrismaMock()
    prisma.project.findUnique.mockResolvedValue({ projectKey: "proj" })

    const service = new VersionsService(prisma as never)
    await expect(
      service.create("proj", {
        version: "1.0.0",
        comparable_version: "1.0.0",
        is_latest: true,
        is_deprecated: true,
      }),
    ).rejects.toBeInstanceOf(BadRequestException)
  })

  it("throws when deprecating last non-deprecated version", async () => {
    const prisma = createPrismaMock()
    prisma.project.findUnique.mockResolvedValue({ projectKey: "proj" })
    prisma.version.findMany.mockResolvedValue([])

    const service = new VersionsService(prisma as never)
    await expect(
      service.create("proj", {
        version: "1.0.0",
        comparable_version: "1.0.0",
        is_deprecated: true,
      }),
    ).rejects.toBeInstanceOf(BadRequestException)
  })

  it("throws when creating a deprecated version without newer stable upgrade target", async () => {
    const prisma = createPrismaMock()
    prisma.project.findUnique.mockResolvedValue({ projectKey: "proj" })
    prisma.version.findMany.mockResolvedValue([])

    const service = new VersionsService(prisma as never)
    await expect(
      service.create("proj", {
        version: "1.0.0",
        comparable_version: "1.0.0",
        is_deprecated: true,
      }),
    ).rejects.toBeInstanceOf(BadRequestException)
  })

  it("throws when updating a latest version to deprecated without explicitly unsetting latest", async () => {
    const prisma = createPrismaMock()
    prisma.version.findFirst.mockResolvedValue({
      id: "v1",
      projectKey: "proj",
      version: "1.0.0",
      comparableVersion: "1.0.0",
      isLatest: true,
      isPreview: false,
      isDeprecated: false,
      downloadUrl: null,
      downloadLinks: null,
    })
    prisma.version.findMany.mockResolvedValue([
      {
        comparableVersion: "2.0.0",
      },
    ])

    const service = new VersionsService(prisma as never)
    await expect(service.update("proj", "v1", { is_deprecated: true })).rejects.toBeInstanceOf(
      BadRequestException,
    )
  })

  // ── ensureLatestForProject ──

  it("update promotes next version to latest when unsetting isLatest", async () => {
    const prisma = createPrismaMock()
    prisma.version.findFirst
      .mockResolvedValueOnce({
        // version to update
        id: "v1",
        projectKey: "proj",
        isLatest: true,
        isPreview: false,
        downloadUrl: null,
        downloadLinks: null,
        version: "1.0.0",
      })
      .mockResolvedValueOnce({ id: "v2" }) // nextLatest
    prisma.version.count.mockResolvedValue(5)
    prisma.version.update
      .mockResolvedValueOnce({
        // main update
        id: "v1",
        version: "1.0.0",
        comparableVersion: "1.0.0",
        title: null,
        content: null,
        downloadUrl: null,
        downloadLinks: null,
        forced: false,
        platform: null,
        customData: null,
        isLatest: false,
        isPreview: false,
        isMilestone: false,
        isDeprecated: false,
        publishedAt: 1000,
        createdAt: 1000,
      })
      .mockResolvedValueOnce({}) // promote next

    const service = new VersionsService(prisma as never)
    await service.update("proj", "v1", { is_latest: false })

    // Should have promoted another version to latest
    expect(prisma.version.update).toHaveBeenCalledTimes(2)
  })
})
