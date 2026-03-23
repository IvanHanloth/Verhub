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
      milestone: null,
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
        milestone: null,
        isDeprecated: false,
        platform: "IOS",
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
      milestone: null,
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
        milestone: null,
        isDeprecated: false,
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
      milestone: null,
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
          milestone: null,
          isDeprecated: false,
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
      comparableVersion: "1.1.0",
      title: "v1.1.0",
      content: "release note",
      downloadUrl: "https://downloads.example.com/verhub-1.1.0.zip",
      downloadLinks: [{ url: "https://downloads.example.com/verhub-1.1.0.zip", name: "app.zip" }],
      forced: false,
      platform: "WEB",
      customData: { source: "github-release" },
      isLatest: false,
      isPreview: false,
      milestone: null,
      isDeprecated: false,
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
          comparableVersion: "1.1.0",
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
        comparable_version: "1.2.3",
        title: "Verhub v1.2.3",
        content: "release note",
        download_url: "https://downloads.example.com/verhub-1.2.3.zip",
        is_preview: true,
        is_latest: false,
      }),
    )

    fetchMock.mockRestore()
  })

  it("checks update policy with required upgrade when current version is deprecated", async () => {
    const prisma = createPrismaMock()
    prisma.project.findUnique.mockResolvedValueOnce({
      projectKey: "project-1",
      optionalUpdateMinComparableVersion: "1.0.0",
      optionalUpdateMaxComparableVersion: "1.9.9",
    })
    prisma.version.findFirst
      .mockResolvedValueOnce({
        id: "latest-stable",
        projectKey: "project-1",
        version: "2.1.0",
        comparableVersion: "2.1.0",
        title: null,
        content: null,
        downloadUrl: null,
        downloadLinks: null,
        forced: false,
        isLatest: true,
        isPreview: false,
        milestone: "M2",
        isDeprecated: false,
        platform: null,
        customData: null,
        publishedAt: 10,
        createdAt: 10,
      })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        version: "1.0.0",
        comparableVersion: "1.0.0",
        milestone: "M1",
        isDeprecated: true,
      })
    prisma.version.findMany.mockResolvedValueOnce([
      {
        id: "m1-latest",
        projectKey: "project-1",
        version: "1.5.0",
        comparableVersion: "1.5.0",
        title: null,
        content: null,
        downloadUrl: null,
        downloadLinks: null,
        forced: false,
        isLatest: false,
        isPreview: false,
        milestone: "M1",
        isDeprecated: false,
        platform: null,
        customData: null,
        publishedAt: 9,
        createdAt: 9,
      },
    ])

    const service = new VersionsService(prisma as never)
    const result = await service.checkUpdateByProjectKey("project-1", {
      current_version: "1.0.0",
    })

    expect(result.should_update).toBe(true)
    expect(result.required).toBe(true)
    expect(result.reason_codes).toEqual(
      expect.arrayContaining([
        "newer_version_available",
        "current_version_deprecated",
        "milestone_guard",
      ]),
    )
    expect(result.target_version.version).toBe("1.5.0")
  })

  it("does not require downgrade when current deprecated version is already newer than stable candidate", async () => {
    const prisma = createPrismaMock()
    prisma.project.findUnique.mockResolvedValueOnce({
      projectKey: "project-1",
      optionalUpdateMinComparableVersion: null,
      optionalUpdateMaxComparableVersion: null,
    })
    prisma.version.findFirst
      .mockResolvedValueOnce({
        id: "latest-stable",
        projectKey: "project-1",
        version: "2.0.0",
        comparableVersion: "2.0.0",
        title: null,
        content: null,
        downloadUrl: null,
        downloadLinks: null,
        forced: false,
        isLatest: true,
        isPreview: false,
        milestone: null,
        isDeprecated: false,
        platform: null,
        customData: null,
        publishedAt: 10,
        createdAt: 10,
      })
      .mockResolvedValueOnce({
        id: "latest-preview",
        projectKey: "project-1",
        version: "3.0.0-rc.1",
        comparableVersion: "3.0.0-rc.1",
        title: null,
        content: null,
        downloadUrl: null,
        downloadLinks: null,
        forced: false,
        isLatest: false,
        isPreview: true,
        milestone: null,
        isDeprecated: false,
        platform: null,
        customData: null,
        publishedAt: 11,
        createdAt: 11,
      })
      .mockResolvedValueOnce({
        version: "3.0.0-rc.1",
        comparableVersion: "3.0.0-rc.1",
        milestone: null,
        isDeprecated: true,
      })

    const service = new VersionsService(prisma as never)
    const result = await service.checkUpdateByProjectKey("project-1", {
      current_version: "3.0.0-rc.1",
      include_preview: false,
    })

    expect(result.should_update).toBe(false)
    expect(result.required).toBe(false)
    expect(result.reason_codes).toEqual([])
    expect(result.target_version.version).toBe("2.0.0")
  })
})
