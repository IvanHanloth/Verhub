import { Injectable, Logger } from "@nestjs/common"
import { Prisma, PublicEndpoint, StatPlatform } from "@prisma/client"

import { PrismaService } from "../database/prisma.service"
import { normalizeProjectKey, nowSeconds } from "../common/utils"

export const HOUR_SECONDS = 3600
export const DAY_SECONDS = 86400

/** Reserved until GeoIP lookup lands; every row records this today. */
export const UNKNOWN_REGION = "UNKNOWN"

export type RecordRequestInput = {
  projectKey: string
  endpoint: PublicEndpoint
  platform: StatPlatform
  region?: string
  occurredAt?: number
}

export type RecordClientVersionInput = {
  projectKey: string
  version: string
  platform: StatPlatform
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
export type PlatformBucket = { platform: StatPlatform; count: number }
export type RegionBucket = { region: string; count: number }
export type TimeseriesPoint = { bucket: number; count: number }
export type ClientVersionBucket = { version: string; count: number }
/** `weekday` is 0=Sunday..6=Saturday, `hour` is 0..23, both in UTC. */
export type HeatmapCell = { weekday: number; hour: number; count: number }

/** Truncate a Unix-seconds timestamp to the start of its UTC hour. */
export function toHourBucket(timestamp: number): number {
  return Math.floor(timestamp / HOUR_SECONDS) * HOUR_SECONDS
}

@Injectable()
export class RequestStatsService {
  private readonly logger = new Logger(RequestStatsService.name)

  constructor(private readonly prisma: PrismaService) {}

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
    const region = input.region ?? UNKNOWN_REGION

    await this.prisma.$executeRaw`
      INSERT INTO "ApiRequestStat" ("id", "projectKey", "endpoint", "hourBucket", "platform", "region", "count")
      VALUES (
        gen_random_uuid()::text,
        ${projectKey},
        ${input.endpoint}::"PublicEndpoint",
        ${hourBucket},
        ${platform}::"StatPlatform",
        ${region},
        1
      )
      ON CONFLICT ("projectKey", "endpoint", "hourBucket", "platform", "region")
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
        ${input.platform}::"StatPlatform",
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

  /** Per-region totals, descending. Always a single UNKNOWN bucket until GeoIP lands. */
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
  ): Promise<TimeseriesPoint[]> {
    const step = granularity === "hour" ? HOUR_SECONDS : DAY_SECONDS
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
      const bucket = Math.floor(row.hourBucket / step) * step
      totals.set(bucket, (totals.get(bucket) ?? 0) + (row._sum.count ?? 0))
    }

    const points: TimeseriesPoint[] = []
    const first = Math.floor(range.startTime / step) * step
    const last = Math.floor(range.endTime / step) * step
    for (let bucket = first; bucket <= last; bucket += step) {
      points.push({ bucket, count: totals.get(bucket) ?? 0 })
    }

    return points
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
   * Request counts folded onto a weekday × hour grid, for the activity heatmap.
   *
   * All 168 cells are materialized, including empty ones: the grid is a fixed
   * shape and a missing cell would render as a hole rather than a quiet hour.
   */
  async getHeatmap(projectKey: string, range: StatsRange): Promise<HeatmapCell[]> {
    const rows = await this.prisma.apiRequestStat.groupBy({
      by: ["hourBucket"],
      _sum: { count: true },
      where: this.rangeWhere(projectKey, range),
    })

    const totals = new Map<string, number>()
    for (const row of rows) {
      const date = new Date(row.hourBucket * 1000)
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
