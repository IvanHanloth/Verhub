import { BadRequestException, Controller, Get, Param, Query, UseGuards } from "@nestjs/common"

import { AdminOrApiKeyGuard } from "../auth/guards/admin-or-api-key.guard"
import { RequireApiScope } from "../auth/guards/api-scope.decorator"
import { nowSeconds } from "../common/utils"
import { ContentStatsService } from "./content-stats.service"
import { QueryRequestStatsDto } from "./dto/query-request-stats.dto"
import { DAY_SECONDS, StatsRange } from "./request-stats.service"

/** Default window when the caller does not specify one: the last 7 days. */
const DEFAULT_RANGE_SECONDS = 7 * DAY_SECONDS

/**
 * 日志与反馈的分布查询。
 *
 * 与 `RequestStatsController` 同在 `/stats` 下但分成两个控制器：那边是公开接口
 * 调用量的聚合，权限走 `stats:read`；这里读的是日志与反馈明细，沿用各自模块的
 * scope，一个项目只授了 `logs:read` 的 Key 不该顺带拿到反馈内容的分布。
 */
@Controller("admin/projects/:projectKey/stats")
@UseGuards(AdminOrApiKeyGuard)
export class ContentStatsController {
  constructor(private readonly contentStatsService: ContentStatsService) {}

  /** 各等级日志条数，四个等级恒定返回（含 0 条的）。 */
  @Get("logs")
  @RequireApiScope("logs:read")
  async getLogStats(@Param("projectKey") projectKey: string, @Query() query: QueryRequestStatsDto) {
    const range = this.resolveRange(query)
    const { total, buckets } = await this.contentStatsService.getLogLevelBreakdown(
      projectKey,
      range,
    )

    return {
      start_time: range.startTime,
      end_time: range.endTime,
      total,
      by_level: buckets.map((item) => ({ level: item.level, count: item.count })),
    }
  }

  /** 反馈评分直方图；`unrated` 是没打分的那部分，不并入任何档位。 */
  @Get("feedbacks")
  @RequireApiScope("feedbacks:read")
  async getFeedbackStats(
    @Param("projectKey") projectKey: string,
    @Query() query: QueryRequestStatsDto,
  ) {
    const range = this.resolveRange(query)
    const { total, unrated, averageRating, buckets } =
      await this.contentStatsService.getFeedbackRatingBreakdown(projectKey, range)

    return {
      start_time: range.startTime,
      end_time: range.endTime,
      total,
      unrated,
      average_rating: averageRating,
      by_rating: buckets.map((item) => ({ rating: item.rating, count: item.count })),
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
