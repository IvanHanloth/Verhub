import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common"

import { AdminOrApiKeyGuard } from "../auth/guards/admin-or-api-key.guard"
import { RequireApiScope } from "../auth/guards/api-scope.decorator"
import { nowSeconds } from "../common/utils"
import { resolveStatsRange, type StatsRange } from "../stats/bucket-utils"
import { EventQueryDto } from "./dsl/schema"
import { CreateDashboardCardDto, UpdateDashboardCardDto } from "./dto/dashboard-card.dto"
import {
  QueryEventBreakdownDto,
  QueryEventDefinitionsDto,
  QueryEventTimeseriesDto,
  QueryFunnelDto,
  QueryPathsDto,
  QueryRetentionDto,
  UpdateEventDefinitionDto,
} from "./dto/query-events.dto"
import { EventsAnalysisService } from "./events-analysis.service"
import { EventsDashboardService } from "./events-dashboard.service"
import { EventsDefinitionsService } from "./events-definitions.service"
import { EventsIngestService } from "./events-ingest.service"
import { EventsQueryService } from "./events-query.service"
import { EventsStatsService } from "./events-stats.service"

/**
 * 事件分析的管理端接口。
 *
 * 分工与 stats 模块一致：`stats/*` 走小时汇总，`analysis/*` 走明细。凡是需要按
 * 标识去重或者串联时间序列的问题都在后者，因为汇总表按设计不含 distinctId。
 */
@Controller("admin/projects/:projectKey/events")
@UseGuards(AdminOrApiKeyGuard)
export class EventsAdminController {
  constructor(
    private readonly definitionsService: EventsDefinitionsService,
    private readonly statsService: EventsStatsService,
    private readonly analysisService: EventsAnalysisService,
    private readonly queryService: EventsQueryService,
    private readonly dashboardService: EventsDashboardService,
    private readonly ingestService: EventsIngestService,
  ) {}

  /**
   * 自动发现的事件清单。
   *
   * 没有对应的「新建事件」接口：定义由采集端在第一次收到某个事件名时自动登记。
   * 这正是与旧 Action 模型的关键差别——上报不再需要任何前置的后台操作。
   */
  @Get("definitions")
  @RequireApiScope("events:read")
  async listDefinitions(
    @Param("projectKey") projectKey: string,
    @Query() query: QueryEventDefinitionsDto,
  ) {
    const range = this.resolveRange(query)
    return this.definitionsService.findAll(projectKey, query, range)
  }

  @Patch("definitions/:definitionId")
  @RequireApiScope("events:write")
  async updateDefinition(
    @Param("definitionId") definitionId: string,
    @Body() dto: UpdateEventDefinitionDto,
  ) {
    return this.definitionsService.update(definitionId, dto)
  }

  /** 只删定义本身，明细与汇总保留；下一次上报会把定义重新建回来。 */
  @Delete("definitions/:definitionId")
  @RequireApiScope("events:write")
  async removeDefinition(@Param("definitionId") definitionId: string) {
    await this.definitionsService.remove(definitionId)
    return { success: true }
  }

  @Get("stats/overview")
  @RequireApiScope("events:read")
  async getOverview(
    @Param("projectKey") projectKey: string,
    @Query() query: QueryEventDefinitionsDto,
  ) {
    const range = this.resolveRange(query)
    const overview = await this.statsService.getOverview(projectKey, range)
    return { start_time: range.startTime, end_time: range.endTime, ...overview }
  }

  /**
   * 事件量随时间变化。
   *
   * `data` 是总量，永远返回；给了 `group_by` 时额外返回拆开的 `series`，供堆叠图
   * 使用。两者并列而不是二选一——堆叠图的包络线就是总量，调用方两个都要。
   */
  @Get("stats/timeseries")
  @RequireApiScope("events:read")
  async getTimeseries(
    @Param("projectKey") projectKey: string,
    @Query() query: QueryEventTimeseriesDto,
  ) {
    const range = this.resolveRange(query)
    const { total, series } = await this.statsService.getTimeseries(projectKey, range, query)

    return {
      start_time: range.startTime,
      end_time: range.endTime,
      granularity: query.granularity,
      tz_offset_minutes: query.tz_offset_minutes,
      event_name: query.event_name ?? null,
      group_by: query.group_by ?? null,
      data: total.data,
      series: query.group_by ? series : null,
    }
  }

  /**
   * 分布。`total` 是全量而非分页后的和，让调用方在 limit 截尾后仍能算出真实占比。
   */
  @Get("stats/breakdown")
  @RequireApiScope("events:read")
  async getBreakdown(
    @Param("projectKey") projectKey: string,
    @Query() query: QueryEventBreakdownDto,
  ) {
    if (query.dimension === "property" && !query.property_key) {
      throw new BadRequestException("dimension 为 property 时必须提供 property_key")
    }

    const range = this.resolveRange(query)
    const { total, buckets } = await this.statsService.getBreakdown(projectKey, range, query)

    return {
      start_time: range.startTime,
      end_time: range.endTime,
      dimension: query.dimension,
      property_key: query.property_key ?? null,
      total,
      data: buckets,
    }
  }

  /** 事件量折到星期 × 小时，按来源时区折叠；固定 168 格。 */
  @Get("stats/heatmap")
  @RequireApiScope("events:read")
  async getHeatmap(
    @Param("projectKey") projectKey: string,
    @Query() query: QueryEventBreakdownDto,
  ) {
    const range = this.resolveRange(query)
    const cells = await this.statsService.getHeatmap(
      projectKey,
      range,
      query.tz_offset_minutes,
      query.event_name,
    )

    return {
      start_time: range.startTime,
      end_time: range.endTime,
      tz_offset_minutes: query.tz_offset_minutes,
      data: cells,
    }
  }

  /**
   * 漏斗转化。用 POST 是因为步骤是带属性条件的结构化数组，塞进 query string
   * 既超长又要自己发明一套编码。
   */
  @Post("analysis/funnel")
  // 只读端点，用 POST 只为承载结构化入参；Nest 对 POST 默认回 201，
  // 那会让「创建了什么」这个语义凭空出现，也与契约里写的 200 对不上。
  @HttpCode(HttpStatus.OK)
  @RequireApiScope("events:read")
  async getFunnel(@Param("projectKey") projectKey: string, @Body() dto: QueryFunnelDto) {
    const range = this.resolveRange(dto)
    const { steps } = await this.analysisService.getFunnel(projectKey, range, dto)
    return {
      start_time: range.startTime,
      end_time: range.endTime,
      window_seconds: dto.window_seconds,
      data: steps,
    }
  }

  @Post("analysis/retention")
  // 只读端点，用 POST 只为承载结构化入参；Nest 对 POST 默认回 201，
  // 那会让「创建了什么」这个语义凭空出现，也与契约里写的 200 对不上。
  @HttpCode(HttpStatus.OK)
  @RequireApiScope("events:read")
  async getRetention(@Param("projectKey") projectKey: string, @Body() dto: QueryRetentionDto) {
    const range = this.resolveRange(dto)
    const result = await this.analysisService.getRetention(projectKey, range, dto)
    return { start_time: range.startTime, end_time: range.endTime, ...result }
  }

  @Post("analysis/paths")
  // 只读端点，用 POST 只为承载结构化入参；Nest 对 POST 默认回 201，
  // 那会让「创建了什么」这个语义凭空出现，也与契约里写的 200 对不上。
  @HttpCode(HttpStatus.OK)
  @RequireApiScope("events:read")
  async getPaths(@Param("projectKey") projectKey: string, @Body() dto: QueryPathsDto) {
    const range = this.resolveRange(dto)
    const { edges, truncated } = await this.analysisService.getPaths(projectKey, range, dto)
    return {
      start_time: range.startTime,
      end_time: range.endTime,
      scope: dto.scope,
      depth: dto.depth,
      // 有分支被并入「其他」时明确告知，免得看图的人以为这就是全部路径。
      truncated,
      data: edges,
    }
  }

  /** 指标 DSL 求值，查询构建器与看板卡片共用这一个入口。 */
  @Post("analysis/query")
  // 只读端点，用 POST 只为承载结构化入参；Nest 对 POST 默认回 201，
  // 那会让「创建了什么」这个语义凭空出现，也与契约里写的 200 对不上。
  @HttpCode(HttpStatus.OK)
  @RequireApiScope("events:read")
  async runQuery(@Param("projectKey") projectKey: string, @Body() dto: EventQueryDto) {
    const range = this.resolveRange(dto)
    const result = await this.queryService.run(projectKey, range, dto)
    return { start_time: range.startTime, end_time: range.endTime, ...result }
  }

  @Get("dashboards/cards")
  @RequireApiScope("events:read")
  async listCards(@Param("projectKey") projectKey: string) {
    return this.dashboardService.findAll(projectKey)
  }

  @Post("dashboards/cards")
  @RequireApiScope("events:write")
  async createCard(@Param("projectKey") projectKey: string, @Body() dto: CreateDashboardCardDto) {
    return this.dashboardService.create(projectKey, dto)
  }

  @Patch("dashboards/cards/:cardId")
  @RequireApiScope("events:write")
  async updateCard(@Param("cardId") cardId: string, @Body() dto: UpdateDashboardCardDto) {
    return this.dashboardService.update(cardId, dto)
  }

  @Delete("dashboards/cards/:cardId")
  @RequireApiScope("events:write")
  async removeCard(@Param("cardId") cardId: string) {
    await this.dashboardService.remove(cardId)
    return { success: true }
  }

  /**
   * 代最终用户行使删除权（GDPR Art.17）。
   *
   * 与公开的自助端点删同样的范围。接入方需要它是因为用户往往通过客服而不是
   * 应用内按钮提出请求，而接入方手上只有那个 distinct_id。
   */
  @Delete("subjects/:distinctId")
  @RequireApiScope("events:write")
  async deleteSubject(
    @Param("projectKey") projectKey: string,
    @Param("distinctId") distinctId: string,
  ) {
    const { deleted } = await this.ingestService.deleteSubject(projectKey, distinctId)
    return { success: true, deleted }
  }

  private resolveRange(query: { start_time?: number; end_time?: number }): StatsRange {
    try {
      return resolveStatsRange(query, nowSeconds())
    } catch (error: unknown) {
      throw new BadRequestException(
        error instanceof RangeError ? error.message : "无法解析时间区间",
      )
    }
  }
}
