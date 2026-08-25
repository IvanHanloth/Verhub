import { Transform, Type } from "class-transformer"
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from "class-validator"

import { QueryRequestStatsDto } from "../../stats/dto/query-request-stats.dto"
import {
  MAX_SEARCH_LENGTH,
  NormalizeOptionalBoolean,
  NormalizeSearch,
} from "../../common/query-filters"
import { MAX_EVENT_NAME_LENGTH } from "../event-name"
import { EventFilterDto } from "./event-filter.dto"

/** Transform that coerces a query-string value to a number, preserving undefined. */
function NumberTransform() {
  return Transform(({ value }: { value: unknown }) =>
    value === undefined || value === null || value === "" ? undefined : Number(value),
  )
}

/** 事件清单的分页与筛选。区间参数复用自 QueryRequestStatsDto，用于算区间内计数。 */
export class QueryEventDefinitionsDto extends QueryRequestStatsDto {
  @IsOptional()
  @NumberTransform()
  @IsInt()
  @Min(1)
  @Max(200)
  limit: number = 50

  @IsOptional()
  @NumberTransform()
  @IsInt()
  @Min(0)
  offset: number = 0

  @IsOptional()
  @NormalizeSearch()
  @IsString()
  @MaxLength(MAX_SEARCH_LENGTH)
  search?: string

  /** 默认不含已归档的事件；要看全量时显式传 true。 */
  @IsOptional()
  @NormalizeOptionalBoolean()
  @IsBoolean()
  include_archived: boolean = false
}

export class UpdateEventDefinitionDto {
  @IsOptional()
  @IsString()
  @MaxLength(128)
  display_name?: string

  @IsOptional()
  @IsString()
  @MaxLength(512)
  description?: string

  @IsOptional()
  @IsBoolean()
  archived?: boolean
}

/** 趋势可拆分的维度。event 是自由文本但受 limit 截断，其余两个是低基数枚举列。 */
export type EventTimeseriesGroupBy = "event" | "platform" | "region"

export class QueryEventTimeseriesDto extends QueryRequestStatsDto {
  @IsOptional()
  @IsIn(["hour", "day"])
  granularity: "hour" | "day" = "day"

  /** 只看某一个事件的趋势；不传则是全部事件的总量。 */
  @IsOptional()
  @IsString()
  @MaxLength(MAX_EVENT_NAME_LENGTH)
  event_name?: string

  @IsOptional()
  @IsIn(["event", "platform", "region"])
  group_by?: EventTimeseriesGroupBy

  /** 拆分序列数上限。折线图里超过六七条就分不清颜色了。 */
  @IsOptional()
  @NumberTransform()
  @IsInt()
  @Min(1)
  @Max(20)
  limit: number = 8
}

/** 分布图的默认行数；尾巴由调用方按真实 total 汇成「其他」。 */
export const DEFAULT_EVENT_BREAKDOWN_LIMIT = 20
export const MAX_EVENT_BREAKDOWN_LIMIT = 200

export class QueryEventBreakdownDto extends QueryRequestStatsDto {
  /**
   * 分布的维度。传 property 时必须同时给 property_key——属性分布走明细表，
   * 与其余三个走汇总表的维度不是一条查询路径。
   */
  @IsOptional()
  @IsIn(["event", "platform", "region", "property"])
  dimension: "event" | "platform" | "region" | "property" = "event"

  @IsOptional()
  @IsString()
  @MaxLength(128)
  property_key?: string

  /** 限定到某个事件再看属性分布，例如「checkout_clicked 的 plan 取值分布」。 */
  @IsOptional()
  @IsString()
  @MaxLength(MAX_EVENT_NAME_LENGTH)
  event_name?: string

  @IsOptional()
  @NumberTransform()
  @IsInt()
  @Min(1)
  @Max(MAX_EVENT_BREAKDOWN_LIMIT)
  limit: number = DEFAULT_EVENT_BREAKDOWN_LIMIT
}

/** 漏斗步数上限。每一步都要多一次 LATERAL 连接，放开会让查询规模失控。 */
export const MAX_FUNNEL_STEPS = 8

/** 转化窗口上限（秒）。30 天以上的「转化」在业务上已经不是同一件事了。 */
export const MAX_FUNNEL_WINDOW_SECONDS = 30 * 86400

export class FunnelStepDto {
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_EVENT_NAME_LENGTH)
  event_name!: string

  /** 该步骤额外的属性条件，例如「plan = pro 的下单」。 */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => EventFilterDto)
  filters?: EventFilterDto[]
}

export class QueryFunnelDto extends QueryRequestStatsDto {
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(MAX_FUNNEL_STEPS)
  @ValidateNested({ each: true })
  @Type(() => FunnelStepDto)
  steps!: FunnelStepDto[]

  /** 从第一步算起的转化窗口，默认 7 天。 */
  @IsOptional()
  @NumberTransform()
  @IsInt()
  @Min(60)
  @Max(MAX_FUNNEL_WINDOW_SECONDS)
  window_seconds: number = 7 * 86400
}

/** 留存矩阵的周期数上限。行列都是这个数，超过屏幕也放不下。 */
export const MAX_RETENTION_PERIODS = 30

export class QueryRetentionDto extends QueryRequestStatsDto {
  /** 把人纳入队列的起始事件，例如首次启动。 */
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_EVENT_NAME_LENGTH)
  start_event!: string

  /** 判定「回来了」的事件；不传则任意事件都算回访。 */
  @IsOptional()
  @IsString()
  @MaxLength(MAX_EVENT_NAME_LENGTH)
  return_event?: string

  @IsOptional()
  @IsIn(["day", "week"])
  period: "day" | "week" = "day"

  @IsOptional()
  @NumberTransform()
  @IsInt()
  @Min(2)
  @Max(MAX_RETENTION_PERIODS)
  periods: number = 14
}

/** 路径深度上限。桑基图超过六层就没人看得懂了，查询代价也随层数线性增长。 */
export const MAX_PATH_DEPTH = 6

export class QueryPathsDto extends QueryRequestStatsDto {
  /** 路径起点；不传则从每个会话的第一个事件开始。 */
  @IsOptional()
  @IsString()
  @MaxLength(MAX_EVENT_NAME_LENGTH)
  start_event?: string

  @IsOptional()
  @NumberTransform()
  @IsInt()
  @Min(2)
  @Max(MAX_PATH_DEPTH)
  depth: number = 4

  /** 每一层保留的分支数，其余并入「其他」。 */
  @IsOptional()
  @NumberTransform()
  @IsInt()
  @Min(1)
  @Max(20)
  branch_limit: number = 5

  /**
   * 按会话还是按人串路径。
   *
   * 默认按会话：跨会话把「昨天看了详情页、今天下了单」连成一条边，
   * 会让路径图显示出用户从来没有连续做过的动作序列。
   */
  @IsOptional()
  @IsIn(["session", "user"])
  scope: "session" | "user" = "session"
}
