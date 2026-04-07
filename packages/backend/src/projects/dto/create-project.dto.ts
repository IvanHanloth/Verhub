import { Transform } from "class-transformer"
import {
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
  Min,
  ValidateIf,
} from "class-validator"

const COMPARABLE_VERSION_PATTERN =
  /^(?<core>\d+(?:\.\d+)*)(?:-(?<tag>alpha|beta|rc)(?:\.(?<tail>\d+(?:\.\d+)*))?)?$/

/**
 * Transform that normalizes empty / whitespace-only strings to `null`.
 * Preserves `undefined` (property not sent) and `null` (explicit clear).
 */
function NullableStringTransform() {
  return Transform(({ value }: { value: unknown }) => {
    if (value === undefined) return undefined
    if (value === null) return null
    if (typeof value === "string") {
      const trimmed = value.trim()
      return trimmed.length > 0 ? trimmed : null
    }
    return value
  })
}

export class CreateProjectDto {
  @IsString()
  @MaxLength(64)
  project_key!: string

  @IsString()
  @MaxLength(128)
  name!: string

  @IsOptional()
  @IsString()
  @MaxLength(512)
  repo_url?: string

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  description?: string

  @IsOptional()
  @IsString()
  @MaxLength(128)
  author?: string

  @IsOptional()
  @IsUrl({ require_protocol: true })
  @MaxLength(512)
  author_homepage_url?: string

  @IsOptional()
  @IsUrl({ require_protocol: true })
  @MaxLength(1024)
  icon_url?: string

  @IsOptional()
  @IsUrl({ require_protocol: true })
  @MaxLength(512)
  website_url?: string

  @IsOptional()
  @IsInt()
  @Min(0)
  published_at?: number

  @NullableStringTransform()
  @ValidateIf((_object, value) => value !== null && value !== undefined)
  @IsString()
  @MaxLength(64)
  @Matches(COMPARABLE_VERSION_PATTERN, {
    message: "optional_update_min_comparable_version format is invalid",
  })
  optional_update_min_comparable_version?: string | null

  @NullableStringTransform()
  @ValidateIf((_object, value) => value !== null && value !== undefined)
  @IsString()
  @MaxLength(64)
  @Matches(COMPARABLE_VERSION_PATTERN, {
    message: "optional_update_max_comparable_version format is invalid",
  })
  optional_update_max_comparable_version?: string | null
}
