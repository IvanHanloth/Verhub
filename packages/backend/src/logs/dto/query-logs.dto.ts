import { Transform } from "class-transformer"
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from "class-validator"

import { NormalizePlatform, PLATFORM_VALUES, type PlatformValue } from "../../common/platform"
import { MAX_SEARCH_LENGTH, NormalizeSearch } from "../../common/query-filters"

export class QueryLogsDto {
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
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(0)
  start_time?: number

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(0)
  end_time?: number

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(0)
  @Max(3)
  level?: number

  @IsOptional()
  @NormalizePlatform()
  @IsIn(PLATFORM_VALUES)
  platform?: PlatformValue

  /** 关键字，匹配日志内容与来源信息（IP、地区、平台版本）。 */
  @IsOptional()
  @NormalizeSearch()
  @IsString()
  @MaxLength(MAX_SEARCH_LENGTH)
  search?: string

  /**
   * 是否把已隐藏的日志也列出来。查询串里只有字符串，"true" / "1" 都当真，
   * 其余一律为假 —— 默认不返回隐藏内容。
   */
  @IsOptional()
  @Transform(({ value }) => value === true || value === "true" || value === "1")
  @IsBoolean()
  include_hidden = false
}
