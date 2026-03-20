import { IsInt, IsOptional, Max, Min } from "class-validator"

export class RotateApiKeyDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(7 * 24 * 60)
  grace_period_minutes?: number
}
