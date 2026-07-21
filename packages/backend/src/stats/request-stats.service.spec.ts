import { PublicEndpoint, StatPlatform } from "@prisma/client"

import { RequestStatsService, toHourBucket } from "./request-stats.service"

function createPrismaMock() {
  return {
    $executeRaw: jest.fn().mockResolvedValue(1),
    apiRequestStat: {
      aggregate: jest.fn(),
      groupBy: jest.fn(),
    },
    clientVersionStat: {
      groupBy: jest.fn(),
    },
  }
}

describe("toHourBucket", () => {
  it("truncates to the start of the UTC hour", () => {
    // 2026-07-16T08:47:35Z -> 2026-07-16T08:00:00Z
    expect(toHourBucket(1784191655)).toBe(1784188800)
  })

  it("is idempotent for a timestamp already on an hour boundary", () => {
    expect(toHourBucket(1784188800)).toBe(1784188800)
  })
})

describe("RequestStatsService.recordRequest", () => {
  it("normalizes the project key and buckets the timestamp by hour", async () => {
    const prisma = createPrismaMock()
    const service = new RequestStatsService(prisma as never)

    await service.recordRequest({
      projectKey: "  VerHub ",
      endpoint: PublicEndpoint.VERSION_CHECK_UPDATE,
      platform: StatPlatform.ANDROID,
      occurredAt: 1784191655,
    })

    expect(prisma.$executeRaw).toHaveBeenCalledTimes(1)
    // Tagged-template call: values follow the template strings array.
    const values = prisma.$executeRaw.mock.calls[0]!.slice(1)
    expect(values).toContain("verhub")
    expect(values).toContain(1784188800)
    expect(values).toContain(PublicEndpoint.VERSION_CHECK_UPDATE)
    expect(values).toContain(StatPlatform.ANDROID)
    expect(values).toContain("UNKNOWN")
  })
})

describe("RequestStatsService.recordRequestSafely", () => {
  it("swallows errors so telemetry never fails the public request", async () => {
    const prisma = createPrismaMock()
    prisma.$executeRaw.mockRejectedValue(new Error("db down"))
    const service = new RequestStatsService(prisma as never)

    expect(() =>
      service.recordRequestSafely({
        projectKey: "verhub",
        endpoint: PublicEndpoint.VERSION_LATEST,
        platform: StatPlatform.WEB,
      }),
    ).not.toThrow()

    // Let the rejected promise settle so an unhandled rejection would surface.
    await new Promise((resolve) => setImmediate(resolve))
  })
})

describe("RequestStatsService.getTotal", () => {
  it("returns 0 when the project has no recorded requests", async () => {
    const prisma = createPrismaMock()
    prisma.apiRequestStat.aggregate.mockResolvedValue({ _sum: { count: null } })
    const service = new RequestStatsService(prisma as never)

    await expect(service.getTotal("verhub", { startTime: 0, endTime: 100 })).resolves.toBe(0)
  })
})

describe("RequestStatsService.getEndpointBreakdown", () => {
  it("sorts endpoints by count descending", async () => {
    const prisma = createPrismaMock()
    prisma.apiRequestStat.groupBy.mockResolvedValue([
      { endpoint: PublicEndpoint.VERSION_LATEST, _sum: { count: 5 } },
      { endpoint: PublicEndpoint.VERSION_CHECK_UPDATE, _sum: { count: 42 } },
    ])
    const service = new RequestStatsService(prisma as never)

    const result = await service.getEndpointBreakdown("verhub", { startTime: 0, endTime: 100 })

    expect(result).toEqual([
      { endpoint: PublicEndpoint.VERSION_CHECK_UPDATE, count: 42 },
      { endpoint: PublicEndpoint.VERSION_LATEST, count: 5 },
    ])
  })
})

describe("RequestStatsService.getTimeseries", () => {
  const HOUR = 3600
  const DAY = 86400

  it("materializes empty hours as zeros so the line chart has no gaps", async () => {
    const prisma = createPrismaMock()
    prisma.apiRequestStat.groupBy.mockResolvedValue([{ hourBucket: 0, _sum: { count: 3 } }])
    const service = new RequestStatsService(prisma as never)

    const result = await service.getTimeseries(
      "verhub",
      { startTime: 0, endTime: 2 * HOUR },
      "hour",
    )

    expect(result).toEqual([
      { bucket: 0, count: 3 },
      { bucket: HOUR, count: 0 },
      { bucket: 2 * HOUR, count: 0 },
    ])
  })

  it("rolls hourly rows up into day buckets", async () => {
    const prisma = createPrismaMock()
    prisma.apiRequestStat.groupBy.mockResolvedValue([
      { hourBucket: 0, _sum: { count: 2 } },
      { hourBucket: 5 * HOUR, _sum: { count: 4 } },
      { hourBucket: DAY, _sum: { count: 1 } },
    ])
    const service = new RequestStatsService(prisma as never)

    const result = await service.getTimeseries("verhub", { startTime: 0, endTime: DAY }, "day")

    expect(result).toEqual([
      { bucket: 0, count: 6 },
      { bucket: DAY, count: 1 },
    ])
  })

  it("filters by endpoint when one is requested", async () => {
    const prisma = createPrismaMock()
    prisma.apiRequestStat.groupBy.mockResolvedValue([])
    const service = new RequestStatsService(prisma as never)

    await service.getTimeseries(
      "verhub",
      { startTime: 0, endTime: HOUR },
      "hour",
      PublicEndpoint.LOG_UPLOAD,
    )

    const call = prisma.apiRequestStat.groupBy.mock.calls[0]![0] as { where: { endpoint?: string } }
    expect(call.where.endpoint).toBe(PublicEndpoint.LOG_UPLOAD)
  })
})

describe("RequestStatsService.recordClientVersion", () => {
  it("normalizes the project key and buckets the timestamp by hour", async () => {
    const prisma = createPrismaMock()
    const service = new RequestStatsService(prisma as never)

    await service.recordClientVersion({
      projectKey: "  VerHub ",
      version: " 2.3.0 ",
      platform: StatPlatform.MAC,
      occurredAt: 1784191655,
    })

    expect(prisma.$executeRaw).toHaveBeenCalledTimes(1)
    const values = prisma.$executeRaw.mock.calls[0]!.slice(1)
    expect(values).toEqual(["verhub", "2.3.0", 1784188800, StatPlatform.MAC])
  })

  it("skips a blank version rather than creating an empty bucket", async () => {
    const prisma = createPrismaMock()
    const service = new RequestStatsService(prisma as never)

    await service.recordClientVersion({
      projectKey: "verhub",
      version: "   ",
      platform: StatPlatform.WEB,
    })

    expect(prisma.$executeRaw).not.toHaveBeenCalled()
  })

  it("skips a version longer than the DTO allows", async () => {
    const prisma = createPrismaMock()
    const service = new RequestStatsService(prisma as never)

    await service.recordClientVersion({
      projectKey: "verhub",
      version: "9".repeat(65),
      platform: StatPlatform.WEB,
    })

    expect(prisma.$executeRaw).not.toHaveBeenCalled()
  })
})

describe("RequestStatsService.getClientVersionBreakdown", () => {
  it("sorts by count and totals every version, not just the returned page", async () => {
    const prisma = createPrismaMock()
    prisma.clientVersionStat.groupBy.mockResolvedValue([
      { version: "2.2.1", _sum: { count: 30 } },
      { version: "2.3.0", _sum: { count: 50 } },
      { version: "2.1.0", _sum: { count: 20 } },
    ])
    const service = new RequestStatsService(prisma as never)

    const result = await service.getClientVersionBreakdown(
      "verhub",
      { startTime: 0, endTime: 100 },
      2,
    )

    expect(result.total).toBe(100)
    expect(result.buckets).toEqual([
      { version: "2.3.0", count: 50 },
      { version: "2.2.1", count: 30 },
    ])
  })

  it("returns an empty distribution when nothing has been reported", async () => {
    const prisma = createPrismaMock()
    prisma.clientVersionStat.groupBy.mockResolvedValue([])
    const service = new RequestStatsService(prisma as never)

    await expect(
      service.getClientVersionBreakdown("verhub", { startTime: 0, endTime: 100 }, 15),
    ).resolves.toEqual({ total: 0, buckets: [] })
  })
})

describe("RequestStatsService.getHeatmap", () => {
  const DAY = 86400

  it("folds hourly buckets onto a full 7x24 grid", async () => {
    const prisma = createPrismaMock()
    // 1784188800 = 2026-07-16T08:00:00Z, a Thursday (weekday 4).
    prisma.apiRequestStat.groupBy.mockResolvedValue([
      { hourBucket: 1784188800, _sum: { count: 5 } },
      { hourBucket: 1784188800 + 7 * DAY, _sum: { count: 3 } },
    ])
    const service = new RequestStatsService(prisma as never)

    const cells = await service.getHeatmap("verhub", {
      startTime: 0,
      endTime: 1784188800 + 7 * DAY,
    })

    expect(cells).toHaveLength(7 * 24)
    // Same weekday and hour one week apart collapse into one cell.
    expect(cells).toContainEqual({ weekday: 4, hour: 8, count: 8 })
    expect(cells).toContainEqual({ weekday: 0, hour: 0, count: 0 })
  })
})
