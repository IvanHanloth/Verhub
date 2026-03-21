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
      downloadLinks: [{ url: "https://example.com/app", name: "Installer", platform: "web" }],
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
      download_links: [{ url: "https://example.com/app", name: "Installer", platform: "web" }],
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
        downloadLinks: [{ url: "https://example.com/app", name: "Installer", platform: "web" }],
        forced: false,
        platform: "IOS",
        customData: { build: "100" },
        isLatest: true,
        isPreview: false,
        publishedAt: expect.any(Number),
      },
    })

    expect(result.platform).toBe("ios")
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
      downloadLinks: null,
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
        downloadUrl: undefined,
        downloadLinks: undefined,
        forced: false,
        platform: undefined,
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
      title: "Preview",
      content: null,
      downloadUrl: null,
      downloadLinks: null,
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

  it("imports releases from github and skips duplicated version numbers", async () => {
    const prisma = createPrismaMock()
    prisma.project.findUnique.mockResolvedValue({
      projectKey: "project-1",
      repoUrl: "https://github.com/octocat/Hello-World",
    })

    prisma.version.findMany.mockResolvedValueOnce([{ version: "1.0.0" }])
    prisma.version.create.mockResolvedValue({
      id: "version-2",
      version: "1.1.0",
      title: "v1.1.0",
      content: "release note",
      downloadUrl: "https://downloads.example.com/verhub-1.1.0.zip",
      downloadLinks: [{ url: "https://downloads.example.com/verhub-1.1.0.zip", name: "app.zip" }],
      forced: false,
      platform: "WEB",
      customData: { source: "github-release" },
      isLatest: false,
      isPreview: false,
      publishedAt: 1774087200,
      createdAt: 1774087200,
    })

    const fetchMock = jest.spyOn(global, "fetch" as never).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [
        {
          tag_name: "v1.0.0",
          name: "v1.0.0",
          prerelease: false,
          body: "old",
          assets: [{ browser_download_url: "https://downloads.example.com/verhub-1.0.0.zip" }],
          published_at: "2026-03-20T10:00:00.000Z",
        },
        {
          tag_name: "v1.1.0",
          name: "v1.1.0",
          prerelease: false,
          body: "release note",
          assets: [
            {
              name: "app.zip",
              browser_download_url: "https://downloads.example.com/verhub-1.1.0.zip",
            },
          ],
          published_at: "2026-03-21T10:00:00.000Z",
        },
      ],
    } as never)

    const service = new VersionsService(prisma as never)
    const result = await service.importFromGithubReleases("project-1")

    expect(result).toEqual({ imported: 1, skipped: 1, scanned: 2 })
    expect(prisma.version.create).toHaveBeenCalledTimes(1)
    expect(prisma.version.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          projectKey: "project-1",
          version: "1.1.0",
          downloadUrl: "https://downloads.example.com/verhub-1.1.0.zip",
          downloadLinks: [
            { url: "https://downloads.example.com/verhub-1.1.0.zip", name: "app.zip" },
          ],
        }),
      }),
    )

    fetchMock.mockRestore()
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
