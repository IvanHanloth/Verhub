import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from "class-validator"
import { Type } from "class-transformer"

import { NormalizePlatform, PLATFORM_VALUES, type PlatformValue } from "../../common/platform"

const COMPARABLE_VERSION_PATTERN =
  /^(?<core>\d+(?:\.\d+)*)(?:-(?<tag>alpha|beta|rc)(?:\.(?<tail>\d+(?:\.\d+)*))?)?$/

export class VersionDownloadLinkDto {
  @IsString()
  @IsUrl({ require_protocol: true })
  @MaxLength(2048)
  url!: string

  @IsOptional()
  @IsString()
  @MaxLength(128)
  name?: string

  @IsOptional()
  @IsString()
  @MaxLength(64)
  platform?: string
}

export class CreateVersionDto {
  @IsString()
  @MaxLength(64)
  version!: string

  @IsString()
  @MaxLength(64)
  @Matches(COMPARABLE_VERSION_PATTERN, {
    message: "comparable_version format is invalid",
  })
  comparable_version!: string

  @IsOptional()
  @IsString()
  @MaxLength(128)
  title?: string | null

  @IsOptional()
  @IsString()
  @MaxLength(4096)
  content?: string | null

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  download_url?: string | null

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => VersionDownloadLinkDto)
  @ArrayMaxSize(32)
  download_links?: VersionDownloadLinkDto[]

  @IsOptional()
  @IsBoolean()
  is_latest?: boolean

  @IsOptional()
  @IsBoolean()
  is_preview?: boolean

  @IsOptional()
  @NormalizePlatform()
  @IsIn(PLATFORM_VALUES)
  platform?: PlatformValue

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(8)
  @NormalizePlatform()
  @IsIn(PLATFORM_VALUES, { each: true })
  platforms?: PlatformValue[]

  @IsOptional()
  @IsBoolean()
  is_milestone?: boolean

  @IsOptional()
  @IsBoolean()
  is_deprecated?: boolean

  @IsOptional()
  @IsObject()
  custom_data?: Record<string, unknown> | null

  @IsOptional()
  @IsInt()
  @Min(0)
  published_at?: number
}
