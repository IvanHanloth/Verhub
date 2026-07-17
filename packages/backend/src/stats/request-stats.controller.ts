import { BadRequestException, Controller, Get, Param, Query, UseGuards } from "@nestjs/common"

import { AdminOrApiKeyGuard } from "../auth/guards/admin-or-api-key.guard"
import { RequireApiScope } from "../auth/guards/api-scope.decorator"
import { nowSeconds } from "../common/utils"
import { QueryRequestStatsDto, QueryRequestTimeseriesDto } from "./dto/query-request-stats.dto"
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

    const [total, byEndpoint, byPlatform, byRegion] = await Promise.all([
      this.requestStatsService.getTotal(projectKey, range),
      this.requestStatsService.getEndpointBreakdown(projectKey, range),
      this.requestStatsService.getPlatformBreakdown(projectKey, range),
      this.requestStatsService.getRegionBreakdown(projectKey, range),
    ])

    return {
      start_time: range.startTime,
      end_time: range.endTime,
      total,
      by_endpoint: byEndpoint.map((item) => ({ endpoint: item.endpoint, count: item.count })),
      by_platform: byPlatform.map((item) => ({ platform: item.platform, count: item.count })),
      by_region: byRegion.map((item) => ({ region: item.region, count: item.count })),
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
    )

    return {
      start_time: range.startTime,
      end_time: range.endTime,
      granularity: query.granularity,
      endpoint: query.endpoint ?? null,
      data: points.map((point) => ({ bucket: point.bucket, count: point.count })),
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
