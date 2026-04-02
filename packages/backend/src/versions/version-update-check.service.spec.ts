import { CheckVersionUpdateDto } from "./dto/check-version-update.dto"
import { VersionUpdateCheckService } from "./version-update-check.service"

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

/** Create a proper CheckVersionUpdateDto instance (with validate() method). */
function createDto(fields: Partial<CheckVersionUpdateDto>): CheckVersionUpdateDto {
  return Object.assign(new CheckVersionUpdateDto(), fields)
}

describe("VersionUpdateCheckService", () => {
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
        isMilestone: true,
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
        isMilestone: false,
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
        isMilestone: true,
        isDeprecated: false,
        platform: null,
        customData: null,
        publishedAt: 9,
        createdAt: 9,
      },
    ])

    const service = new VersionUpdateCheckService(prisma as never)
    const result = await service.checkUpdateByProjectKey(
      "project-1",
      createDto({ current_version: "1.0.0" }),
    )

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
        isMilestone: false,
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
        isMilestone: false,
        isDeprecated: false,
        platform: null,
        customData: null,
        publishedAt: 11,
        createdAt: 11,
      })
      .mockResolvedValueOnce({
        version: "3.0.0-rc.1",
        comparableVersion: "3.0.0-rc.1",
        isMilestone: false,
        isDeprecated: true,
      })

    const service = new VersionUpdateCheckService(prisma as never)
    const result = await service.checkUpdateByProjectKey(
      "project-1",
      createDto({ current_version: "3.0.0-rc.1", include_preview: false }),
    )

    expect(result.should_update).toBe(false)
    expect(result.required).toBe(false)
    expect(result.reason_codes).toEqual([])
    expect(result.target_version.version).toBe("2.0.0")
  })

  it("does not force update only because a newer milestone exists", async () => {
    const prisma = createPrismaMock()
    prisma.project.findUnique.mockResolvedValueOnce({
      projectKey: "project-1",
      optionalUpdateMinComparableVersion: "1.0.0",
      optionalUpdateMaxComparableVersion: "2.0.0",
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
        isMilestone: true,
        isDeprecated: false,
        platform: null,
        customData: null,
        publishedAt: 10,
        createdAt: 10,
      })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        version: "1.5.0",
        comparableVersion: "1.5.0",
        isMilestone: false,
        isDeprecated: false,
      })

    const service = new VersionUpdateCheckService(prisma as never)
    const result = await service.checkUpdateByProjectKey(
      "project-1",
      createDto({ current_version: "1.5.0" }),
    )

    expect(result.should_update).toBe(true)
    expect(result.required).toBe(false)
    expect(result.reason_codes).toEqual(["newer_version_available"])
    expect(result.target_version.version).toBe("2.0.0")
  })
})
