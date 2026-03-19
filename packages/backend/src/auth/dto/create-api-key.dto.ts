import { Transform } from "class-transformer"
import { IsArray, IsInt, IsOptional, IsString, Max, MaxLength, Min } from "class-validator"

export class CreateApiKeyDto {
  @IsString()
  @MaxLength(64)
  name!: string

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  @Transform(({ value }) =>
    Array.isArray(value) ? value.map((item) => String(item).trim()).filter(Boolean) : [],
  )
  scopes?: string[]

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  expires_in_days?: number
}
