import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
} from "class-validator"

import { NormalizePlatform, PLATFORM_VALUES, type PlatformValue } from "../../common/platform"

export class CreateAnnouncementDto {
  @IsString()
  @MaxLength(128)
  title!: string

  @IsString()
  @MaxLength(4096)
  content!: string

  @IsOptional()
  @IsBoolean()
  is_pinned?: boolean

  @IsOptional()
  @IsBoolean()
  is_hidden?: boolean

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(8)
  @NormalizePlatform()
  @IsIn(PLATFORM_VALUES, { each: true })
  platforms?: PlatformValue[]

  @IsOptional()
  @IsString()
  @MaxLength(64)
  author?: string

  @IsOptional()
  @IsInt()
  published_at?: number
}
