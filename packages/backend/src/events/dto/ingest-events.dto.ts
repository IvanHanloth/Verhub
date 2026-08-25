import { Type } from "class-transformer"
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from "class-validator"

import { DEFAULT_EVENT_BATCH_MAX } from "../event-config"
import { MAX_EVENT_NAME_LENGTH } from "../event-name"

/** 标识符长度上限。UUID 是 36 字符，留出余量给接入方自带的业务标识。 */
export const MAX_IDENTIFIER_LENGTH = 128

export class IngestEventItemDto {
  /**
   * 客户端生成的幂等键。离线队列重试补发时靠它去重，见
   * EventRecord 的 (projectKey, eventId) 唯一索引。
   */
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_IDENTIFIER_LENGTH)
  event_id!: string

  /** 事件名。归一化与字符集校验在 normalizeEventName，这里只挡明显超长。 */
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_EVENT_NAME_LENGTH)
  name!: string

  /** 客户端声明的发生时间（Unix 秒）。缺省或超出可信窗口时用服务端接收时间。 */
  @IsOptional()
  @IsInt()
  @Min(0)
  occurred_at?: number

  /** 接入方自定义的扁平属性。深层结构不会被拒绝，但按属性统计只看第一层。 */
  @IsOptional()
  @IsObject()
  properties?: Record<string, unknown>
}

/**
 * 批量上报的载荷。
 *
 * 单条上报也走这个形状：SDK 侧统一进队列再批量发，服务端没有必要维护两条写入路径。
 */
export class IngestEventsDto {
  /** 客户端生成的匿名标识（随机 UUID，非设备指纹）。 */
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_IDENTIFIER_LENGTH)
  distinct_id!: string

  @IsOptional()
  @IsString()
  @MaxLength(MAX_IDENTIFIER_LENGTH)
  session_id?: string

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(DEFAULT_EVENT_BATCH_MAX)
  @ValidateNested({ each: true })
  @Type(() => IngestEventItemDto)
  events!: IngestEventItemDto[]

  /** 平台与系统版本也可以走请求头或 query，优先级见 ClientOriginService。 */
  @IsOptional()
  @IsString()
  platform?: string

  @IsOptional()
  @IsString()
  platform_version?: string
}

/** 数据主体权利端点的入参：只认标识本身，不接受任何模糊匹配。 */
export class EventSubjectDto {
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_IDENTIFIER_LENGTH)
  distinct_id!: string
}
