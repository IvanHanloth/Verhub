import { Transform } from "class-transformer"
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from "class-validator"

import { NormalizePlatform, PLATFORM_VALUES, type PlatformValue } from "../../common/platform"
import { MAX_SEARCH_LENGTH, NormalizeSearch } from "../../common/query-filters"

export class QueryFeedbacksDto {
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

  /**
   * 是否把已隐藏的反馈也列出来。查询串里只有字符串，"true" / "1" 都当真，
   * 其余一律为假 —— 默认不返回隐藏内容。
   */
  @IsOptional()
  @Transform(({ value }) => value === true || value === "true" || value === "1")
  @IsBoolean()
  include_hidden = false

  /** 关键字，匹配反馈内容、用户 ID、联系方式与来源信息。 */
  @IsOptional()
  @NormalizeSearch()
  @IsString()
  @MaxLength(MAX_SEARCH_LENGTH)
  search?: string

  @IsOptional()
  @NormalizePlatform()
  @IsIn(PLATFORM_VALUES)
  platform?: PlatformValue

  /** 只看某个评分的反馈；未评分的行不会命中任何评分值。 */
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(5)
  rating?: number
}
