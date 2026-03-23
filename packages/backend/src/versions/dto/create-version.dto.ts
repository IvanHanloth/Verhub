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

const clientPlatforms = ["ios", "android", "windows", "mac", "web"] as const
const COMPARABLE_VERSION_PATTERN =
  /^(?<core>\d+(?:\.\d+)*)(?:-(?<tag>alpha|beta|rc)(?:\.(?<tail>\d+(?:\.\d+)*))?)?$/

type ClientPlatform = (typeof clientPlatforms)[number]

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
  title?: string

  @IsOptional()
  @IsString()
  @MaxLength(4096)
  content?: string

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  download_url?: string

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
  @IsIn(clientPlatforms)
  platform?: ClientPlatform

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(8)
  @IsIn(clientPlatforms, { each: true })
  platforms?: ClientPlatform[]

  @IsOptional()
  @IsBoolean()
  is_milestone?: boolean

  @IsOptional()
  @IsBoolean()
  is_deprecated?: boolean

  @IsOptional()
  @IsObject()
  custom_data?: Record<string, unknown>

  @IsOptional()
  @IsInt()
  @Min(0)
  published_at?: number
}
