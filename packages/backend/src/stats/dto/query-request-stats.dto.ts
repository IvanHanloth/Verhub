import { Transform } from "class-transformer"
import { IsEnum, IsIn, IsInt, IsOptional, Min } from "class-validator"
import { PublicEndpoint } from "@prisma/client"

/** Transform that coerces a query-string value to a number, preserving undefined. */
function NumberTransform() {
  return Transform(({ value }: { value: unknown }) =>
    value === undefined || value === null || value === "" ? undefined : Number(value),
  )
}

export class QueryRequestStatsDto {
  @IsOptional()
  @NumberTransform()
  @IsInt()
  @Min(0)
  start_time?: number

  @IsOptional()
  @NumberTransform()
  @IsInt()
  @Min(0)
  end_time?: number
}

export class QueryRequestTimeseriesDto extends QueryRequestStatsDto {
  @IsOptional()
  @IsIn(["hour", "day"])
  granularity: "hour" | "day" = "hour"

  @IsOptional()
  @IsEnum(PublicEndpoint)
  endpoint?: PublicEndpoint
}
