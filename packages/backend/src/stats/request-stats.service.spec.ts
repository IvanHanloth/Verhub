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

/**
 * Stubbed geo lookup. These cases are about bucketing and aggregation; the
 * provider chain and its caching have their own suite.
 */
function createGeoMock(
  countryCode = "UNKNOWN",
  codes: { regionCode?: string | null; cityCode?: string | null } = {},
) {
  return {
    resolve: jest.fn().mockResolvedValue({
      countryCode,
      countryName: null,
      regionName: null,
      city: null,
      regionCode: codes.regionCode ?? null,
      cityCode: codes.cityCode ?? null,
    }),
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
    const service = new RequestStatsService(prisma as never, createGeoMock() as never)

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

  it("records the country resolved from the caller's address", async () => {
    const prisma = createPrismaMock()
    const geo = createGeoMock("JP")
    const service = new RequestStatsService(prisma as never, geo as never)

    await service.recordRequest({
      projectKey: "verhub",
      endpoint: PublicEndpoint.VERSION_LATEST,
      platform: StatPlatform.IOS,
      ip: "203.0.113.9",
    })

    expect(geo.resolve).toHaveBeenCalledWith("203.0.113.9")
    expect(prisma.$executeRaw.mock.calls[0]!.slice(1)).toContain("JP")
  })

  it("writes the resolved province/city codes alongside the country", async () => {
    const prisma = createPrismaMock()
    const geo = createGeoMock("CN", { regionCode: "210000", cityCode: "210200" })
    const service = new RequestStatsService(prisma as never, geo as never)

    await service.recordRequest({
      projectKey: "verhub",
      endpoint: PublicEndpoint.VERSION_LATEST,
      platform: StatPlatform.ANDROID,
      ip: "203.0.113.9",
    })

    const values = prisma.$executeRaw.mock.calls[0]!.slice(1)
    expect(values).toContain("CN")
    expect(values).toContain("210000")
    expect(values).toContain("210200")
  })

  it("falls back to empty-string codes for a country with no division code", async () => {
    const prisma = createPrismaMock()
    const geo = createGeoMock("JP")
    const service = new RequestStatsService(prisma as never, geo as never)

    await service.recordRequest({
      projectKey: "verhub",
      endpoint: PublicEndpoint.VERSION_LATEST,
      platform: StatPlatform.IOS,
      ip: "203.0.113.9",
    })

    // 空串 sentinel 让 upsert 不因 NULL 互异而每次插新行。
    const values = prisma.$executeRaw.mock.calls[0]!.slice(1)
    expect(values.filter((value: unknown) => value === "").length).toBeGreaterThanOrEqual(2)
  })

  it("prefers an explicitly supplied region over a lookup", async () => {
    const prisma = createPrismaMock()
    const geo = createGeoMock("JP")
    const service = new RequestStatsService(prisma as never, geo as never)

    await service.recordRequest({
      projectKey: "verhub",
      endpoint: PublicEndpoint.VERSION_LATEST,
      platform: StatPlatform.IOS,
      ip: "203.0.113.9",
      region: "DE",
    })

    expect(geo.resolve).not.toHaveBeenCalled()
    expect(prisma.$executeRaw.mock.calls[0]!.slice(1)).toContain("DE")
  })
})

describe("RequestStatsService.recordRequestSafely", () => {
  it("swallows errors so telemetry never fails the public request", async () => {
    const prisma = createPrismaMock()
    prisma.$executeRaw.mockRejectedValue(new Error("db down"))
    const service = new RequestStatsService(prisma as never, createGeoMock() as never)

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
    const service = new RequestStatsService(prisma as never, createGeoMock() as never)

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
    const service = new RequestStatsService(prisma as never, createGeoMock() as never)

    const result = await service.getEndpointBreakdown("verhub", { startTime: 0, endTime: 100 })

    expect(result).toEqual([
      { endpoint: PublicEndpoint.VERSION_CHECK_UPDATE, count: 42 },
      { endpoint: PublicEndpoint.VERSION_LATEST, count: 5 },
    ])
  })
})

describe("RequestStatsService.getProvinceBreakdown", () => {
  it("aggregates CN traffic by province code and attaches the Chinese name", async () => {
    const prisma = createPrismaMock()
    // 市级码归一到省级：210200（大连）与 210000（辽宁）合并到辽宁省。
    prisma.apiRequestStat.groupBy.mockResolvedValue([
      { regionCode: "210000", _sum: { count: 4 } },
      { regionCode: "210200", _sum: { count: 3 } },
      { regionCode: "440000", _sum: { count: 10 } },
    ])
    const service = new RequestStatsService(prisma as never, createGeoMock() as never)

    const result = await service.getProvinceBreakdown("verhub", { startTime: 0, endTime: 100 })

    expect(result).toEqual([
      { code: "440000", name: "广东省", count: 10 },
      { code: "210000", name: "辽宁省", count: 7 },
    ])
  })

  it("filters to CN with a non-empty region code", async () => {
    const prisma = createPrismaMock()
    prisma.apiRequestStat.groupBy.mockResolvedValue([])
    const service = new RequestStatsService(prisma as never, createGeoMock() as never)

    await service.getProvinceBreakdown("verhub", { startTime: 0, endTime: 100 })

    const call = prisma.apiRequestStat.groupBy.mock.calls[0]![0] as {
      where: { region?: string; regionCode?: unknown }
    }
    expect(call.where.region).toBe("CN")
    expect(call.where.regionCode).toEqual({ not: "" })
  })
})

describe("RequestStatsService.getTimeseries", () => {
  const HOUR = 3600
  const DAY = 86400

  it("materializes empty hours as zeros so the line chart has no gaps", async () => {
    const prisma = createPrismaMock()
    prisma.apiRequestStat.groupBy.mockResolvedValue([{ hourBucket: 0, _sum: { count: 3 } }])
    const service = new RequestStatsService(prisma as never, createGeoMock() as never)

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
    const service = new RequestStatsService(prisma as never, createGeoMock() as never)

    const result = await service.getTimeseries("verhub", { startTime: 0, endTime: DAY }, "day")

    expect(result).toEqual([
      { bucket: 0, count: 6 },
      { bucket: DAY, count: 1 },
    ])
  })

  it("filters by endpoint when one is requested", async () => {
    const prisma = createPrismaMock()
    prisma.apiRequestStat.groupBy.mockResolvedValue([])
    const service = new RequestStatsService(prisma as never, createGeoMock() as never)

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
    const service = new RequestStatsService(prisma as never, createGeoMock() as never)

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
    const service = new RequestStatsService(prisma as never, createGeoMock() as never)

    await service.recordClientVersion({
      projectKey: "verhub",
      version: "   ",
      platform: StatPlatform.WEB,
    })

    expect(prisma.$executeRaw).not.toHaveBeenCalled()
  })

  it("skips a version longer than the DTO allows", async () => {
    const prisma = createPrismaMock()
    const service = new RequestStatsService(prisma as never, createGeoMock() as never)

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
    const service = new RequestStatsService(prisma as never, createGeoMock() as never)

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
    const service = new RequestStatsService(prisma as never, createGeoMock() as never)

    await expect(
      service.getClientVersionBreakdown("verhub", { startTime: 0, endTime: 100 }, 15),
    ).resolves.toEqual({ total: 0, buckets: [] })
  })
})

describe("RequestStatsService.getHeatmap", () => {
  const DAY = 86400

  it("folds hourly buckets onto a full 7x24 grid", async () => {
    const prisma = createPrismaMock()
    // 1784188800 = 2026-07-16T08:00:00Z, a Thursday (weekday 4). region 表外 -> 回退偏移。
    prisma.apiRequestStat.groupBy.mockResolvedValue([
      { hourBucket: 1784188800, region: "UNKNOWN", _sum: { count: 5 } },
      { hourBucket: 1784188800 + 7 * DAY, region: "UNKNOWN", _sum: { count: 3 } },
    ])
    const service = new RequestStatsService(prisma as never, createGeoMock() as never)

    const cells = await service.getHeatmap("verhub", {
      startTime: 0,
      endTime: 1784188800 + 7 * DAY,
    })

    expect(cells).toHaveLength(7 * 24)
    // Same weekday and hour one week apart collapse into one cell.
    expect(cells).toContainEqual({ weekday: 4, hour: 8, count: 8 })
    expect(cells).toContainEqual({ weekday: 0, hour: 0, count: 0 })
  })

  it("folds each source into its own local timezone, not the caller's", async () => {
    const prisma = createPrismaMock()
    // 同一 UTC 时刻 2026-07-16T20:00:00Z（周四）的两条流量：
    // CN(+8) -> 当地周五 04:00；US(-5) -> 当地周四 15:00。各落各的格子。
    const utcThu20 = 1784232000
    prisma.apiRequestStat.groupBy.mockResolvedValue([
      { hourBucket: utcThu20, region: "CN", _sum: { count: 6 } },
      { hourBucket: utcThu20, region: "US", _sum: { count: 2 } },
    ])
    const service = new RequestStatsService(prisma as never, createGeoMock() as never)

    // 传一个离谱的 fallback，证明命中表的来源不受查询者时区影响。
    const cells = await service.getHeatmap("verhub", { startTime: 0, endTime: utcThu20 }, -600)

    expect(cells).toContainEqual({ weekday: 5, hour: 4, count: 6 }) // CN
    expect(cells).toContainEqual({ weekday: 4, hour: 15, count: 2 }) // US
  })

  it("uses the caller's offset only for sources it cannot place", async () => {
    const prisma = createPrismaMock()
    const utcThu20 = 1784232000 // 2026-07-16T20:00:00Z 周四
    prisma.apiRequestStat.groupBy.mockResolvedValue([
      { hourBucket: utcThu20, region: "UNKNOWN", _sum: { count: 4 } },
    ])
    const service = new RequestStatsService(prisma as never, createGeoMock() as never)

    // fallback +8h -> 当地周五 04:00。
    const cells = await service.getHeatmap("verhub", { startTime: 0, endTime: utcThu20 }, 480)

    expect(cells).toContainEqual({ weekday: 5, hour: 4, count: 4 })
  })
})
