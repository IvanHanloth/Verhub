import {
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from "class-validator"

const clientPlatforms = ["ios", "android", "windows", "mac", "web"] as const

type ClientPlatform = (typeof clientPlatforms)[number]

export class CreateVersionDto {
  @IsString()
  @MaxLength(64)
  version!: string

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
  @IsBoolean()
  forced?: boolean

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
  @IsObject()
  custom_data?: Record<string, unknown>

  @IsOptional()
  @IsInt()
  @Min(0)
  published_at?: number
}
