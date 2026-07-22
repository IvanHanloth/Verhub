import { IsIn, IsOptional, IsString, MaxLength } from "class-validator"

import { NormalizePlatform, PLATFORM_VALUES, type PlatformValue } from "../../common/platform"
import { MAX_PLATFORM_VERSION_LENGTH } from "../../stats/platform-detection"

import { UploadLogDto } from "./upload-log.dto"

/**
 * 后台手动补录日志的请求体。
 *
 * 比客户端上报多出 platform / platform_version：上报路径靠 UA 推断，手动补录
 * 没有真实客户端可推断，只能由管理员显式指定。
 */
export class CreateLogDto extends UploadLogDto {
  @IsOptional()
  @NormalizePlatform()
  @IsIn(PLATFORM_VALUES)
  platform?: PlatformValue

  @IsOptional()
  @IsString()
  @MaxLength(MAX_PLATFORM_VERSION_LENGTH)
  platform_version?: string
}
