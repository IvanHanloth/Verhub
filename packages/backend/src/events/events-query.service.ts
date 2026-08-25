import { BadRequestException, Injectable } from "@nestjs/common"

import { bucketBoundaries, bucketShift, bucketStep, type StatsRange } from "../stats/bucket-utils"
import { EventsStatsService } from "./events-stats.service"
import { FormulaError, evaluateFormula } from "./dsl/formula"
import type { EventQueryDto } from "./dsl/schema"

export type DslSeries = { key: string; data: Array<{ bucket: number; count: number }> }

export type DslResult =
  | { type: "timeseries"; series: DslSeries[] }
  | {
      type: "breakdown"
      total: number
      buckets: Array<{ key: string; label: string; count: number }>
    }
  | { type: "value"; values: Record<string, number>; result: number }

/**
 * 指标 DSL 的求值。
 *
 * 每个事件独立算出自己的序列/标量，再由公式在**内存里**合成。公式不下推到 SQL：
 * 那会让「哪些文本进得了查询」这个问题重新变得难以论证，而合成的数据量只有
 * 序列长度那么大，在内存里算的代价可以忽略。
 */
@Injectable()
export class EventsQueryService {
  constructor(private readonly statsService: EventsStatsService) {}

  async run(projectKey: string, range: StatsRange, query: EventQueryDto): Promise<DslResult> {
    const key = await this.statsService.resolveProjectKey(projectKey)

    switch (query.type) {
      case "timeseries":
        return this.runTimeseries(key, range, query)
      case "breakdown":
        return this.runBreakdown(key, range, query)
      case "value":
        return this.runValue(key, range, query)
    }
  }

  private async runTimeseries(
    projectKey: string,
    range: StatsRange,
    query: EventQueryDto,
  ): Promise<DslResult> {
    const step = bucketStep(query.granularity)
    const shift = bucketShift(query.granularity, query.tz_offset_minutes)
    const boundaries = bucketBoundaries(range, step, shift)

    const perAlias = new Map<string, Map<number, number>>()
    for (const event of query.events) {
      const rows = await this.statsService.timeseriesDetail(
        projectKey,
        range,
        event.name,
        [...(query.filters ?? []), ...(event.filters ?? [])],
        event.measure === "unique_users" ? "unique_users" : "count",
        step,
        shift,
      )

      const buckets = new Map(rows.map((row) => [row.bucket, row.count]))

      // count_per_user 的分母是整个区间的独立标识数而不是每桶的——按桶取分母会让
      // 「人均次数」在冷清的时段被放大成失真的尖峰。
      if (event.measure === "count_per_user") {
        const users = await this.statsService.uniqueUsers(projectKey, range, event.name, [
          ...(query.filters ?? []),
          ...(event.filters ?? []),
        ])
        for (const [bucket, count] of buckets) {
          buckets.set(bucket, users === 0 ? 0 : count / users)
        }
      }

      perAlias.set(event.alias, buckets)
    }

    if (!query.formula) {
      return {
        type: "timeseries",
        series: query.events.map((event) => ({
          key: event.alias,
          data: boundaries.map((bucket) => ({
            bucket,
            count: perAlias.get(event.alias)?.get(bucket) ?? 0,
          })),
        })),
      }
    }

    const composed = boundaries.map((bucket) => {
      const values: Record<string, number> = {}
      for (const [alias, buckets] of perAlias) {
        values[alias] = buckets.get(bucket) ?? 0
      }
      return { bucket, count: this.evaluate(query.formula as string, values) }
    })

    return { type: "timeseries", series: [{ key: "formula", data: composed }] }
  }

  /**
   * 分布只对第一个事件生效。
   *
   * 多个事件各自按同一个维度分组再合并，得到的桶含义不明（同一个 plan 取值在两
   * 个事件下的计数不该相加），与其给一个说不清的数字不如只算第一个。
   */
  private async runBreakdown(
    projectKey: string,
    range: StatsRange,
    query: EventQueryDto,
  ): Promise<DslResult> {
    const event = query.events[0]
    const groupBy = query.group_by

    if (!event) {
      throw new BadRequestException("breakdown 需要至少一个事件")
    }
    if (!groupBy) {
      throw new BadRequestException("breakdown 需要 group_by")
    }
    if (groupBy.kind === "property" && !groupBy.key) {
      throw new BadRequestException("group_by.kind 为 property 时必须提供 key")
    }

    const result = await this.statsService.getBreakdown(projectKey, range, {
      dimension: groupBy.kind,
      property_key: groupBy.key,
      event_name: groupBy.kind === "event" ? undefined : event.name,
      limit: query.limit,
      start_time: range.startTime,
      end_time: range.endTime,
      tz_offset_minutes: query.tz_offset_minutes,
    })

    return { type: "breakdown", total: result.total, buckets: result.buckets }
  }

  private async runValue(
    projectKey: string,
    range: StatsRange,
    query: EventQueryDto,
  ): Promise<DslResult> {
    const values: Record<string, number> = {}

    for (const event of query.events) {
      const filters = [...(query.filters ?? []), ...(event.filters ?? [])]
      if (event.measure === "count_per_user") {
        const [count, users] = await Promise.all([
          this.statsService.countDetail(projectKey, range, event.name, filters, "count"),
          this.statsService.uniqueUsers(projectKey, range, event.name, filters),
        ])
        values[event.alias] = users === 0 ? 0 : count / users
      } else {
        values[event.alias] = await this.statsService.countDetail(
          projectKey,
          range,
          event.name,
          filters,
          event.measure === "unique_users" ? "unique_users" : "count",
        )
      }
    }

    const firstAlias = query.events[0]?.alias
    const result = query.formula
      ? this.evaluate(query.formula, values)
      : firstAlias
        ? (values[firstAlias] ?? 0)
        : 0

    return { type: "value", values, result }
  }

  /** 公式语法错误是用户输入问题，转成 400 而不是 500。 */
  private evaluate(formula: string, values: Record<string, number>): number {
    try {
      return evaluateFormula(formula, values)
    } catch (error: unknown) {
      if (error instanceof FormulaError) {
        throw new BadRequestException(error.message)
      }
      throw error
    }
  }
}
