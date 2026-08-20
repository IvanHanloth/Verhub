import { Transform } from "class-transformer"
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from "class-validator"

import { NormalizePlatform, PLATFORM_VALUES, type PlatformValue } from "../../common/platform"
import {
  MAX_SEARCH_LENGTH,
  NormalizeOptionalBoolean,
  NormalizeSearch,
} from "../../common/query-filters"

export class QueryVersionsDto {
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

  /** 关键字，匹配版本号、可比较版本号与更新标题/正文。 */
  @IsOptional()
  @NormalizeSearch()
  @IsString()
  @MaxLength(MAX_SEARCH_LENGTH)
  search?: string

  /** 只看面向该平台发布的版本；未限定平台（platforms 为空）的版本对所有平台可见。 */
  @IsOptional()
  @NormalizePlatform()
  @IsIn(PLATFORM_VALUES)
  platform?: PlatformValue

  @IsOptional()
  @NormalizeOptionalBoolean()
  @IsBoolean()
  is_preview?: boolean

  @IsOptional()
  @NormalizeOptionalBoolean()
  @IsBoolean()
  is_deprecated?: boolean

  @IsOptional()
  @NormalizeOptionalBoolean()
  @IsBoolean()
  is_milestone?: boolean

  @IsOptional()
  @NormalizeOptionalBoolean()
  @IsBoolean()
  forced?: boolean
}
