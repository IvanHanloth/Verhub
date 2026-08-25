import { Injectable } from "@nestjs/common"
import { Platform, Prisma } from "@prisma/client"

import { PrismaService } from "../database/prisma.service"
import { ProjectResolverService } from "../database/project-resolver.service"
import {
  bucketShift,
  bucketStep,
  foldSeries,
  toHourBucket,
  type HeatmapCell,
  type StatsRange,
  type TimeseriesSeries,
} from "../stats/bucket-utils"
import { resolveTzOffset } from "../stats/region-timezone"
import { provinceName } from "../stats/province-names"
import { andAll, compileFilters } from "./dsl/compile"
import type { EventFilterDto } from "./dto/event-filter.dto"
import type {
  EventTimeseriesGroupBy,
  QueryEventBreakdownDto,
  QueryEventTimeseriesDto,
} from "./dto/query-events.dto"

export type EventOverview = {
  /** 区间内的事件总量，来自小时汇总。 */
  total: number
  /** 区间内出现过的独立标识数，来自明细——汇总表没有这一维。 */
  unique_users: number
  unique_sessions: number
  /** 区间内有过上报的事件种类数。 */
  event_types: number
}

export type CountBucket = { key: string; label: string; count: number }

/**
 * 事件量的聚合查询。
 *
 * 分工：能从小时汇总回答的一律走 EventStat（趋势、事件/平台/地区分布、热力图），
 * 需要按标识去重或者按属性下钻的走明细 EventRecord。混着写会让人以为
 * 「独立用户数」也是从汇总表来的，而汇总表根本没有那一维。
 */
@Injectable()
export class EventsStatsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectResolver: ProjectResolverService,
  ) {}

  async getOverview(projectKey: string, range: StatsRange): Promise<EventOverview> {
    const key = await this.resolveProjectKey(projectKey)

    const [totals, distinctRows, eventTypes] = await Promise.all([
      this.prisma.eventStat.aggregate({
        _sum: { count: true },
        where: this.statWhere(key, range),
      }),
      this.prisma.$queryRaw<Array<{ users: bigint; sessions: bigint }>>`
        SELECT
          COUNT(DISTINCT "distinctId") AS users,
          COUNT(DISTINCT "sessionId") AS sessions
        FROM "EventRecord"
        WHERE "projectKey" = ${key}
          AND "occurredAt" >= ${range.startTime}
          AND "occurredAt" <= ${range.endTime}
      `,
      this.prisma.eventStat.groupBy({ by: ["eventName"], where: this.statWhere(key, range) }),
    ])

    return {
      total: totals._sum.count ?? 0,
      unique_users: Number(distinctRows[0]?.users ?? 0),
      unique_sessions: Number(distinctRows[0]?.sessions ?? 0),
      event_types: eventTypes.length,
    }
  }

  /**
   * 事件量随时间变化。总量那条线始终返回，`group_by` 只是额外拆出多条序列。
   *
   * 分开返回而不是让 group_by 改变返回形状：总量是堆叠图的包络线、也是 KPI 的
   * 分母，调用方两个都要。
   */
  async getTimeseries(
    projectKey: string,
    range: StatsRange,
    query: QueryEventTimeseriesDto,
  ): Promise<{ total: TimeseriesSeries; series: TimeseriesSeries[] }> {
    const key = await this.resolveProjectKey(projectKey)
    const step = bucketStep(query.granularity)
    const shift = bucketShift(query.granularity, query.tz_offset_minutes)

    const where = this.statWhere(key, range)
    if (query.event_name) {
      where.eventName = query.event_name
    }

    const groupColumn = this.timeseriesColumn(query.group_by)
    const rows = await this.prisma.eventStat.groupBy({
      by: groupColumn ? ["hourBucket", groupColumn] : ["hourBucket"],
      _sum: { count: true },
      where,
    })

    const flat = rows.map((row) => ({
      key: groupColumn ? String(row[groupColumn]) : "total",
      bucket: row.hourBucket,
      count: row._sum.count ?? 0,
    }))

    const [total] = foldSeries(
      flat.map((row) => ({ ...row, key: "total" })),
      range,
      step,
      shift,
    )

    return {
      total: total ?? { key: "total", data: [] },
      series: groupColumn ? foldSeries(flat, range, step, shift, query.limit) : [],
    }
  }

  /**
   * 分布。返回全量 `total` 而非分页后的和，让调用方在 `limit` 截尾后仍能算出
   * 真实占比——同 RequestStatsService.getClientVersionBreakdown 的约定。
   */
  async getBreakdown(
    projectKey: string,
    range: StatsRange,
    query: QueryEventBreakdownDto,
  ): Promise<{ total: number; buckets: CountBucket[] }> {
    const key = await this.resolveProjectKey(projectKey)

    if (query.dimension === "property") {
      return this.getPropertyBreakdown(key, range, query)
    }

    const where = this.statWhere(key, range)
    if (query.event_name) {
      where.eventName = query.event_name
    }

    const column =
      query.dimension === "event"
        ? "eventName"
        : query.dimension === "platform"
          ? "platform"
          : "region"

    const rows = await this.prisma.eventStat.groupBy({
      by: [column],
      _sum: { count: true },
      where,
    })

    const buckets = rows
      .map((row) => {
        const value = String(row[column])
        return { key: value, label: this.label(query.dimension, value), count: row._sum.count ?? 0 }
      })
      .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key))

    return {
      total: buckets.reduce((sum, bucket) => sum + bucket.count, 0),
      buckets: buckets.slice(0, query.limit),
    }
  }

  /**
   * 按属性取值分布。只能走明细：汇总表按设计不含 properties。
   *
   * 属性名以参数进入 SQL，取值一律按文本比较——理由见 dsl/compile.ts。
   */
  private async getPropertyBreakdown(
    projectKey: string,
    range: StatsRange,
    query: QueryEventBreakdownDto,
  ): Promise<{ total: number; buckets: CountBucket[] }> {
    const propertyKey = query.property_key
    if (!propertyKey) {
      return { total: 0, buckets: [] }
    }

    const eventCondition = query.event_name
      ? Prisma.sql`AND "eventName" = ${query.event_name}`
      : Prisma.empty

    const rows = await this.prisma.$queryRaw<Array<{ value: string | null; count: bigint }>>`
      SELECT "properties" ->> ${propertyKey} AS value, COUNT(*) AS count
      FROM "EventRecord"
      WHERE "projectKey" = ${projectKey}
        AND "occurredAt" >= ${range.startTime}
        AND "occurredAt" <= ${range.endTime}
        ${eventCondition}
      GROUP BY 1
      ORDER BY count DESC
    `

    const buckets = rows.map((row) => ({
      key: row.value ?? "",
      // 空串桶是「上报里根本没这个属性」，与某个属性值恰好是空串是两回事，
      // 但在分布图上都该显示成可读的标签而不是一片空白。
      label: row.value ?? "（未上报）",
      count: Number(row.count),
    }))

    return {
      total: buckets.reduce((sum, bucket) => sum + bucket.count, 0),
      buckets: buckets.slice(0, query.limit),
    }
  }

  /**
   * 事件量折到星期 × 小时，用于看行为节律。
   *
   * 按来源国家的代表时区折叠，不是查询者时区：这张图要回答「用户在当地几点
   * 活跃」。与趋势图的口径差异同 RequestStatsService.getHeatmap。
   */
  async getHeatmap(
    projectKey: string,
    range: StatsRange,
    tzOffsetMinutes = 0,
    eventName?: string,
  ): Promise<HeatmapCell[]> {
    const key = await this.resolveProjectKey(projectKey)

    const where = this.statWhere(key, range)
    if (eventName) {
      where.eventName = eventName
    }

    const rows = await this.prisma.eventStat.groupBy({
      by: ["hourBucket", "region"],
      _sum: { count: true },
      where,
    })

    const totals = new Map<string, number>()
    for (const row of rows) {
      const offset = resolveTzOffset(row.region, tzOffsetMinutes)
      const date = new Date((row.hourBucket + offset * 60) * 1000)
      const cell = `${date.getUTCDay()}:${date.getUTCHours()}`
      totals.set(cell, (totals.get(cell) ?? 0) + (row._sum.count ?? 0))
    }

    const cells: HeatmapCell[] = []
    for (let weekday = 0; weekday < 7; weekday += 1) {
      for (let hour = 0; hour < 24; hour += 1) {
        cells.push({ weekday, hour, count: totals.get(`${weekday}:${hour}`) ?? 0 })
      }
    }
    return cells
  }

  /**
   * 明细计数，DSL 的 count / unique_users 走这条路。
   *
   * 不走汇总表是因为 DSL 允许带属性条件，而汇总表按设计不含 properties。
   */
  async countDetail(
    projectKey: string,
    range: StatsRange,
    eventName: string,
    filters: EventFilterDto[] | undefined,
    measure: "count" | "unique_users",
  ): Promise<number> {
    const conditions = andAll(compileFilters(filters))
    const selector =
      measure === "unique_users" ? Prisma.sql`COUNT(DISTINCT "distinctId")` : Prisma.sql`COUNT(*)`

    const rows = await this.prisma.$queryRaw<Array<{ value: bigint }>>`
      SELECT ${selector} AS value
      FROM "EventRecord"
      WHERE "projectKey" = ${projectKey}
        AND "eventName" = ${eventName}
        AND "occurredAt" >= ${range.startTime}
        AND "occurredAt" <= ${range.endTime}
        AND ${conditions}
    `

    return Number(rows[0]?.value ?? 0)
  }

  /** 明细上的分桶计数，DSL 的 timeseries 走这条路。 */
  async timeseriesDetail(
    projectKey: string,
    range: StatsRange,
    eventName: string,
    filters: EventFilterDto[] | undefined,
    measure: "count" | "unique_users",
    step: number,
    shift: number,
  ): Promise<Array<{ bucket: number; count: number }>> {
    const conditions = andAll(compileFilters(filters))
    const selector =
      measure === "unique_users" ? Prisma.sql`COUNT(DISTINCT "distinctId")` : Prisma.sql`COUNT(*)`

    const rows = await this.prisma.$queryRaw<Array<{ bucket: bigint; value: bigint }>>`
      SELECT
        (FLOOR(("occurredAt" + ${shift})::numeric / ${step}) * ${step} - ${shift})::bigint AS bucket,
        ${selector} AS value
      FROM "EventRecord"
      WHERE "projectKey" = ${projectKey}
        AND "eventName" = ${eventName}
        AND "occurredAt" >= ${range.startTime}
        AND "occurredAt" <= ${range.endTime}
        AND ${conditions}
      GROUP BY 1
    `

    return rows.map((row) => ({ bucket: Number(row.bucket), count: Number(row.value) }))
  }

  /** 区间内的独立标识数，DSL 的 count_per_user 拿它当分母。 */
  async uniqueUsers(
    projectKey: string,
    range: StatsRange,
    eventName: string,
    filters: EventFilterDto[] | undefined,
  ): Promise<number> {
    return this.countDetail(projectKey, range, eventName, filters, "unique_users")
  }

  resolveProjectKey(projectKey: string): Promise<string> {
    return this.projectResolver.resolveCanonicalKeyOrThrow(projectKey)
  }

  private statWhere(projectKey: string, range: StatsRange): Prisma.EventStatWhereInput {
    return {
      projectKey,
      hourBucket: { gte: toHourBucket(range.startTime), lte: range.endTime },
    }
  }

  private timeseriesColumn(
    groupBy: EventTimeseriesGroupBy | undefined,
  ): "eventName" | "platform" | "region" | null {
    if (groupBy === "event") return "eventName"
    if (groupBy === "platform") return "platform"
    if (groupBy === "region") return "region"
    return null
  }

  /** 地区码换成中文省名只在国内码上有意义，其余维度原样返回。 */
  private label(dimension: string, value: string): string {
    if (dimension === "region" && /^\d{6}$/.test(value)) {
      return provinceName(value)
    }
    if (dimension === "platform") {
      return value === Platform.OTHERS ? "其他" : value
    }
    return value
  }
}
