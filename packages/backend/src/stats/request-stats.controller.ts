import { BadRequestException, Controller, Get, Param, Query, UseGuards } from "@nestjs/common"

import { AdminOrApiKeyGuard } from "../auth/guards/admin-or-api-key.guard"
import { RequireApiScope } from "../auth/guards/api-scope.decorator"
import { nowSeconds } from "../common/utils"
import {
  QueryClientVersionStatsDto,
  QueryPlatformVersionStatsDto,
  QueryRequestStatsDto,
  QueryRequestTimeseriesDto,
  QueryVersionAdoptionDto,
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

  /**
   * 请求量随时间的变化。
   *
   * `data` 是总量，永远返回；给了 `group_by` 时额外返回按维度拆开的 `series`，
   * 供堆叠图使用。两者并列而不是二选一：堆叠图的包络线就是总量，调用方两个都要。
   * 各序列之和可能小于总量——`group_by` 目前的两个维度都是全覆盖的枚举，不会
   * 出现这种情况，但调用方按「差额归入其他」处理才不会在将来加维度时算错占比。
   */
  @Get("timeseries")
  @RequireApiScope("stats:read")
  async getTimeseries(
    @Param("projectKey") projectKey: string,
    @Query() query: QueryRequestTimeseriesDto,
  ) {
    const range = this.resolveRange(query)
    const [points, series] = await Promise.all([
      this.requestStatsService.getTimeseries(
        projectKey,
        range,
        query.granularity,
        query.endpoint,
        query.tz_offset_minutes,
      ),
      query.group_by
        ? this.requestStatsService.getTimeseriesByGroup(
            projectKey,
            range,
            query.granularity,
            query.group_by,
            query.tz_offset_minutes,
          )
        : Promise.resolve(null),
    ])

    return {
      start_time: range.startTime,
      end_time: range.endTime,
      granularity: query.granularity,
      tz_offset_minutes: query.tz_offset_minutes,
      endpoint: query.endpoint ?? null,
      group_by: query.group_by ?? null,
      data: points.map((point) => ({ bucket: point.bucket, count: point.count })),
      series:
        series?.map((item) => ({
          key: item.key,
          data: item.data.map((point) => ({ bucket: point.bucket, count: point.count })),
        })) ?? null,
    }
  }

  /**
   * 各客户端版本的上报量随时间变化，用于看新版本推广得多快。
   *
   * 只返回区间内总量最大的 `limit` 个版本。被截掉的尾巴不单独成序列：调用方
   * 用 client-versions 的 `total` 减去各序列即可还原，与其余图表口径一致。
   */
  @Get("version-adoption")
  @RequireApiScope("stats:read")
  async getVersionAdoption(
    @Param("projectKey") projectKey: string,
    @Query() query: QueryVersionAdoptionDto,
  ) {
    const range = this.resolveRange(query)
    const series = await this.requestStatsService.getVersionAdoption(
      projectKey,
      range,
      query.granularity,
      query.limit,
      query.tz_offset_minutes,
    )

    return {
      start_time: range.startTime,
      end_time: range.endTime,
      granularity: query.granularity,
      tz_offset_minutes: query.tz_offset_minutes,
      series: series.map((item) => ({
        version: item.key,
        data: item.data.map((point) => ({ bucket: point.bucket, count: point.count })),
      })),
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
   * 客户端系统版本分布，最常见的在前。
   *
   * 与 client-versions 分开：那张图回答「装的是我们哪个版本」，这张回答「跑在
   * 什么系统上」，两者的下钻维度和留存诉求都不同。`platform_version` 为空串的
   * 桶表示该平台下没上报明细的流量，照样出现在结果里以免占比失真。
   */
  @Get("platform-versions")
  @RequireApiScope("stats:read")
  async getPlatformVersions(
    @Param("projectKey") projectKey: string,
    @Query() query: QueryPlatformVersionStatsDto,
  ) {
    const range = this.resolveRange(query)
    const { total, buckets } = await this.requestStatsService.getPlatformVersionBreakdown(
      projectKey,
      range,
      query.limit,
    )

    return {
      start_time: range.startTime,
      end_time: range.endTime,
      total,
      data: buckets.map((item) => ({
        platform: item.platform,
        platform_version: item.platformVersion,
        count: item.count,
      })),
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
