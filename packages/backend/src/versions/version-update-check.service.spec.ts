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

function makeVersionRecord(overrides: Record<string, unknown>) {
  return {
    id: "v-default",
    projectKey: "project-1",
    version: "1.0.0",
    comparableVersion: "1.0.0",
    title: null,
    content: null,
    downloadUrl: null,
    downloadLinks: null,
    forced: false,
    isLatest: false,
    isPreview: false,
    isMilestone: false,
    isDeprecated: false,
    platform: null,
    customData: null,
    publishedAt: 10,
    createdAt: 10,
    ...overrides,
  }
}

describe("VersionUpdateCheckService", () => {
  // -- Step 1: should_update --

  it("returns should_update=true when current < latest", async () => {
    const prisma = createPrismaMock()
    prisma.project.findUnique.mockResolvedValueOnce({
      projectKey: "project-1",
      optionalUpdateMinComparableVersion: null,
      optionalUpdateMaxComparableVersion: null,
    })
    prisma.version.findFirst
      .mockResolvedValueOnce(
        makeVersionRecord({
          id: "latest",
          version: "2.0.0",
          comparableVersion: "2.0.0",
          isLatest: true,
        }),
      )
      .mockResolvedValueOnce(null) // no preview
      .mockResolvedValueOnce({
        version: "1.0.0",
        comparableVersion: "1.0.0",
        isMilestone: false,
        isDeprecated: false,
      })
    prisma.version.findMany.mockResolvedValueOnce([]) // no milestones

    const service = new VersionUpdateCheckService(prisma as never)
    const result = await service.checkUpdateByProjectKey(
      "project-1",
      createDto({ current_version: "1.0.0" }),
    )

    expect(result.should_update).toBe(true)
    expect(result.required).toBe(false)
    expect(result.reason_codes).toEqual(["newer_version_available"])
    expect(result.target_version?.version).toBe("2.0.0")
    expect(result.latest_version.version).toBe("2.0.0")
  })

  it("returns should_update=true when current is deprecated even without newer", async () => {
    const prisma = createPrismaMock()
    prisma.project.findUnique.mockResolvedValueOnce({
      projectKey: "project-1",
      optionalUpdateMinComparableVersion: null,
      optionalUpdateMaxComparableVersion: null,
    })
    prisma.version.findFirst
      .mockResolvedValueOnce(
        makeVersionRecord({
          id: "latest",
          version: "2.0.0",
          comparableVersion: "2.0.0",
          isLatest: true,
        }),
      )
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        version: "2.0.0",
        comparableVersion: "2.0.0",
        isMilestone: false,
        isDeprecated: true,
      })

    const service = new VersionUpdateCheckService(prisma as never)
    const result = await service.checkUpdateByProjectKey(
      "project-1",
      createDto({ current_version: "2.0.0" }),
    )

    expect(result.should_update).toBe(true)
    expect(result.required).toBe(true)
    expect(result.reason_codes).toContain("current_version_deprecated")
    expect(result.target_version).toBeNull()
    expect(result.latest_version.version).toBe("2.0.0")
  })

  it("returns should_update=false when current is latest and not deprecated", async () => {
    const prisma = createPrismaMock()
    prisma.project.findUnique.mockResolvedValueOnce({
      projectKey: "project-1",
      optionalUpdateMinComparableVersion: null,
      optionalUpdateMaxComparableVersion: null,
    })
    prisma.version.findFirst
      .mockResolvedValueOnce(
        makeVersionRecord({
          id: "latest",
          version: "2.0.0",
          comparableVersion: "2.0.0",
          isLatest: true,
        }),
      )
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        version: "2.0.0",
        comparableVersion: "2.0.0",
        isMilestone: false,
        isDeprecated: false,
      })

    const service = new VersionUpdateCheckService(prisma as never)
    const result = await service.checkUpdateByProjectKey(
      "project-1",
      createDto({ current_version: "2.0.0" }),
    )

    expect(result.should_update).toBe(false)
    expect(result.required).toBe(false)
    expect(result.target_version).toBeNull()
    expect(result.latest_version.version).toBe("2.0.0")
  })

  // -- Step 2: required --

  it("sets required=true when deprecated with newer version available", async () => {
    const prisma = createPrismaMock()
    prisma.project.findUnique.mockResolvedValueOnce({
      projectKey: "project-1",
      optionalUpdateMinComparableVersion: "1.0.0",
      optionalUpdateMaxComparableVersion: "2.0.0",
    })
    prisma.version.findFirst
      .mockResolvedValueOnce(
        makeVersionRecord({
          id: "latest",
          version: "1.6.0",
          comparableVersion: "1.6.0",
          isLatest: true,
        }),
      )
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        version: "1.5.0",
        comparableVersion: "1.5.0",
        isMilestone: false,
        isDeprecated: true,
      })
    prisma.version.findMany.mockResolvedValueOnce([])

    const service = new VersionUpdateCheckService(prisma as never)
    const result = await service.checkUpdateByProjectKey(
      "project-1",
      createDto({ current_version: "1.5.0" }),
    )

    expect(result.should_update).toBe(true)
    expect(result.required).toBe(true)
    expect(result.reason_codes).toContain("current_version_deprecated")
    expect(result.reason_codes).toContain("newer_version_available")
  })

  it("sets required=true when outside optional update range", async () => {
    const prisma = createPrismaMock()
    prisma.project.findUnique.mockResolvedValueOnce({
      projectKey: "project-1",
      optionalUpdateMinComparableVersion: "1.5.0",
      optionalUpdateMaxComparableVersion: "1.9.0",
    })
    prisma.version.findFirst
      .mockResolvedValueOnce(
        makeVersionRecord({
          id: "latest",
          version: "2.0.0",
          comparableVersion: "2.0.0",
          isLatest: true,
        }),
      )
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        version: "1.0.0",
        comparableVersion: "1.0.0",
        isMilestone: false,
        isDeprecated: false,
      })
    prisma.version.findMany.mockResolvedValueOnce([])

    const service = new VersionUpdateCheckService(prisma as never)
    const result = await service.checkUpdateByProjectKey(
      "project-1",
      createDto({ current_version: "1.0.0" }),
    )

    expect(result.should_update).toBe(true)
    expect(result.required).toBe(true)
    expect(result.reason_codes).toContain("outside_optional_update_range")
  })

  it("sets required=false when in optional update range and not deprecated", async () => {
    const prisma = createPrismaMock()
    prisma.project.findUnique.mockResolvedValueOnce({
      projectKey: "project-1",
      optionalUpdateMinComparableVersion: "1.0.0",
      optionalUpdateMaxComparableVersion: "2.0.0",
    })
    prisma.version.findFirst
      .mockResolvedValueOnce(
        makeVersionRecord({
          id: "latest",
          version: "2.0.0",
          comparableVersion: "2.0.0",
          isLatest: true,
        }),
      )
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        version: "1.5.0",
        comparableVersion: "1.5.0",
        isMilestone: false,
        isDeprecated: false,
      })
    prisma.version.findMany.mockResolvedValueOnce([])

    const service = new VersionUpdateCheckService(prisma as never)
    const result = await service.checkUpdateByProjectKey(
      "project-1",
      createDto({ current_version: "1.5.0" }),
    )

    expect(result.should_update).toBe(true)
    expect(result.required).toBe(false)
    expect(result.reason_codes).toEqual(["newer_version_available"])
  })

  // -- Step 3: milestone guard --

  it("targets nearest milestone between current and latest", async () => {
    const prisma = createPrismaMock()
    prisma.project.findUnique.mockResolvedValueOnce({
      projectKey: "project-1",
      optionalUpdateMinComparableVersion: null,
      optionalUpdateMaxComparableVersion: null,
    })
    prisma.version.findFirst
      .mockResolvedValueOnce(
        makeVersionRecord({
          id: "latest",
          version: "3.0.0",
          comparableVersion: "3.0.0",
          isLatest: true,
        }),
      )
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        version: "1.0.0",
        comparableVersion: "1.0.0",
        isMilestone: false,
        isDeprecated: false,
      })
    prisma.version.findMany.mockResolvedValueOnce([
      makeVersionRecord({
        id: "m1",
        version: "1.5.0",
        comparableVersion: "1.5.0",
        isMilestone: true,
      }),
      makeVersionRecord({
        id: "m2",
        version: "2.0.0",
        comparableVersion: "2.0.0",
        isMilestone: true,
      }),
    ])

    const service = new VersionUpdateCheckService(prisma as never)
    const result = await service.checkUpdateByProjectKey(
      "project-1",
      createDto({ current_version: "1.0.0" }),
    )

    expect(result.should_update).toBe(true)
    expect(result.target_version?.version).toBe("1.5.0")
    expect(result.reason_codes).toContain("milestone_guard")
    expect(result.milestone.target_is_milestone).toBe(true)
    expect(result.latest_version.version).toBe("3.0.0")
  })

  it("targets latest when no milestone between current and latest", async () => {
    const prisma = createPrismaMock()
    prisma.project.findUnique.mockResolvedValueOnce({
      projectKey: "project-1",
      optionalUpdateMinComparableVersion: null,
      optionalUpdateMaxComparableVersion: null,
    })
    prisma.version.findFirst
      .mockResolvedValueOnce(
        makeVersionRecord({
          id: "latest",
          version: "2.0.0",
          comparableVersion: "2.0.0",
          isLatest: true,
        }),
      )
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        version: "1.5.0",
        comparableVersion: "1.5.0",
        isMilestone: false,
        isDeprecated: false,
      })
    prisma.version.findMany.mockResolvedValueOnce([])

    const service = new VersionUpdateCheckService(prisma as never)
    const result = await service.checkUpdateByProjectKey(
      "project-1",
      createDto({ current_version: "1.5.0" }),
    )

    expect(result.target_version?.version).toBe("2.0.0")
    expect(result.reason_codes).not.toContain("milestone_guard")
    expect(result.milestone.target_is_milestone).toBe(false)
  })

  it("ignores preview/deprecated milestones in milestone guard", async () => {
    const prisma = createPrismaMock()
    prisma.project.findUnique.mockResolvedValueOnce({
      projectKey: "project-1",
      optionalUpdateMinComparableVersion: null,
      optionalUpdateMaxComparableVersion: null,
    })
    prisma.version.findFirst
      .mockResolvedValueOnce(
        makeVersionRecord({
          id: "latest",
          version: "3.0.0",
          comparableVersion: "3.0.0",
          isLatest: true,
        }),
      )
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        version: "1.0.0",
        comparableVersion: "1.0.0",
        isMilestone: false,
        isDeprecated: false,
      })
    prisma.version.findMany.mockResolvedValueOnce([
      makeVersionRecord({
        id: "m-valid",
        version: "2.0.0",
        comparableVersion: "2.0.0",
        isMilestone: true,
      }),
    ])

    const service = new VersionUpdateCheckService(prisma as never)
    const result = await service.checkUpdateByProjectKey(
      "project-1",
      createDto({ current_version: "1.0.0" }),
    )

    expect(prisma.version.findMany).toHaveBeenCalledWith({
      where: {
        projectKey: "project-1",
        isMilestone: true,
        isPreview: false,
        isDeprecated: false,
        comparableVersion: { not: null },
      },
    })
    expect(result.target_version?.version).toBe("2.0.0")
  })

  // -- dual version priority --

  it("uses current_comparable_version as higher priority", async () => {
    const prisma = createPrismaMock()
    prisma.project.findUnique.mockResolvedValueOnce({
      projectKey: "project-1",
      optionalUpdateMinComparableVersion: null,
      optionalUpdateMaxComparableVersion: null,
    })
    prisma.version.findFirst
      .mockResolvedValueOnce(
        makeVersionRecord({
          id: "latest",
          version: "1.6.0",
          comparableVersion: "1.6.0",
          isLatest: true,
        }),
      )
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        version: "1.5.0",
        comparableVersion: "1.5.0",
        isMilestone: false,
        isDeprecated: false,
      })
    prisma.version.findMany.mockResolvedValueOnce([])

    const service = new VersionUpdateCheckService(prisma as never)
    const result = await service.checkUpdateByProjectKey(
      "project-1",
      createDto({
        current_version: "1.0.0",
        current_comparable_version: "1.5.0",
      }),
    )

    expect(result.current_comparable_version).toBe("1.5.0")
    expect(result.should_update).toBe(true)
    expect(result.required).toBe(false)
  })

  // -- Response format --

  it("always returns latest_version even when no update needed", async () => {
    const prisma = createPrismaMock()
    prisma.project.findUnique.mockResolvedValueOnce({
      projectKey: "project-1",
      optionalUpdateMinComparableVersion: null,
      optionalUpdateMaxComparableVersion: null,
    })
    prisma.version.findFirst
      .mockResolvedValueOnce(
        makeVersionRecord({
          id: "latest",
          version: "2.0.0",
          comparableVersion: "2.0.0",
          isLatest: true,
        }),
      )
      .mockResolvedValueOnce(
        makeVersionRecord({
          id: "preview",
          version: "3.0.0-alpha.1",
          comparableVersion: "3.0.0-alpha.1",
          isPreview: true,
        }),
      )
      .mockResolvedValueOnce({
        version: "2.0.0",
        comparableVersion: "2.0.0",
        isMilestone: false,
        isDeprecated: false,
      })

    const service = new VersionUpdateCheckService(prisma as never)
    const result = await service.checkUpdateByProjectKey(
      "project-1",
      createDto({ current_version: "2.0.0" }),
    )

    expect(result.should_update).toBe(false)
    expect(result.target_version).toBeNull()
    expect(result.latest_version.version).toBe("2.0.0")
    expect(result.latest_preview_version?.version).toBe("3.0.0-alpha.1")
  })

  it("includes preview in latest when include_preview is true", async () => {
    const prisma = createPrismaMock()
    prisma.project.findUnique.mockResolvedValueOnce({
      projectKey: "project-1",
      optionalUpdateMinComparableVersion: null,
      optionalUpdateMaxComparableVersion: null,
    })
    prisma.version.findFirst
      .mockResolvedValueOnce(
        makeVersionRecord({
          id: "stable",
          version: "2.0.0",
          comparableVersion: "2.0.0",
          isLatest: true,
        }),
      )
      .mockResolvedValueOnce(
        makeVersionRecord({
          id: "preview",
          version: "3.0.0-rc.1",
          comparableVersion: "3.0.0-rc.1",
          isPreview: true,
        }),
      )
      .mockResolvedValueOnce({
        version: "2.0.0",
        comparableVersion: "2.0.0",
        isMilestone: false,
        isDeprecated: false,
      })
    prisma.version.findMany.mockResolvedValueOnce([])

    const service = new VersionUpdateCheckService(prisma as never)
    const result = await service.checkUpdateByProjectKey(
      "project-1",
      createDto({
        current_version: "2.0.0",
        include_preview: true,
      }),
    )

    expect(result.latest_version.version).toBe("3.0.0-rc.1")
    expect(result.should_update).toBe(true)
    expect(result.target_version?.version).toBe("3.0.0-rc.1")
  })
})
