import { Injectable, Logger } from "@nestjs/common"
import { Platform, Prisma, PublicEndpoint } from "@prisma/client"

import { PrismaService } from "../database/prisma.service"
import { GeoLocationService } from "../geo/geo-location.service"
import { normalizeProjectKey, nowSeconds } from "../common/utils"
import { provinceName } from "./province-names"
import { resolveTzOffset } from "./region-timezone"

export const HOUR_SECONDS = 3600
export const DAY_SECONDS = 86400

/** Recorded when no IP was available or every geo provider failed. */
export const UNKNOWN_REGION = "UNKNOWN"

export type RecordRequestInput = {
  projectKey: string
  endpoint: PublicEndpoint
  platform: Platform
  /** ISO-3166 alpha-2, or a sentinel. Resolved from `ip` when omitted. */
  region?: string
  /** 省/市级行政区划码，仅国内命中时非空；与 region 一起从 `ip` 解析。 */
  regionCode?: string
  cityCode?: string
  /** Caller address, used only to derive `region`; never stored on the rollup. */
  ip?: string | null
  occurredAt?: number
}

export type RecordClientVersionInput = {
  projectKey: string
  version: string
  platform: Platform
  occurredAt?: number
}

export type RecordPlatformVersionInput = {
  projectKey: string
  platform: Platform
  /** 归一化后的系统版本明细；空串表示客户端没报，照样计数。 */
  platformVersion: string
  occurredAt?: number
}

/**
 * Longest client version string we will store, matching the `current_version`
 * DTO limit. Anything longer is junk or an attempt to bloat the table.
 */
export const MAX_CLIENT_VERSION_LENGTH = 64

export type StatsRange = {
  startTime: number
  endTime: number
}

export type EndpointBucket = { endpoint: PublicEndpoint; count: number }
export type PlatformBucket = { platform: Platform; count: number }
/** 系统版本分布桶。`platformVersion` 为空串表示该平台下未上报明细的那部分流量。 */
export type PlatformVersionBucket = { platform: Platform; platformVersion: string; count: number }
export type RegionBucket = { region: string; count: number }
/** 国内省份分布桶：省级码 + 标准中文省名 + 计数。 */
export type ProvinceBucket = { code: string; name: string; count: number }
export type TimeseriesPoint = { bucket: number; count: number }
/** 一条命名序列，用于堆叠图。`key` 是端点名 / 平台名 / 版本号。 */
export type TimeseriesSeries = { key: string; data: TimeseriesPoint[] }
/** 趋势可拆分的维度。都是低基数的枚举列，不会拆出画不动的序列数。 */
export type TimeseriesGroupBy = "endpoint" | "platform"
export type ClientVersionBucket = { version: string; count: number }
/**
 * `weekday` is 0=Sunday..6=Saturday and `hour` is 0..23, folded in each
 * request's *source* timezone (by country code); `tz_offset_minutes` is only the
 * fallback for sources that cannot be placed.
 */
export type HeatmapCell = { weekday: number; hour: number; count: number }

/** Truncate a Unix-seconds timestamp to the start of its UTC hour. */
export function toHourBucket(timestamp: number): number {
  return Math.floor(timestamp / HOUR_SECONDS) * HOUR_SECONDS
}

@Injectable()
export class RequestStatsService {
  private readonly logger = new Logger(RequestStatsService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly geoLocationService: GeoLocationService,
  ) {}

  /**
   * Increment the hourly counter for one request.
   *
   * Concurrent requests race on the same (project, endpoint, hour, platform,
   * region) row, so this is a raw INSERT ... ON CONFLICT DO UPDATE: the
   * increment happens atomically in the database. Prisma's `upsert` would
   * read-then-write and lose counts under concurrency.
   */
  async recordRequest(input: RecordRequestInput): Promise<void> {
    const projectKey = normalizeProjectKey(input.projectKey)
    const hourBucket = toHourBucket(input.occurredAt ?? nowSeconds())
    const platform = input.platform

    // 一次解析同时拿国家码与省市码；显式传入时不再解析（省市随之为空串）。
    let region = input.region
    let regionCode = input.regionCode
    let cityCode = input.cityCode
    if (region === undefined) {
      const geo = await this.geoLocationService.resolve(input.ip)
      region = geo.countryCode
      regionCode = geo.regionCode ?? ""
      cityCode = geo.cityCode ?? ""
    }

    await this.prisma.$executeRaw`
      INSERT INTO "ApiRequestStat" ("id", "projectKey", "endpoint", "hourBucket", "platform", "region", "regionCode", "cityCode", "count")
      VALUES (
        gen_random_uuid()::text,
        ${projectKey},
        ${input.endpoint}::"PublicEndpoint",
        ${hourBucket},
        ${platform}::"Platform",
        ${region},
        ${regionCode ?? ""},
        ${cityCode ?? ""},
        1
      )
      ON CONFLICT ("projectKey", "endpoint", "hourBucket", "platform", "region", "regionCode", "cityCode")
      DO UPDATE SET
        "count" = "ApiRequestStat"."count" + 1,
        "updatedAt" = CAST(EXTRACT(EPOCH FROM now()) AS INTEGER)
    `
  }

  /**
   * Record a request without ever surfacing an error to the caller.
   * Statistics are best-effort telemetry; a failure here must not fail the
   * public API request that triggered it.
   */
  recordRequestSafely(input: RecordRequestInput): void {
    this.recordRequest(input).catch((error: unknown) => {
      this.logger.warn(
        `Failed to record request stat for ${input.projectKey}/${input.endpoint}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      )
    })
  }

  /**
   * Increment the hourly counter for one client-reported version.
   *
   * Same atomic upsert-increment as `recordRequest`, for the same reason.
   * Returns without writing when the client reported nothing usable — an empty
   * or oversized string is not a version, and recording it as one would put a
   * junk bucket into the distribution chart.
   */
  async recordClientVersion(input: RecordClientVersionInput): Promise<void> {
    const version = input.version.trim()
    if (!version || version.length > MAX_CLIENT_VERSION_LENGTH) {
      return
    }

    const projectKey = normalizeProjectKey(input.projectKey)
    const hourBucket = toHourBucket(input.occurredAt ?? nowSeconds())

    await this.prisma.$executeRaw`
      INSERT INTO "ClientVersionStat" ("id", "projectKey", "version", "hourBucket", "platform", "count")
      VALUES (
        gen_random_uuid()::text,
        ${projectKey},
        ${version},
        ${hourBucket},
        ${input.platform}::"Platform",
        1
      )
      ON CONFLICT ("projectKey", "version", "hourBucket", "platform")
      DO UPDATE SET
        "count" = "ClientVersionStat"."count" + 1,
        "updatedAt" = CAST(EXTRACT(EPOCH FROM now()) AS INTEGER)
    `
  }

  /** Best-effort counterpart to `recordClientVersion`; never fails the caller. */
  recordClientVersionSafely(input: RecordClientVersionInput): void {
    this.recordClientVersion(input).catch((error: unknown) => {
      this.logger.warn(
        `Failed to record client version stat for ${input.projectKey}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      )
    })
  }

  /**
   * Increment the hourly counter for one client's operating-system version.
   *
   * Same atomic upsert-increment as `recordRequest`, for the same reason.
   * 明细为空串照样计数：不然「多少流量根本没报系统版本」这个问题就无从回答，
   * 各版本的占比分母也会失真。超长明细在解析阶段已归一为空串。
   */
  async recordPlatformVersion(input: RecordPlatformVersionInput): Promise<void> {
    const projectKey = normalizeProjectKey(input.projectKey)
    const hourBucket = toHourBucket(input.occurredAt ?? nowSeconds())

    await this.prisma.$executeRaw`
      INSERT INTO "PlatformVersionStat" ("id", "projectKey", "hourBucket", "platform", "platformVersion", "count")
      VALUES (
        gen_random_uuid()::text,
        ${projectKey},
        ${hourBucket},
        ${input.platform}::"Platform",
        ${input.platformVersion},
        1
      )
      ON CONFLICT ("projectKey", "hourBucket", "platform", "platformVersion")
      DO UPDATE SET
        "count" = "PlatformVersionStat"."count" + 1,
        "updatedAt" = CAST(EXTRACT(EPOCH FROM now()) AS INTEGER)
    `
  }

  /** Best-effort counterpart to `recordPlatformVersion`; never fails the caller. */
  recordPlatformVersionSafely(input: RecordPlatformVersionInput): void {
    this.recordPlatformVersion(input).catch((error: unknown) => {
      this.logger.warn(
        `Failed to record platform version stat for ${input.projectKey}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      )
    })
  }

  /** Total request count for a project within a range. */
  async getTotal(projectKey: string, range: StatsRange): Promise<number> {
    const result = await this.prisma.apiRequestStat.aggregate({
      _sum: { count: true },
      where: this.rangeWhere(projectKey, range),
    })
    return result._sum.count ?? 0
  }

  /** Per-endpoint totals, descending. Drives the endpoint pie/bar charts. */
  async getEndpointBreakdown(projectKey: string, range: StatsRange): Promise<EndpointBucket[]> {
    const rows = await this.prisma.apiRequestStat.groupBy({
      by: ["endpoint"],
      _sum: { count: true },
      where: this.rangeWhere(projectKey, range),
    })

    return rows
      .map((row) => ({ endpoint: row.endpoint, count: row._sum.count ?? 0 }))
      .sort((a, b) => b.count - a.count)
  }

  /** Per-platform totals, descending. */
  async getPlatformBreakdown(projectKey: string, range: StatsRange): Promise<PlatformBucket[]> {
    const rows = await this.prisma.apiRequestStat.groupBy({
      by: ["platform"],
      _sum: { count: true },
      where: this.rangeWhere(projectKey, range),
    })

    return rows
      .map((row) => ({ platform: row.platform, count: row._sum.count ?? 0 }))
      .sort((a, b) => b.count - a.count)
  }

  /**
   * Per-country totals, descending. Buckets are ISO-3166 alpha-2 codes plus the
   * `UNKNOWN` / `LOCAL` sentinels.
   */
  async getRegionBreakdown(projectKey: string, range: StatsRange): Promise<RegionBucket[]> {
    const rows = await this.prisma.apiRequestStat.groupBy({
      by: ["region"],
      _sum: { count: true },
      where: this.rangeWhere(projectKey, range),
    })

    return rows
      .map((row) => ({ region: row.region, count: row._sum.count ?? 0 }))
      .sort((a, b) => b.count - a.count)
  }

  /**
   * 国内省份分布，降序。只统计 region=CN 且有省级码的行——境外与未定位没有国标码。
   * 按省级码聚合（同一省份不同 provider 命名不一致，按码归并），码归一到省级
   * （市码前两位 + "0000"）再累加，中文省名由静态表给出。
   */
  async getProvinceBreakdown(projectKey: string, range: StatsRange): Promise<ProvinceBucket[]> {
    const rows = await this.prisma.apiRequestStat.groupBy({
      by: ["regionCode"],
      _sum: { count: true },
      where: {
        ...this.rangeWhere(projectKey, range),
        region: "CN",
        regionCode: { not: "" },
      },
    })

    const totals = new Map<string, number>()
    for (const row of rows) {
      const code = `${row.regionCode.slice(0, 2)}0000`
      totals.set(code, (totals.get(code) ?? 0) + (row._sum.count ?? 0))
    }

    return [...totals.entries()]
      .map(([code, count]) => ({ code, name: provinceName(code), count }))
      .sort((a, b) => b.count - a.count)
  }

  /**
   * Request counts over time, bucketed by hour or day.
   *
   * Buckets with no traffic are materialized as zeros so the line chart shows a
   * continuous series instead of interpolating across gaps.
   */
  async getTimeseries(
    projectKey: string,
    range: StatsRange,
    granularity: "hour" | "day",
    endpoint?: PublicEndpoint,
    tzOffsetMinutes = 0,
  ): Promise<TimeseriesPoint[]> {
    const step = granularity === "hour" ? HOUR_SECONDS : DAY_SECONDS
    // Daily buckets must break at the viewer's midnight, not UTC's, or a busy
    // evening in UTC+8 lands on the following day. Hourly buckets are already
    // aligned to the hour, which every real offset preserves closely enough.
    const shift = granularity === "day" ? tzOffsetMinutes * 60 : 0

    const where: Prisma.ApiRequestStatWhereInput = this.rangeWhere(projectKey, range)
    if (endpoint) {
      where.endpoint = endpoint
    }

    const rows = await this.prisma.apiRequestStat.groupBy({
      by: ["hourBucket"],
      _sum: { count: true },
      where,
    })

    const totals = new Map<number, number>()
    for (const row of rows) {
      const bucket = this.floorTo(row.hourBucket, step, shift)
      totals.set(bucket, (totals.get(bucket) ?? 0) + (row._sum.count ?? 0))
    }

    return this.bucketBoundaries(range, step, shift).map((bucket) => ({
      bucket,
      count: totals.get(bucket) ?? 0,
    }))
  }

  /**
   * 同一区间内按维度拆分的多条序列，用于堆叠面积图。
   *
   * 与 `getTimeseries` 分开而不是加参数返回两种形状：总量那条线永远要画（堆叠图
   * 的包络线、KPI 的分母都靠它），调用方总是两个都要，合并成一个方法反而要在
   * 返回值里塞一个可空字段。
   *
   * 每条序列都补齐了全部时间桶的零点：Recharts 的堆叠图按下标对齐各序列，缺桶
   * 会让后面的点整体错位到错误的时间上。
   */
  async getTimeseriesByGroup(
    projectKey: string,
    range: StatsRange,
    granularity: "hour" | "day",
    groupBy: TimeseriesGroupBy,
    tzOffsetMinutes = 0,
  ): Promise<TimeseriesSeries[]> {
    const step = granularity === "hour" ? HOUR_SECONDS : DAY_SECONDS
    const shift = granularity === "day" ? tzOffsetMinutes * 60 : 0

    const rows = await this.prisma.apiRequestStat.groupBy({
      by: ["hourBucket", groupBy],
      _sum: { count: true },
      where: this.rangeWhere(projectKey, range),
    })

    const totalsByKey = new Map<string, Map<number, number>>()
    for (const row of rows) {
      const key = String(row[groupBy])
      const bucket = this.floorTo(row.hourBucket, step, shift)
      const buckets = totalsByKey.get(key) ?? new Map<number, number>()
      buckets.set(bucket, (buckets.get(bucket) ?? 0) + (row._sum.count ?? 0))
      totalsByKey.set(key, buckets)
    }

    const boundaries = this.bucketBoundaries(range, step, shift)

    return (
      [...totalsByKey.entries()]
        .map(([key, buckets]) => ({
          key,
          data: boundaries.map((bucket) => ({ bucket, count: buckets.get(bucket) ?? 0 })),
          total: [...buckets.values()].reduce((sum, count) => sum + count, 0),
        }))
        // 大的在前，前端的配色与图例顺序才稳定，不会因为某小时的抖动而换位。
        .sort((a, b) => b.total - a.total || a.key.localeCompare(b.key))
        .map(({ key, data }) => ({ key, data }))
    )
  }

  /**
   * 各客户端版本的上报量随时间变化，用于看新版本推广得多快。
   *
   * 只返回区间内总量最大的 `limit` 个版本：一个跑了一年的项目上报过的版本可能
   * 上百个，全画出来既看不清也传得慢。被截掉的尾巴不单独成序列，调用方用
   * `getTimeseries` 的总量减去各序列即可还原，口径与其他图表一致。
   */
  async getVersionAdoption(
    projectKey: string,
    range: StatsRange,
    granularity: "hour" | "day",
    limit: number,
    tzOffsetMinutes = 0,
  ): Promise<TimeseriesSeries[]> {
    const step = granularity === "hour" ? HOUR_SECONDS : DAY_SECONDS
    const shift = granularity === "day" ? tzOffsetMinutes * 60 : 0

    const rows = await this.prisma.clientVersionStat.groupBy({
      by: ["hourBucket", "version"],
      _sum: { count: true },
      where: {
        projectKey: normalizeProjectKey(projectKey),
        hourBucket: { gte: toHourBucket(range.startTime), lte: range.endTime },
      },
    })

    const totalsByVersion = new Map<string, Map<number, number>>()
    const grandTotals = new Map<string, number>()
    for (const row of rows) {
      const bucket = this.floorTo(row.hourBucket, step, shift)
      const count = row._sum.count ?? 0
      const buckets = totalsByVersion.get(row.version) ?? new Map<number, number>()
      buckets.set(bucket, (buckets.get(bucket) ?? 0) + count)
      totalsByVersion.set(row.version, buckets)
      grandTotals.set(row.version, (grandTotals.get(row.version) ?? 0) + count)
    }

    const boundaries = this.bucketBoundaries(range, step, shift)

    return [...totalsByVersion.entries()]
      .sort(
        (a, b) =>
          (grandTotals.get(b[0]) ?? 0) - (grandTotals.get(a[0]) ?? 0) || a[0].localeCompare(b[0]),
      )
      .slice(0, limit)
      .map(([version, buckets]) => ({
        key: version,
        data: boundaries.map((bucket) => ({ bucket, count: buckets.get(bucket) ?? 0 })),
      }))
  }

  /** 区间内全部桶的起点，含无流量的空桶。 */
  private bucketBoundaries(range: StatsRange, step: number, shift: number): number[] {
    const boundaries: number[] = []
    const last = this.floorTo(range.endTime, step, shift)
    for (let bucket = this.floorTo(range.startTime, step, shift); bucket <= last; bucket += step) {
      boundaries.push(bucket)
    }
    return boundaries
  }

  /**
   * Floor a timestamp to a bucket boundary in the shifted timezone, then map it
   * back to real Unix seconds. The returned value is the instant the local
   * bucket started, so formatting it with local-time getters reproduces the
   * label the viewer expects.
   */
  private floorTo(timestamp: number, step: number, shift: number): number {
    return Math.floor((timestamp + shift) / step) * step - shift
  }

  /**
   * Client-reported version totals, descending. Drives the "which version is
   * actually in the field" chart.
   *
   * `total` is the count across *every* version, not just the returned page, so
   * the caller can still compute a truthful share for each returned row after
   * `limit` truncates the tail.
   */
  async getClientVersionBreakdown(
    projectKey: string,
    range: StatsRange,
    limit: number,
  ): Promise<{ total: number; buckets: ClientVersionBucket[] }> {
    const rows = await this.prisma.clientVersionStat.groupBy({
      by: ["version"],
      _sum: { count: true },
      where: {
        projectKey: normalizeProjectKey(projectKey),
        hourBucket: { gte: toHourBucket(range.startTime), lte: range.endTime },
      },
    })

    const buckets = rows
      .map((row) => ({ version: row.version, count: row._sum.count ?? 0 }))
      .sort((a, b) => b.count - a.count || a.version.localeCompare(b.version))

    const total = buckets.reduce((sum, bucket) => sum + bucket.count, 0)

    return { total, buckets: buckets.slice(0, limit) }
  }

  /**
   * 系统版本分布，降序。回答「Windows 用户里还有多少留在 10」这类问题。
   *
   * 与 `getClientVersionBreakdown` 同样返回全量 `total` 而非分页后的和，让调用方
   * 在 `limit` 截尾后仍能算出真实占比。排序键带上平台与版本，保证 count 相同的
   * 桶顺序稳定，前端不会因为刷新而抖动。
   */
  async getPlatformVersionBreakdown(
    projectKey: string,
    range: StatsRange,
    limit: number,
  ): Promise<{ total: number; buckets: PlatformVersionBucket[] }> {
    const rows = await this.prisma.platformVersionStat.groupBy({
      by: ["platform", "platformVersion"],
      _sum: { count: true },
      where: {
        projectKey: normalizeProjectKey(projectKey),
        hourBucket: { gte: toHourBucket(range.startTime), lte: range.endTime },
      },
    })

    const buckets = rows
      .map((row) => ({
        platform: row.platform,
        platformVersion: row.platformVersion,
        count: row._sum.count ?? 0,
      }))
      .sort(
        (a, b) =>
          b.count - a.count ||
          a.platform.localeCompare(b.platform) ||
          a.platformVersion.localeCompare(b.platformVersion),
      )

    const total = buckets.reduce((sum, bucket) => sum + bucket.count, 0)

    return { total, buckets: buckets.slice(0, limit) }
  }

  /**
   * Request counts folded onto a weekday × hour grid, for the activity heatmap.
   *
   * All 168 cells are materialized, including empty ones: the grid is a fixed
   * shape and a missing cell would render as a hole rather than a quiet hour.
   */
  async getHeatmap(
    projectKey: string,
    range: StatsRange,
    tzOffsetMinutes = 0,
  ): Promise<HeatmapCell[]> {
    // 按国家码一并分组：每个来源的请求要折到它自己的当地时区，才能回答「用户在
    // 当地几点活跃」。这也是热力图与趋势图口径的关键差异——趋势图是给管理员看的
    // 绝对时间轴，统一用查询者时区；热力图是行为节律，按来源时区。
    const rows = await this.prisma.apiRequestStat.groupBy({
      by: ["hourBucket", "region"],
      _sum: { count: true },
      where: this.rangeWhere(projectKey, range),
    })

    const totals = new Map<string, number>()
    for (const row of rows) {
      // 每行按其来源国家的代表时区平移；无法定位（UNKNOWN/LOCAL/表外）回退到查询者
      // 时区，避免这类流量凭空聚到 UTC。平移后读 UTC 字段即得来源当地的星期/小时。
      const offset = resolveTzOffset(row.region, tzOffsetMinutes)
      const date = new Date((row.hourBucket + offset * 60) * 1000)
      const key = `${date.getUTCDay()}:${date.getUTCHours()}`
      totals.set(key, (totals.get(key) ?? 0) + (row._sum.count ?? 0))
    }

    const cells: HeatmapCell[] = []
    for (let weekday = 0; weekday < 7; weekday += 1) {
      for (let hour = 0; hour < 24; hour += 1) {
        cells.push({ weekday, hour, count: totals.get(`${weekday}:${hour}`) ?? 0 })
      }
    }

    return cells
  }

  private rangeWhere(projectKey: string, range: StatsRange): Prisma.ApiRequestStatWhereInput {
    return {
      projectKey: normalizeProjectKey(projectKey),
      hourBucket: { gte: toHourBucket(range.startTime), lte: range.endTime },
    }
  }
}
