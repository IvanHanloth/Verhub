import { IsIn, IsOptional, IsString, MaxLength, MinLength } from "class-validator"

/**
 * 属性筛选条件。
 *
 * 这是 DSL 与漏斗共用的安全边界：`op` 是闭集，`property` 与 `value` 只以**参数**
 * 的形式进入 SQL，从不参与字符串拼接。编译逻辑在 dsl/compile.ts，任何新增算子
 * 都要在那里补一条参数化分支，不能图省事拼字符串。
 */
export const EVENT_FILTER_OPS = [
  "eq",
  "neq",
  "in",
  "not_in",
  "contains",
  "gt",
  "gte",
  "lt",
  "lte",
  "exists",
  "not_exists",
] as const

export type EventFilterOp = (typeof EVENT_FILTER_OPS)[number]

/** 属性名长度上限。超长的键名不会是真实埋点，只会是构造出来撑爆索引的输入。 */
export const MAX_PROPERTY_KEY_LENGTH = 128

/** 单个筛选值的长度上限。 */
export const MAX_FILTER_VALUE_LENGTH = 512

/** `in` / `not_in` 的取值个数上限。 */
export const MAX_FILTER_VALUES = 50

export class EventFilterDto {
  /**
   * 属性路径。只支持 properties 的第一层键，不支持嵌套路径表达式——
   * 放开点号路径就等于开放一个小型查询语言，而按属性分组本来只看第一层。
   */
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_PROPERTY_KEY_LENGTH)
  property!: string

  @IsIn(EVENT_FILTER_OPS)
  op!: EventFilterOp

  /**
   * 比较值。exists / not_exists 不需要，in / not_in 用逗号分隔或者数组。
   * 统一在编译期规范成字符串数组，比较一律按文本进行——properties 是 JSONB，
   * 同一个键在不同上报里可能是数字也可能是字符串，按文本比较才不会漏。
   */
  @IsOptional()
  value?: string | number | boolean | Array<string | number | boolean>
}
