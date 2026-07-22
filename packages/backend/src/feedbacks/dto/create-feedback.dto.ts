import { IsIn, IsInt, IsObject, IsOptional, IsString, Max, MaxLength, Min } from "class-validator"

import { NormalizePlatform, PLATFORM_VALUES, type PlatformValue } from "../../common/platform"
import { MAX_PLATFORM_VERSION_LENGTH } from "../../stats/platform-detection"

export class CreateFeedbackDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  user_id?: string

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  rating?: number

  @IsString()
  @MaxLength(4096)
  content!: string

  @IsOptional()
  @NormalizePlatform()
  @IsIn(PLATFORM_VALUES)
  platform?: PlatformValue

  /** 具体系统版本，如 `11` / `ubuntu 24.04` / `26`。平台分类之外的补充信息。 */
  @IsOptional()
  @IsString()
  @MaxLength(MAX_PLATFORM_VERSION_LENGTH)
  platform_version?: string

  @IsOptional()
  @IsObject()
  custom_data?: Record<string, unknown>
}
