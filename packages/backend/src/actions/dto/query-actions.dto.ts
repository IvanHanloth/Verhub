import { Type } from "class-transformer"
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from "class-validator"

import { MAX_SEARCH_LENGTH, NormalizeSearch } from "../../common/query-filters"

export class QueryActionsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset = 0

  /**
   * 关键字。行为定义按名称与描述匹配；行为记录列表不使用该参数——记录里能读的
   * 只有 custom_data / http 这两个 JSON 列，做子串匹配既慢又无从解释命中在哪。
   */
  @IsOptional()
  @NormalizeSearch()
  @IsString()
  @MaxLength(MAX_SEARCH_LENGTH)
  search?: string
}
