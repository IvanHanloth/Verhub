import { IsBoolean, IsOptional, IsString, Matches, MaxLength } from "class-validator"

const COMPARABLE_VERSION_PATTERN =
  /^(?<core>\d+(?:\.\d+)*)(?:-(?<tag>alpha|beta|rc)(?:\.(?<tail>\d+(?:\.\d+)*))?)?$/

export class CheckVersionUpdateDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  current_version?: string

  @IsOptional()
  @IsString()
  @MaxLength(64)
  @Matches(COMPARABLE_VERSION_PATTERN, {
    message: "current_comparable_version format is invalid",
  })
  current_comparable_version?: string

  @IsOptional()
  @IsBoolean()
  include_preview?: boolean
}
