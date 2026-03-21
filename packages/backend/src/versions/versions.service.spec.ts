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
      title: "First Release",
      content: "stable release",
      downloadUrl: "https://example.com/app",
      forced: false,
      platform: "IOS",
      customData: { build: "100" },
      isLatest: true,
      isPreview: false,
      publishedAt: 1767225600,
      createdAt: 1767225600,
    })

    prisma.version.updateMany.mockResolvedValue({ count: 1 })

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
        projectKey: "project-1",
        version: "1.0.0",
        title: "First Release",
        content: "stable release",
        downloadUrl: "https://example.com/app",
        forced: false,
        platform: "IOS",
        customData: { build: "100" },
        isLatest: true,
        isPreview: false,
        publishedAt: expect.any(Number),
      },
    })

    expect(result.platform).toBe("ios")
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
        title: undefined,
        content: undefined,
        download_url: undefined,
        forced: false,
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
      title: null,
      content: null,
      downloadUrl: null,
      forced: false,
      platform: null,
      customData: null,
      isLatest: true,
      isPreview: false,
      publishedAt: 1767225600,
      createdAt: 1767225600,
    })

    prisma.version.updateMany.mockResolvedValue({ count: 0 })

    const service = new VersionsService(prisma as never)
    const result = await service.create("project-1", {
      version: "1.0.1",
      title: undefined,
      content: undefined,
      download_url: undefined,
      forced: false,
      platform: undefined,
      custom_data: undefined,
    })

    expect(prisma.version.create).toHaveBeenCalledWith({
      data: {
        projectKey: "project-1",
        version: "1.0.1",
        title: undefined,
        content: undefined,
        downloadUrl: null,
        forced: false,
        platform: undefined,
        customData: undefined,
        isLatest: true,
        isPreview: false,
        publishedAt: expect.any(Number),
      },
    })
    expect(result.download_url).toBeNull()
  })

  it("marks explicit preview version as non-latest", async () => {
    const prisma = createPrismaMock()
    prisma.project.findUnique.mockResolvedValue({ projectKey: "project-1" })
    prisma.version.create.mockResolvedValue({
      id: "version-preview",
      version: "2.0.0-beta.1",
      title: "Preview",
      content: null,
      downloadUrl: null,
      forced: false,
      platform: "WEB",
      customData: null,
      isLatest: false,
      isPreview: true,
      publishedAt: 1767225600,
      createdAt: 1767225600,
    })

    const service = new VersionsService(prisma as never)
    await service.create("project-1", {
      version: "2.0.0-beta.1",
      is_preview: true,
    })

    expect(prisma.version.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          isLatest: false,
          isPreview: true,
        }),
      }),
    )
  })

  it("fetches GitHub release preview by project repo", async () => {
    const prisma = createPrismaMock()
    prisma.project.findUnique.mockResolvedValue({
      projectKey: "project-1",
      repoUrl: "https://github.com/octocat/Hello-World",
    })

    const fetchMock = jest.spyOn(global, "fetch" as never).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        tag_name: "v1.2.3",
        name: "Verhub v1.2.3",
        body: "release note",
        prerelease: true,
        published_at: "2026-03-21T10:00:00.000Z",
        html_url: "https://github.com/octocat/Hello-World/releases/tag/v1.2.3",
        assets: [{ browser_download_url: "https://downloads.example.com/verhub-1.2.3.zip" }],
      }),
    } as never)

    const service = new VersionsService(prisma as never)
    const preview = await service.previewFromGithubRelease("project-1", { tag: "v1.2.3" })

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.github.com/repos/octocat/Hello-World/releases/tags/v1.2.3",
      expect.any(Object),
    )
    expect(preview).toEqual(
      expect.objectContaining({
        version: "1.2.3",
        title: "Verhub v1.2.3",
        content: "release note",
        download_url: "https://downloads.example.com/verhub-1.2.3.zip",
        is_preview: true,
        is_latest: false,
      }),
    )

    fetchMock.mockRestore()
  })
})
