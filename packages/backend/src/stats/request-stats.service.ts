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

export type StatsRange = {
  startTime: number
  endTime: number
}

export type EndpointBucket = { endpoint: PublicEndpoint; count: number }
export type PlatformBucket = { platform: StatPlatform; count: number }
export type RegionBucket = { region: string; count: number }
export type TimeseriesPoint = { bucket: number; count: number }

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

  private rangeWhere(projectKey: string, range: StatsRange): Prisma.ApiRequestStatWhereInput {
    return {
      projectKey: normalizeProjectKey(projectKey),
      hourBucket: { gte: toHourBucket(range.startTime), lte: range.endTime },
    }
  }
}
