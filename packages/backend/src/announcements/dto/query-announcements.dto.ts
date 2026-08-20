import { Transform } from "class-transformer"
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from "class-validator"

import { NormalizePlatform, PLATFORM_VALUES, type PlatformValue } from "../../common/platform"
import {
  MAX_SEARCH_LENGTH,
  NormalizeOptionalBoolean,
  NormalizeSearch,
} from "../../common/query-filters"

export class QueryAnnouncementsDto {
  @IsOptional()
  @Transform(({ value }) => Number(value ?? 20))
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20

  @IsOptional()
  @Transform(({ value }) => Number(value ?? 0))
  @IsInt()
  @Min(0)
  offset = 0

  @IsOptional()
  @NormalizePlatform()
  @IsIn(PLATFORM_VALUES)
  platform?: PlatformValue

  /** 关键字，匹配标题、正文与作者。 */
  @IsOptional()
  @NormalizeSearch()
  @IsString()
  @MaxLength(MAX_SEARCH_LENGTH)
  search?: string

  /** 只看置顶 / 只看非置顶；不传则不限。 */
  @IsOptional()
  @NormalizeOptionalBoolean()
  @IsBoolean()
  is_pinned?: boolean

  /**
   * 只看隐藏 / 只看可见；不传则不限。
   *
   * 与反馈、日志的 include_hidden 不同：公告的隐藏是发布流程的一部分（先建后放），
   * 后台默认就要能看见隐藏的公告，所以这里是个筛选维度而不是「要不要带出来」的开关。
   * 公开端不受此参数影响，永远只返回未隐藏的公告。
   */
  @IsOptional()
  @NormalizeOptionalBoolean()
  @IsBoolean()
  is_hidden?: boolean
}
