import { GithubReleaseService } from "./github-release.service"

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

describe("GithubReleaseService", () => {
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
      isMilestone: false,
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

    const service = new GithubReleaseService(prisma as never)
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

    const service = new GithubReleaseService(prisma as never)
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
})
