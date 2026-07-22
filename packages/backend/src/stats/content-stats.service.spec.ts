import { LogLevel } from "@prisma/client"

import { ContentStatsService } from "./content-stats.service"

function createPrismaMock() {
  return {
    log: { groupBy: jest.fn().mockResolvedValue([]) },
    feedback: { count: jest.fn().mockResolvedValue(0), groupBy: jest.fn().mockResolvedValue([]) },
  }
}

const RANGE = { startTime: 1000, endTime: 2000 }

describe("ContentStatsService.getLogLevelBreakdown", () => {
  it("returns all four levels even when a level has no rows", () => {
    const prisma = createPrismaMock()
    prisma.log.groupBy.mockResolvedValue([
      { level: LogLevel.ERROR, _count: { _all: 4 } },
      { level: LogLevel.INFO, _count: { _all: 30 } },
    ])
    const service = new ContentStatsService(prisma as never)

    return service.getLogLevelBreakdown("verhub", RANGE).then((result) => {
      // 「这个范围内一条 ERROR 都没有」本身就是信息，柱子数不能随数据增减。
      expect(result.buckets).toEqual([
        { level: 0, count: 0 },
        { level: 1, count: 30 },
        { level: 2, count: 0 },
        { level: 3, count: 4 },
      ])
      expect(result.total).toBe(34)
    })
  })

  it("scopes the query to the normalized project key and the range", async () => {
    const prisma = createPrismaMock()
    const service = new ContentStatsService(prisma as never)

    await service.getLogLevelBreakdown("  VerHub ", RANGE)

    expect(prisma.log.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { projectKey: "verhub", createdAt: { gte: 1000, lte: 2000 } },
      }),
    )
  })
})

describe("ContentStatsService.getFeedbackRatingBreakdown", () => {
  it("returns all five rating slots and averages only the rated ones", async () => {
    const prisma = createPrismaMock()
    prisma.feedback.count.mockResolvedValue(10)
    prisma.feedback.groupBy.mockResolvedValue([
      { rating: 5, _count: { _all: 6 } },
      { rating: 3, _count: { _all: 2 } },
    ])
    const service = new ContentStatsService(prisma as never)

    const result = await service.getFeedbackRatingBreakdown("verhub", RANGE)

    expect(result.buckets).toEqual([
      { rating: 1, count: 0 },
      { rating: 2, count: 0 },
      { rating: 3, count: 2 },
      { rating: 4, count: 0 },
      { rating: 5, count: 6 },
    ])
    // 未打分的既不并入某一档（会让平均分说谎），也不丢弃（total 要对得上列表条数）。
    expect(result.unrated).toBe(2)
    expect(result.total).toBe(10)
    expect(result.averageRating).toBeCloseTo((5 * 6 + 3 * 2) / 8)
  })

  it("reports a null average when nobody rated", async () => {
    const prisma = createPrismaMock()
    prisma.feedback.count.mockResolvedValue(3)
    const service = new ContentStatsService(prisma as never)

    const result = await service.getFeedbackRatingBreakdown("verhub", RANGE)

    expect(result.averageRating).toBeNull()
    expect(result.unrated).toBe(3)
  })
})
