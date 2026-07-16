import { PublicEndpoint, StatPlatform } from "@prisma/client"

import { RequestStatsService, toHourBucket } from "./request-stats.service"

function createPrismaMock() {
  return {
    $executeRaw: jest.fn().mockResolvedValue(1),
    apiRequestStat: {
      aggregate: jest.fn(),
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
