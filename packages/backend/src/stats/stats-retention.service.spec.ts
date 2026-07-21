import { StatsRetentionService } from "./stats-retention.service"

const DAY = 86400

function createPrismaMock() {
  return {
    project: { findMany: jest.fn() },
    apiRequestStat: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
    clientVersionStat: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
  }
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
    prisma.project.findMany.mockResolvedValue([
      { projectKey: "alpha", statsRetentionDays: 30 },
      { projectKey: "beta", statsRetentionDays: 365 },
    ])
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
    prisma.project.findMany.mockResolvedValue([{ projectKey: "alpha", statsRetentionDays: 4000 }])
    const service = new StatsRetentionService(prisma as never)

    await service.purgeExpiredStats()

    expect(prisma.apiRequestStat.deleteMany).toHaveBeenCalledWith({
      where: { projectKey: "alpha", hourBucket: { lt: now - 365 * DAY } },
    })
  })

  it("clamps a non-positive retention window to the minimum instead of deleting everything", async () => {
    const prisma = createPrismaMock()
    prisma.project.findMany.mockResolvedValue([{ projectKey: "alpha", statsRetentionDays: 0 }])
    const service = new StatsRetentionService(prisma as never)

    await service.purgeExpiredStats()

    expect(prisma.apiRequestStat.deleteMany).toHaveBeenCalledWith({
      where: { projectKey: "alpha", hourBucket: { lt: now - 1 * DAY } },
    })
  })

  it("ages out client version rollups on the same per-project window", async () => {
    const prisma = createPrismaMock()
    prisma.project.findMany.mockResolvedValue([{ projectKey: "alpha", statsRetentionDays: 30 }])
    const service = new StatsRetentionService(prisma as never)

    await service.purgeExpiredStats()

    expect(prisma.clientVersionStat.deleteMany).toHaveBeenCalledWith({
      where: { projectKey: "alpha", hourBucket: { lt: now - 30 * DAY } },
    })
  })

  it("reports the total number of rows purged across both tables", async () => {
    const prisma = createPrismaMock()
    prisma.project.findMany.mockResolvedValue([
      { projectKey: "alpha", statsRetentionDays: 30 },
      { projectKey: "beta", statsRetentionDays: 30 },
    ])
    prisma.apiRequestStat.deleteMany
      .mockResolvedValueOnce({ count: 3 })
      .mockResolvedValueOnce({ count: 4 })
    prisma.clientVersionStat.deleteMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 2 })
    const service = new StatsRetentionService(prisma as never)

    await expect(service.purgeExpiredStats()).resolves.toBe(10)
  })
})
