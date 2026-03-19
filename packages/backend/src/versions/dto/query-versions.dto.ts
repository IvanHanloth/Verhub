import { Transform } from "class-transformer"
import { IsInt, IsOptional, Max, Min } from "class-validator"

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
}
