import { IsBoolean, IsOptional, IsString, MaxLength } from "class-validator"

export class CheckVersionUpdateDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  current_version?: string

  @IsOptional()
  @IsString()
  @MaxLength(64)
  current_comparable_version?: string

  @IsOptional()
  @IsBoolean()
  include_preview?: boolean
}
