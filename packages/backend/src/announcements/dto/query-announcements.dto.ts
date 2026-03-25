import { Transform } from "class-transformer"
import { IsIn, IsInt, IsOptional, Max, Min } from "class-validator"

const clientPlatforms = ["ios", "android", "windows", "mac", "web"] as const

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
  @Transform(({ value }) => (typeof value === "string" ? value.trim().toLowerCase() : value))
  @IsIn(clientPlatforms)
  platform?: (typeof clientPlatforms)[number]
}
