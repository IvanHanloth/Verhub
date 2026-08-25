import { StatsRetentionService } from "./stats-retention.service"

const DAY = 86400

function createPrismaMock() {
  return {
    project: { findMany: jest.fn() },
    apiRequestStat: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
    clientVersionStat: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
    platformVersionStat: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
    eventStat: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
    eventRecord: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
    eventActiveUser: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
  }
}

/** 事件保留期不传时的项目行；默认值来自 schema，测试里显式给出以免依赖默认。 */
function project(projectKey: string, statsRetentionDays: number, eventRetentionDays = 90) {
  return { projectKey, statsRetentionDays, eventRetentionDays }
}

describe("StatsRetentionService.purgeExpiredStats", () => {
  const now = 1784188800 // 2026-07-16T08:00:00Z, already on an hour boundary

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(now * 1000)
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it("applies each project's own retention window", async () => {
    const prisma = createPrismaMock()
    prisma.project.findMany.mockResolvedValue([project("alpha", 30), project("beta", 365)])
    const service = new StatsRetentionService(prisma as never)

    await service.purgeExpiredStats()

    expect(prisma.apiRequestStat.deleteMany).toHaveBeenNthCalledWith(1, {
      where: { projectKey: "alpha", hourBucket: { lt: now - 30 * DAY } },
    })
    expect(prisma.apiRequestStat.deleteMany).toHaveBeenNthCalledWith(2, {
      where: { projectKey: "beta", hourBucket: { lt: now - 365 * DAY } },
    })
  })

  it("clamps a retention window above the one-year ceiling", async () => {
    const prisma = createPrismaMock()
    prisma.project.findMany.mockResolvedValue([project("alpha", 4000)])
    const service = new StatsRetentionService(prisma as never)

    await service.purgeExpiredStats()

    expect(prisma.apiRequestStat.deleteMany).toHaveBeenCalledWith({
      where: { projectKey: "alpha", hourBucket: { lt: now - 365 * DAY } },
    })
  })

  it("clamps a non-positive retention window to the minimum instead of deleting everything", async () => {
    const prisma = createPrismaMock()
    prisma.project.findMany.mockResolvedValue([project("alpha", 0)])
    const service = new StatsRetentionService(prisma as never)

    await service.purgeExpiredStats()

    expect(prisma.apiRequestStat.deleteMany).toHaveBeenCalledWith({
      where: { projectKey: "alpha", hourBucket: { lt: now - 1 * DAY } },
    })
  })

  it("ages out client and platform version rollups on the same per-project window", async () => {
    const prisma = createPrismaMock()
    prisma.project.findMany.mockResolvedValue([project("alpha", 30)])
    const service = new StatsRetentionService(prisma as never)

    await service.purgeExpiredStats()

    const expected = { where: { projectKey: "alpha", hourBucket: { lt: now - 30 * DAY } } }
    expect(prisma.clientVersionStat.deleteMany).toHaveBeenCalledWith(expected)
    expect(prisma.platformVersionStat.deleteMany).toHaveBeenCalledWith(expected)
    // 事件量汇总也是纯计数，与其余三张表同一个窗口。
    expect(prisma.eventStat.deleteMany).toHaveBeenCalledWith(expected)
  })

  it("ages out event detail on its own shorter window, not the stats one", async () => {
    const prisma = createPrismaMock()
    prisma.project.findMany.mockResolvedValue([project("alpha", 365, 30)])
    const service = new StatsRetentionService(prisma as never)

    await service.purgeExpiredStats()

    // 明细带 distinctId，是可关联到个人的数据，不该跟着一年的统计窗口走。
    expect(prisma.eventRecord.deleteMany).toHaveBeenCalledWith({
      where: { projectKey: "alpha", occurredAt: { lt: now - 30 * DAY } },
    })
    expect(prisma.eventActiveUser.deleteMany).toHaveBeenCalledWith({
      where: { projectKey: "alpha", dayBucket: { lt: now - 30 * DAY } },
    })
  })

  it("clamps the event retention window the same way as the stats one", async () => {
    const prisma = createPrismaMock()
    prisma.project.findMany.mockResolvedValue([project("alpha", 30, 0)])
    const service = new StatsRetentionService(prisma as never)

    await service.purgeExpiredStats()

    expect(prisma.eventRecord.deleteMany).toHaveBeenCalledWith({
      where: { projectKey: "alpha", occurredAt: { lt: now - 1 * DAY } },
    })
  })

  it("reports the total number of rows purged across every table", async () => {
    const prisma = createPrismaMock()
    prisma.project.findMany.mockResolvedValue([project("alpha", 30), project("beta", 30)])
    prisma.apiRequestStat.deleteMany
      .mockResolvedValueOnce({ count: 3 })
      .mockResolvedValueOnce({ count: 4 })
    prisma.clientVersionStat.deleteMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 2 })
    prisma.platformVersionStat.deleteMany
      .mockResolvedValueOnce({ count: 5 })
      .mockResolvedValueOnce({ count: 6 })
    prisma.eventStat.deleteMany
      .mockResolvedValueOnce({ count: 7 })
      .mockResolvedValueOnce({ count: 8 })
    prisma.eventRecord.deleteMany
      .mockResolvedValueOnce({ count: 9 })
      .mockResolvedValueOnce({ count: 10 })
    prisma.eventActiveUser.deleteMany
      .mockResolvedValueOnce({ count: 11 })
      .mockResolvedValueOnce({ count: 12 })
    const service = new StatsRetentionService(prisma as never)

    await expect(service.purgeExpiredStats()).resolves.toBe(78)
  })
})
