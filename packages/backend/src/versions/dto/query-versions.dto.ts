import { Transform } from "class-transformer"
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from "class-validator"

import { LOCALE_PATTERN, MAX_LOCALE_LENGTH, NormalizeLocale } from "../../common/locale"
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

  /**
   * 语言偏好。命中项目注册的语言（大小写不敏感）且该版本有对应译文时返回译文，
   * 否则一律回落版本的默认内容。后台列表不受影响，永远返回默认内容与全部译文。
   */
  @IsOptional()
  @NormalizeLocale()
  @IsString()
  @MaxLength(MAX_LOCALE_LENGTH)
  @Matches(LOCALE_PATTERN, { message: "locale format is invalid" })
  locale?: string
}

/**
 * 只带语言偏好的查询串，给 latest / latest-preview / by-version 三个单条端点用。
 * 它们没有分页与筛选，套完整的 QueryVersionsDto 会凭空多出一堆可传参数。
 */
export class QueryVersionLocaleDto {
  @IsOptional()
  @NormalizeLocale()
  @IsString()
  @MaxLength(MAX_LOCALE_LENGTH)
  @Matches(LOCALE_PATTERN, { message: "locale format is invalid" })
  locale?: string
}
