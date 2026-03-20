import { Transform } from "class-transformer"
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from "class-validator"

export class UpdateApiKeyDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  name?: string

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  @Transform(({ value }) =>
    Array.isArray(value) ? value.map((item) => String(item).trim()).filter(Boolean) : undefined,
  )
  scopes?: string[]

  @IsOptional()
  @IsBoolean()
  all_projects?: boolean

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  @Transform(({ value }) =>
    Array.isArray(value)
      ? Array.from(new Set(value.map((item) => String(item).trim()).filter(Boolean)))
      : undefined,
  )
  project_ids?: string[]

  @IsOptional()
  @IsBoolean()
  never_expires?: boolean

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  expires_in_days?: number
}
