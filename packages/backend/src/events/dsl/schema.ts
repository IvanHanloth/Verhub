import { Type } from "class-transformer"
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from "class-validator"

import { QueryRequestStatsDto } from "../../stats/dto/query-request-stats.dto"
import { EventFilterDto, MAX_PROPERTY_KEY_LENGTH } from "../dto/event-filter.dto"
import { MAX_EVENT_NAME_LENGTH } from "../event-name"
import { MAX_FORMULA_LENGTH } from "./formula"

/**
 * 指标 DSL：查询构建器产出的结构，也是看板卡片存下来的东西。
 *
 * 只存定义不存结果——结果随时间范围变化，缓存下来只会给出过期数字。
 *
 * 校验分两层：这里用 class-validator 挡住结构与取值范围，compile.ts 负责把
 * 属性条件编译成参数化 SQL，formula.ts 负责在不求助 eval 的前提下算公式。
 */

/** 单个事件的度量方式。 */
export const EVENT_MEASURES = ["count", "unique_users", "count_per_user"] as const
export type EventMeasure = (typeof EVENT_MEASURES)[number]

/** 别名取单个大写字母，公式里靠它引用；上限 6 个，够写任何看得懂的指标。 */
export const MAX_DSL_EVENTS = 6

export class DslEventDto {
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_EVENT_NAME_LENGTH)
  name!: string

  @IsString()
  @Matches(/^[A-Z]$/, { message: "alias 必须是单个大写字母" })
  alias!: string

  @IsOptional()
  @IsIn(EVENT_MEASURES)
  measure: EventMeasure = "count"

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => EventFilterDto)
  filters?: EventFilterDto[]
}

export class DslGroupByDto {
  @IsIn(["property", "platform", "region", "event"])
  kind!: "property" | "platform" | "region" | "event"

  /** kind = property 时必填，其余忽略。 */
  @IsOptional()
  @IsString()
  @MaxLength(MAX_PROPERTY_KEY_LENGTH)
  key?: string
}

export const DSL_QUERY_TYPES = ["timeseries", "breakdown", "value"] as const
export type DslQueryType = (typeof DSL_QUERY_TYPES)[number]

/**
 * 查询构建器只覆盖这三种类型。
 *
 * 漏斗 / 留存 / 路径各有自己的参数形状与专用端点，硬塞进同一个 DSL 会让每个
 * 字段都变成「只在某一种 type 下有意义」，前端也没法给出像样的表单。
 */
export class EventQueryDto extends QueryRequestStatsDto {
  @IsIn(DSL_QUERY_TYPES)
  type!: DslQueryType

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_DSL_EVENTS)
  @ValidateNested({ each: true })
  @Type(() => DslEventDto)
  events!: DslEventDto[]

  /** 作用于全部事件的公共条件，与各事件自己的 filters 取交集。 */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => EventFilterDto)
  filters?: EventFilterDto[]

  /**
   * 跨事件运算，例如 "A / B * 100"。给了公式就只返回一条合成序列，
   * 各事件的原始序列不再单独返回——两者同时出现只会让图例难以解释。
   */
  @IsOptional()
  @IsString()
  @MaxLength(MAX_FORMULA_LENGTH)
  formula?: string

  @IsOptional()
  @ValidateNested()
  @Type(() => DslGroupByDto)
  group_by?: DslGroupByDto

  @IsOptional()
  @IsIn(["hour", "day"])
  granularity: "hour" | "day" = "day"

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  limit: number = 20
}
