import { BadRequestException, Controller, Get, Param, Query, UseGuards } from "@nestjs/common"

import { AdminOrApiKeyGuard } from "../auth/guards/admin-or-api-key.guard"
import { RequireApiScope } from "../auth/guards/api-scope.decorator"
import { nowSeconds } from "../common/utils"
import {
  QueryClientVersionStatsDto,
  QueryRequestStatsDto,
  QueryRequestTimeseriesDto,
} from "./dto/query-request-stats.dto"
import { DAY_SECONDS, RequestStatsService, StatsRange } from "./request-stats.service"

/** Default window when the caller does not specify one: the last 7 days. */
const DEFAULT_RANGE_SECONDS = 7 * DAY_SECONDS

@Controller("admin/projects/:projectKey/stats/requests")
@UseGuards(AdminOrApiKeyGuard)
export class RequestStatsController {
  constructor(private readonly requestStatsService: RequestStatsService) {}

  /** Everything the big screen needs for one project, in a single round trip. */
  @Get("overview")
  @RequireApiScope("stats:read")
  async getOverview(@Param("projectKey") projectKey: string, @Query() query: QueryRequestStatsDto) {
    const range = this.resolveRange(query)

    const [total, byEndpoint, byPlatform, byRegion, byProvince] = await Promise.all([
      this.requestStatsService.getTotal(projectKey, range),
      this.requestStatsService.getEndpointBreakdown(projectKey, range),
      this.requestStatsService.getPlatformBreakdown(projectKey, range),
      this.requestStatsService.getRegionBreakdown(projectKey, range),
      this.requestStatsService.getProvinceBreakdown(projectKey, range),
    ])

    return {
      start_time: range.startTime,
      end_time: range.endTime,
      total,
      by_endpoint: byEndpoint.map((item) => ({ endpoint: item.endpoint, count: item.count })),
      by_platform: byPlatform.map((item) => ({ platform: item.platform, count: item.count })),
      by_region: byRegion.map((item) => ({ region: item.region, count: item.count })),
      // 国内省份分布，仅有 CN 流量时非空。前端据此渲染中国省级热力地图。
      by_province: byProvince.map((item) => ({
        code: item.code,
        name: item.name,
        count: item.count,
      })),
    }
  }

  @Get("timeseries")
  @RequireApiScope("stats:read")
  async getTimeseries(
    @Param("projectKey") projectKey: string,
    @Query() query: QueryRequestTimeseriesDto,
  ) {
    const range = this.resolveRange(query)
    const points = await this.requestStatsService.getTimeseries(
      projectKey,
      range,
      query.granularity,
      query.endpoint,
      query.tz_offset_minutes,
    )

    return {
      start_time: range.startTime,
      end_time: range.endTime,
      granularity: query.granularity,
      tz_offset_minutes: query.tz_offset_minutes,
      endpoint: query.endpoint ?? null,
      data: points.map((point) => ({ bucket: point.bucket, count: point.count })),
    }
  }

  /**
   * Which versions clients actually report to check-update, most common first.
   *
   * `total` counts every version in the range, not just the returned rows, so
   * a share computed against it stays truthful once `limit` cuts the tail.
   */
  @Get("client-versions")
  @RequireApiScope("stats:read")
  async getClientVersions(
    @Param("projectKey") projectKey: string,
    @Query() query: QueryClientVersionStatsDto,
  ) {
    const range = this.resolveRange(query)
    const { total, buckets } = await this.requestStatsService.getClientVersionBreakdown(
      projectKey,
      range,
      query.limit,
    )

    return {
      start_time: range.startTime,
      end_time: range.endTime,
      total,
      data: buckets.map((item) => ({ version: item.version, count: item.count })),
    }
  }

  /**
   * Request volume folded onto a weekday × hour grid; always 168 cells.
   *
   * The fold happens in each request's *source* timezone (by country code), so
   * the grid answers "when are my users awake in their own local time".
   * `tz_offset_minutes` is only the fallback for sources that cannot be placed
   * (UNKNOWN / LOCAL / countries absent from the timezone table).
   */
  @Get("heatmap")
  @RequireApiScope("stats:read")
  async getHeatmap(@Param("projectKey") projectKey: string, @Query() query: QueryRequestStatsDto) {
    const range = this.resolveRange(query)
    const cells = await this.requestStatsService.getHeatmap(
      projectKey,
      range,
      query.tz_offset_minutes,
    )

    return {
      start_time: range.startTime,
      end_time: range.endTime,
      tz_offset_minutes: query.tz_offset_minutes,
      data: cells.map((cell) => ({ weekday: cell.weekday, hour: cell.hour, count: cell.count })),
    }
  }

  private resolveRange(query: QueryRequestStatsDto): StatsRange {
    const endTime = query.end_time ?? nowSeconds()
    const startTime = query.start_time ?? endTime - DEFAULT_RANGE_SECONDS

    if (startTime > endTime) {
      throw new BadRequestException("start_time must not be greater than end_time")
    }

    return { startTime, endTime }
  }
}
