import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common"
import { makeResolver } from "../../test/project-resolver.testkit"

import { VersionsService } from "./versions.service"
import { toComparableVersionSortKey } from "./version-comparator"

function createPrismaMock() {
  const mock = {
    project: {
      findUnique: jest.fn(),
    },
    version: {
      count: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      groupBy: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      updateMany: jest.fn(),
    },
    projectLocale: {
      findMany: jest
        .fn()
        .mockResolvedValue([{ locale: "en", aliases: ["en-US"], label: "English" }]),
    },
    $transaction: jest.fn(),
  }

  // 交互式事务（回调形态）默认用 mock 自身当 tx 直接执行回调；数组形态（findAll）
  // 仍由各用例用 mockResolvedValue 覆盖。
  mock.$transaction.mockImplementation((arg: unknown) =>
    typeof arg === "function" ? (arg as (tx: typeof mock) => unknown)(mock) : Promise.resolve(arg),
  )

  return mock
}

function buildVersionRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: "v1",
    projectKey: "proj",
    version: "1.0.0",
    comparableVersion: "1.0.0",
    title: null,
    content: null,
    downloadUrl: null,
    downloadLinks: null,
    forced: false,
    platform: null,
    platforms: [],
    customData: null,
    isLatest: false,
    isPreview: false,
    isMilestone: false,
    isDeprecated: false,
    publishedAt: 1000,
    createdAt: 1000,
    ...overrides,
  }
}

describe("VersionsService", () => {
  it("throws when project does not exist", async () => {
    const prisma = createPrismaMock()
    prisma.project.findUnique.mockResolvedValue(null)

    const service = new VersionsService(prisma as never, makeResolver(prisma))

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

    const service = new VersionsService(prisma as never, makeResolver(prisma))
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
        comparableVersionSort: toComparableVersionSortKey("1.0.0"),
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
      include: { translations: true },
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

    const service = new VersionsService(prisma as never, makeResolver(prisma))

    await expect(service.findOne("project-1", "missing-version")).rejects.toBeInstanceOf(
      NotFoundException,
    )
  })

  it("throws conflict for duplicate version in same project", async () => {
    const prisma = createPrismaMock()
    prisma.project.findUnique.mockResolvedValue({ projectKey: "project-1" })
    prisma.version.create.mockRejectedValue({ code: "P2002" })

    const service = new VersionsService(prisma as never, makeResolver(prisma))

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

    const service = new VersionsService(prisma as never, makeResolver(prisma))
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
        comparableVersionSort: toComparableVersionSortKey("1.0.1"),
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
      include: { translations: true },
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

    const service = new VersionsService(prisma as never, makeResolver(prisma))
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
    prisma.version.groupBy.mockResolvedValue([
      { projectKey: "a" },
      { projectKey: "b" },
      { projectKey: "c" },
    ])
    prisma.version.findFirst
      .mockResolvedValueOnce({ createdAt: 9999 })
      .mockResolvedValueOnce({ createdAt: 1000 })

    const service = new VersionsService(prisma as never, makeResolver(prisma))
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
    prisma.version.groupBy.mockResolvedValue([])
    prisma.version.findFirst.mockResolvedValue(null)

    const service = new VersionsService(prisma as never, makeResolver(prisma))
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

    const service = new VersionsService(prisma as never, makeResolver(prisma))
    const result = await service.findAll("proj", { limit: 10, offset: 0 })

    expect(result.total).toBe(1)
    expect(result.data[0]?.version).toBe("1.0.0")
  })

  it("findAll narrows by keyword, platform and status flags", async () => {
    const prisma = createPrismaMock()
    prisma.project.findUnique.mockResolvedValue({ projectKey: "proj" })
    prisma.$transaction.mockResolvedValue([0, []])

    const service = new VersionsService(prisma as never, makeResolver(prisma))
    await service.findAll("proj", {
      limit: 10,
      offset: 0,
      search: "1.2",
      platform: "android",
      is_preview: false,
    })

    const where = prisma.version.count.mock.calls[0]?.[0]?.where as {
      isPreview?: boolean
      AND?: Array<{ OR?: Array<Record<string, unknown>> }>
    }
    expect(where.isPreview).toBe(false)
    // 平台与关键字各是一组 OR，必须分别落在 AND 数组里，不能互相覆盖。
    expect(where.AND).toHaveLength(2)
    expect(where.AND?.[0]?.OR).toContainEqual({ platforms: { has: "ANDROID" } })
    expect(where.AND?.[1]?.OR).toContainEqual({
      version: { contains: "1.2", mode: "insensitive" },
    })
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

    const service = new VersionsService(prisma as never, makeResolver(prisma))
    const result = await service.findOneById("v1")

    expect(result.id).toBe("v1")
  })

  it("findOneById throws when not found", async () => {
    const prisma = createPrismaMock()
    prisma.version.findUnique.mockResolvedValue(null)

    const service = new VersionsService(prisma as never, makeResolver(prisma))
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

    const service = new VersionsService(prisma as never, makeResolver(prisma))
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

    const service = new VersionsService(prisma as never, makeResolver(prisma))
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

    const service = new VersionsService(prisma as never, makeResolver(prisma))
    const result = await service.findLatestByProjectKey("proj")

    expect(result.version).toBe("3.0.0-beta")
  })

  it("findLatestByProjectKey throws when project missing", async () => {
    const prisma = createPrismaMock()
    prisma.project.findUnique.mockResolvedValue(null)

    const service = new VersionsService(prisma as never, makeResolver(prisma))
    await expect(service.findLatestByProjectKey("missing")).rejects.toBeInstanceOf(
      NotFoundException,
    )
  })

  it("findLatestByProjectKey throws when no versions at all", async () => {
    const prisma = createPrismaMock()
    prisma.project.findUnique.mockResolvedValue({ projectKey: "proj" })
    prisma.version.findFirst.mockResolvedValue(null)

    const service = new VersionsService(prisma as never, makeResolver(prisma))
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

    const service = new VersionsService(prisma as never, makeResolver(prisma))
    const result = await service.findLatestPreviewByProjectKey("proj")

    expect(result?.version).toBe("2.0.0-beta")
  })

  it("findLatestPreviewByProjectKey returns null when no preview", async () => {
    const prisma = createPrismaMock()
    prisma.project.findUnique.mockResolvedValue({ projectKey: "proj" })
    prisma.version.findFirst.mockResolvedValue(null)

    const service = new VersionsService(prisma as never, makeResolver(prisma))
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

    const service = new VersionsService(prisma as never, makeResolver(prisma))
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

    const service = new VersionsService(prisma as never, makeResolver(prisma))
    const result = await service.findByVersionNumber("proj", "1.2.3")

    expect(result.version).toBe("v1.2.3")
  })

  it("findByVersionNumber throws when no match", async () => {
    const prisma = createPrismaMock()
    prisma.project.findUnique.mockResolvedValue({ projectKey: "proj" })
    prisma.version.findFirst.mockResolvedValue(null)
    prisma.version.findMany.mockResolvedValue([])

    const service = new VersionsService(prisma as never, makeResolver(prisma))
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

    const service = new VersionsService(prisma as never, makeResolver(prisma))
    const result = await service.update("proj", "v1", {
      title: "Updated",
      download_url: "https://new.com",
    })

    expect(result.title).toBe("Updated")
  })

  it("update throws when version not found", async () => {
    const prisma = createPrismaMock()
    prisma.version.findFirst.mockResolvedValue(null)

    const service = new VersionsService(prisma as never, makeResolver(prisma))
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

    const service = new VersionsService(prisma as never, makeResolver(prisma))
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

    const service = new VersionsService(prisma as never, makeResolver(prisma))
    const result = await service.updateById("v1", { title: "Changed" })

    expect(result.title).toBe("Changed")
  })

  it("updateById throws when not found", async () => {
    const prisma = createPrismaMock()
    prisma.version.findUnique.mockResolvedValue(null)

    const service = new VersionsService(prisma as never, makeResolver(prisma))
    await expect(service.updateById("missing", { title: "x" })).rejects.toBeInstanceOf(
      NotFoundException,
    )
  })

  // ── remove / removeById ──

  it("remove deletes a version", async () => {
    const prisma = createPrismaMock()
    prisma.version.findFirst.mockResolvedValue({ id: "v1" })
    prisma.version.delete.mockResolvedValue({})

    const service = new VersionsService(prisma as never, makeResolver(prisma))
    await service.remove("proj", "v1")

    expect(prisma.version.delete).toHaveBeenCalledWith({ where: { id: "v1" } })
  })

  it("remove throws when not found", async () => {
    const prisma = createPrismaMock()
    prisma.version.findFirst.mockResolvedValue(null)

    const service = new VersionsService(prisma as never, makeResolver(prisma))
    await expect(service.remove("proj", "missing")).rejects.toBeInstanceOf(NotFoundException)
  })

  it("removeById delegates to remove", async () => {
    const prisma = createPrismaMock()
    prisma.version.findUnique.mockResolvedValue({ id: "v1", projectKey: "proj" })
    prisma.version.findFirst.mockResolvedValue({ id: "v1" })
    prisma.version.delete.mockResolvedValue({})

    const service = new VersionsService(prisma as never, makeResolver(prisma))
    await service.removeById("v1")

    expect(prisma.version.delete).toHaveBeenCalled()
  })

  it("removeById throws when not found", async () => {
    const prisma = createPrismaMock()
    prisma.version.findUnique.mockResolvedValue(null)

    const service = new VersionsService(prisma as never, makeResolver(prisma))
    await expect(service.removeById("missing")).rejects.toBeInstanceOf(NotFoundException)
  })

  // ── getStatus ──

  it("getStatus returns module info", () => {
    const prisma = createPrismaMock()
    const service = new VersionsService(prisma as never, makeResolver(prisma))
    expect(service.getStatus()).toEqual({ module: "versions", implemented: true })
  })

  // ── validateVersionRules ──

  it("throws when latest version is deprecated", async () => {
    const prisma = createPrismaMock()
    prisma.project.findUnique.mockResolvedValue({ projectKey: "proj" })

    const service = new VersionsService(prisma as never, makeResolver(prisma))
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

    const service = new VersionsService(prisma as never, makeResolver(prisma))
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

    const service = new VersionsService(prisma as never, makeResolver(prisma))
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

    const service = new VersionsService(prisma as never, makeResolver(prisma))
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

    const service = new VersionsService(prisma as never, makeResolver(prisma))
    await service.update("proj", "v1", { is_latest: false })

    // Should have promoted another version to latest
    expect(prisma.version.update).toHaveBeenCalledTimes(2)
  })

  it("update clears download url when explicitly set to null", async () => {
    const prisma = createPrismaMock()
    prisma.version.findFirst.mockResolvedValue({
      id: "v1",
      projectKey: "proj",
      version: "1.0.0",
      comparableVersion: "1.0.0",
      isLatest: false,
      isPreview: false,
      isDeprecated: false,
      downloadUrl: "https://old.com/app",
      downloadLinks: [{ url: "https://old.com/app" }],
    })
    prisma.version.update.mockResolvedValue(buildVersionRecord({ downloadUrl: null }))

    const service = new VersionsService(prisma as never, makeResolver(prisma))
    await service.update("proj", "v1", { download_url: null })

    expect(prisma.version.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ downloadUrl: null, downloadLinks: [] }),
      }),
    )
  })

  it("update keeps current download url when field is omitted", async () => {
    const prisma = createPrismaMock()
    prisma.version.findFirst.mockResolvedValue({
      id: "v1",
      projectKey: "proj",
      version: "1.0.0",
      comparableVersion: "1.0.0",
      isLatest: false,
      isPreview: false,
      isDeprecated: false,
      downloadUrl: "https://old.com/app",
      downloadLinks: [{ url: "https://old.com/app" }],
    })
    prisma.version.update.mockResolvedValue(buildVersionRecord())

    const service = new VersionsService(prisma as never, makeResolver(prisma))
    await service.update("proj", "v1", { title: "Renamed" })

    expect(prisma.version.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ downloadUrl: "https://old.com/app" }),
      }),
    )
  })
})

describe("VersionsService.upsertByVersion", () => {
  it("creates the version when the project has no version with that number", async () => {
    const prisma = createPrismaMock()
    prisma.project.findUnique.mockResolvedValue({ projectKey: "proj" })
    prisma.version.findUnique.mockResolvedValue(null)
    prisma.version.create.mockResolvedValue(buildVersionRecord({ version: "1.2.3" }))
    prisma.version.updateMany.mockResolvedValue({ count: 0 })

    const service = new VersionsService(prisma as never, makeResolver(prisma))
    const result = await service.upsertByVersion("proj", "1.2.3", { title: "Release" })

    expect(result.created).toBe(true)
    expect(prisma.version.create).toHaveBeenCalledWith(
      expect.objectContaining({
        // comparable_version is derived from the path segment when omitted
        data: expect.objectContaining({ version: "1.2.3", comparableVersion: "1.2.3" }),
      }),
    )
  })

  it("updates in place when the version already exists", async () => {
    const prisma = createPrismaMock()
    prisma.project.findUnique.mockResolvedValue({ projectKey: "proj" })
    prisma.version.findUnique.mockResolvedValue({ id: "v1" })
    prisma.version.findFirst.mockResolvedValue({
      id: "v1",
      projectKey: "proj",
      version: "1.2.3",
      comparableVersion: "1.2.3",
      isLatest: false,
      isPreview: false,
      isDeprecated: false,
      downloadUrl: null,
      downloadLinks: null,
    })
    prisma.version.update.mockResolvedValue(buildVersionRecord({ version: "1.2.3" }))

    const service = new VersionsService(prisma as never, makeResolver(prisma))
    const result = await service.upsertByVersion("proj", "1.2.3", { title: "Re-published" })

    expect(result.created).toBe(false)
    expect(prisma.version.create).not.toHaveBeenCalled()
    expect(prisma.version.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "v1" },
        data: expect.objectContaining({ title: "Re-published" }),
      }),
    )
  })

  it("rejects a body version that disagrees with the path", async () => {
    const prisma = createPrismaMock()
    const service = new VersionsService(prisma as never, makeResolver(prisma))

    await expect(
      service.upsertByVersion("proj", "1.2.3", { version: "9.9.9" }),
    ).rejects.toBeInstanceOf(BadRequestException)
    expect(prisma.version.create).not.toHaveBeenCalled()
  })

  it("throws when the project does not exist", async () => {
    const prisma = createPrismaMock()
    prisma.project.findUnique.mockResolvedValue(null)

    const service = new VersionsService(prisma as never, makeResolver(prisma))
    await expect(service.upsertByVersion("missing", "1.2.3", {})).rejects.toBeInstanceOf(
      NotFoundException,
    )
  })

  it("falls back to update when a concurrent publish wins the insert race", async () => {
    const prisma = createPrismaMock()
    prisma.project.findUnique.mockResolvedValue({ projectKey: "proj" })
    // Absent on first lookup, present once the racing writer has committed.
    prisma.version.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: "v1" })
    prisma.version.create.mockRejectedValue(
      Object.assign(new Error("unique"), { code: "P2002", name: "PrismaClientKnownRequestError" }),
    )
    prisma.version.findFirst.mockResolvedValue({
      id: "v1",
      projectKey: "proj",
      version: "1.2.3",
      comparableVersion: "1.2.3",
      isLatest: false,
      isPreview: false,
      isDeprecated: false,
      downloadUrl: null,
      downloadLinks: null,
    })
    prisma.version.update.mockResolvedValue(buildVersionRecord({ version: "1.2.3" }))

    const service = new VersionsService(prisma as never, makeResolver(prisma))
    const result = await service.upsertByVersion("proj", "1.2.3", { title: "Racy" })

    expect(result.created).toBe(false)
    expect(prisma.version.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "v1" } }),
    )
  })
  // ── 多语言 ──

  it("公开列表按请求语言覆盖标题与更新说明，locale 标出译文来源", async () => {
    const prisma = createPrismaMock()
    prisma.project.findUnique.mockResolvedValue({ projectKey: "proj" })
    prisma.$transaction.mockResolvedValueOnce([
      1,
      [
        buildVersionRecord({
          title: "新版本",
          content: "修了几个问题",
          translations: [{ locale: "en", title: "New release", content: "Bug fixes" }],
        }),
      ],
    ])

    const service = new VersionsService(prisma as never, makeResolver(prisma))
    const result = await service.findAllByProjectKey("proj", {
      limit: 10,
      offset: 0,
      locale: "en",
    } as never)

    expect(result.data[0]?.title).toBe("New release")
    expect(result.data[0]?.content).toBe("Bug fixes")
    expect(result.data[0]?.locale).toBe("en")
    // 公开端不带出全部译文，那是后台编辑才需要的
    expect(result.data[0]?.translations).toBeUndefined()
  })

  it("译文只覆盖标题时，更新说明回落默认内容", async () => {
    const prisma = createPrismaMock()
    prisma.project.findUnique.mockResolvedValue({ projectKey: "proj" })
    prisma.version.findFirst.mockResolvedValueOnce(
      buildVersionRecord({
        title: "新版本",
        content: "修了几个问题",
        isLatest: true,
        translations: [{ locale: "en", title: "New release", content: null }],
      }),
    )

    const service = new VersionsService(prisma as never, makeResolver(prisma))
    const result = await service.findLatestByProjectKey("proj", "en")

    expect(result.title).toBe("New release")
    expect(result.content).toBe("修了几个问题")
    expect(result.locale).toBe("en")
  })

  it("同义标签命中主标签的译文，locale 报的是主标签", async () => {
    const prisma = createPrismaMock()
    prisma.project.findUnique.mockResolvedValue({ projectKey: "proj" })
    prisma.version.findFirst.mockResolvedValueOnce(
      buildVersionRecord({
        isLatest: true,
        translations: [{ locale: "en", title: "New release", content: null }],
      }),
    )

    const service = new VersionsService(prisma as never, makeResolver(prisma))
    const result = await service.findLatestByProjectKey("proj", "EN-us")

    expect(result.locale).toBe("en")
    // include 里用的是主标签，不是客户端报的写法
    expect(prisma.version.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ include: { translations: { where: { locale: "en" } } } }),
    )
  })

  it("没提语言偏好时不查译文，直接返回默认内容", async () => {
    const prisma = createPrismaMock()
    prisma.project.findUnique.mockResolvedValue({ projectKey: "proj" })
    prisma.version.findFirst.mockResolvedValueOnce(
      buildVersionRecord({ title: "新版本", isLatest: true }),
    )

    const service = new VersionsService(prisma as never, makeResolver(prisma))
    const result = await service.findLatestByProjectKey("proj")

    expect(result.title).toBe("新版本")
    expect(result.locale).toBeNull()
    expect(prisma.projectLocale.findMany).not.toHaveBeenCalled()
  })

  it("未注册的语言等同没提偏好，回落默认内容", async () => {
    const prisma = createPrismaMock()
    prisma.project.findUnique.mockResolvedValue({ projectKey: "proj" })
    prisma.version.findFirst.mockResolvedValueOnce(
      buildVersionRecord({ title: "新版本", isLatest: true }),
    )

    const service = new VersionsService(prisma as never, makeResolver(prisma))
    const result = await service.findLatestByProjectKey("proj", "ja")

    expect(result.title).toBe("新版本")
    expect(result.locale).toBeNull()
  })

  it("管理端列表带出全部译文，且不做语言回落", async () => {
    const prisma = createPrismaMock()
    prisma.project.findUnique.mockResolvedValue({ projectKey: "proj" })
    prisma.$transaction.mockResolvedValueOnce([
      1,
      [
        buildVersionRecord({
          title: "新版本",
          translations: [{ locale: "en", title: "New release", content: null }],
        }),
      ],
    ])

    const service = new VersionsService(prisma as never, makeResolver(prisma))
    const result = await service.findAll("proj", { limit: 10, offset: 0 } as never)

    expect(result.data[0]?.title).toBe("新版本")
    expect(result.data[0]?.translations).toEqual([
      { locale: "en", title: "New release", content: null },
    ])
  })

  it("拒绝未注册语言的译文", async () => {
    const prisma = createPrismaMock()
    prisma.project.findUnique.mockResolvedValue({ projectKey: "proj" })

    const service = new VersionsService(prisma as never, makeResolver(prisma))

    await expect(
      service.create("proj", {
        version: "1.0.1",
        comparable_version: "1.0.1",
        translations: [{ locale: "ja", title: "新リリース" }],
      } as never),
    ).rejects.toBeInstanceOf(BadRequestException)
    expect(prisma.version.create).not.toHaveBeenCalled()
  })

  it("拒绝标题与更新说明都为空的译文行", async () => {
    const prisma = createPrismaMock()
    prisma.project.findUnique.mockResolvedValue({ projectKey: "proj" })

    const service = new VersionsService(prisma as never, makeResolver(prisma))

    await expect(
      service.create("proj", {
        version: "1.0.1",
        comparable_version: "1.0.1",
        translations: [{ locale: "en", title: "  ", content: "" }],
      } as never),
    ).rejects.toBeInstanceOf(BadRequestException)
  })

  it("拒绝同一请求里重复提交同一个语言", async () => {
    const prisma = createPrismaMock()
    prisma.project.findUnique.mockResolvedValue({ projectKey: "proj" })

    const service = new VersionsService(prisma as never, makeResolver(prisma))

    await expect(
      service.create("proj", {
        version: "1.0.1",
        comparable_version: "1.0.1",
        translations: [
          { locale: "en", title: "New release" },
          // en-US 是 en 的同义标签，归一后与上一行相撞
          { locale: "en-US", title: "Another" },
        ],
      } as never),
    ).rejects.toBeInstanceOf(BadRequestException)
  })

  it("译文按主标签落库，同义标签写法被归一", async () => {
    const prisma = createPrismaMock()
    prisma.project.findUnique.mockResolvedValue({ projectKey: "proj" })
    prisma.version.create.mockResolvedValue(buildVersionRecord({ translations: [] }))

    const service = new VersionsService(prisma as never, makeResolver(prisma))
    await service.create("proj", {
      version: "1.0.1",
      comparable_version: "1.0.1",
      translations: [{ locale: "EN-US", title: "New release" }],
    } as never)

    expect(prisma.version.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          translations: { create: [{ locale: "en", title: "New release", content: null }] },
        }),
      }),
    )
  })

  it("更新时传译文即整体替换，空数组即清空", async () => {
    const prisma = createPrismaMock()
    prisma.project.findUnique.mockResolvedValue({ projectKey: "proj" })
    prisma.version.findFirst.mockResolvedValue(
      buildVersionRecord({ id: "v1", isLatest: false, isDeprecated: false }),
    )
    prisma.version.update.mockResolvedValue(buildVersionRecord({ translations: [] }))

    const service = new VersionsService(prisma as never, makeResolver(prisma))
    await service.update("proj", "v1", { translations: [] } as never)

    expect(prisma.version.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          translations: { deleteMany: {}, create: [] },
        }),
      }),
    )
  })

  it("更新时不传译文则完全不动它", async () => {
    const prisma = createPrismaMock()
    prisma.project.findUnique.mockResolvedValue({ projectKey: "proj" })
    prisma.version.findFirst.mockResolvedValue(
      buildVersionRecord({ id: "v1", isLatest: false, isDeprecated: false }),
    )
    prisma.version.update.mockResolvedValue(buildVersionRecord({ translations: [] }))

    const service = new VersionsService(prisma as never, makeResolver(prisma))
    await service.update("proj", "v1", { title: "改标题" } as never)

    const data = prisma.version.update.mock.calls[0]?.[0].data as Record<string, unknown>
    expect(data).not.toHaveProperty("translations")
  })
})
