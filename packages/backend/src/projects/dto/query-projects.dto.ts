import { Transform } from "class-transformer"
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from "class-validator"

import { MAX_SEARCH_LENGTH, NormalizeSearch } from "../../common/query-filters"

export class QueryProjectsDto {
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

  /** 关键字，匹配 project_key、名称、描述、作者与仓库地址。 */
  @IsOptional()
  @NormalizeSearch()
  @IsString()
  @MaxLength(MAX_SEARCH_LENGTH)
  search?: string
}
