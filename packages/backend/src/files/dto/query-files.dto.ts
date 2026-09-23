import { Transform } from "class-transformer"
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from "class-validator"

import { MAX_SEARCH_LENGTH, NormalizeSearch } from "../../common/query-filters"
import { FILE_STATUSES, type FileStatusValue } from "../types"

export class QueryFilesDto {
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

  /** 关键字，匹配文件名、文件 id 与 SHA-256。 */
  @IsOptional()
  @NormalizeSearch()
  @IsString()
  @MaxLength(MAX_SEARCH_LENGTH)
  search?: string

  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === "string" && value ? value.toLowerCase() : undefined,
  )
  @IsIn(FILE_STATUSES)
  status?: FileStatusValue
}
