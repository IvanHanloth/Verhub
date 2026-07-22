import { Injectable } from "@nestjs/common"
import { LogLevel } from "@prisma/client"

import { PrismaService } from "../database/prisma.service"
import { normalizeProjectKey } from "../common/utils"
import type { StatsRange } from "./request-stats.service"

/**
 * 日志与反馈的分布统计。
 *
 * 与 `RequestStatsService` 分开：那边读的是小时聚合表，这边直接数明细行。
 * 日志和反馈没有汇总表，也不需要——它们的量级是「人看得完」的，按项目 + 时间
 * 范围做一次 groupBy 比维护一套 rollup 划算得多。
 */

/** 日志等级，对外用数值（0=DEBUG..3=ERROR），与上报接口的取值一致。 */
export type LogLevelBucket = { level: number; count: number }

/** 评分直方图的一档。`rating` 恒为 1..5，没有记录的档位也会出现，计数为 0。 */
export type RatingBucket = { rating: number; count: number }

const LEVEL_ORDER: LogLevel[] = [LogLevel.DEBUG, LogLevel.INFO, LogLevel.WARN, LogLevel.ERROR]

/** 评分档位固定 1..5：缺档的柱子要占位，否则直方图会被压缩成看不出分布的形状。 */
const RATING_VALUES = [1, 2, 3, 4, 5]

@Injectable()
export class ContentStatsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 各等级的日志条数。
   *
   * 四个等级全部返回（含 0 条的），图表的柱子数才不会随数据变化而增减——
   * 「这个范围内一条 ERROR 都没有」本身就是要传达的信息。
   */
  async getLogLevelBreakdown(
    projectKey: string,
    range: StatsRange,
  ): Promise<{ total: number; buckets: LogLevelBucket[] }> {
    const rows = await this.prisma.log.groupBy({
      by: ["level"],
      _count: { _all: true },
      where: {
        projectKey: normalizeProjectKey(projectKey),
        createdAt: { gte: range.startTime, lte: range.endTime },
      },
    })

    const counts = new Map(rows.map((row) => [row.level, row._count._all]))
    const buckets = LEVEL_ORDER.map((level, index) => ({
      level: index,
      count: counts.get(level) ?? 0,
    }))

    return { total: buckets.reduce((sum, bucket) => sum + bucket.count, 0), buckets }
  }

  /**
   * 反馈评分直方图。
   *
   * `unrated` 单独给出而不是并进某一档：没打分的反馈仍是一条反馈，混进 1 星会
   * 让平均分变成谎话，丢掉又会让 total 对不上反馈列表的条数。
   */
  async getFeedbackRatingBreakdown(
    projectKey: string,
    range: StatsRange,
  ): Promise<{
    total: number
    unrated: number
    averageRating: number | null
    buckets: RatingBucket[]
  }> {
    const where = {
      projectKey: normalizeProjectKey(projectKey),
      createdAt: { gte: range.startTime, lte: range.endTime },
    }

    const [total, rows] = await Promise.all([
      this.prisma.feedback.count({ where }),
      this.prisma.feedback.groupBy({
        by: ["rating"],
        _count: { _all: true },
        where: { ...where, rating: { not: null } },
      }),
    ])

    const counts = new Map(rows.map((row) => [row.rating, row._count._all]))
    const buckets = RATING_VALUES.map((rating) => ({
      rating,
      count: counts.get(rating) ?? 0,
    }))

    const rated = buckets.reduce((sum, bucket) => sum + bucket.count, 0)
    const score = buckets.reduce((sum, bucket) => sum + bucket.rating * bucket.count, 0)

    return {
      total,
      unrated: total - rated,
      averageRating: rated > 0 ? score / rated : null,
      buckets,
    }
  }
}
