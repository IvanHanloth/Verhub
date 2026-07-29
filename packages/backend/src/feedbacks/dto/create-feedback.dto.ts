import {
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from "class-validator"

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

  /** 联系方式，邮箱 / 手机号 / IM 账号皆可，不做格式校验。 */
  @IsOptional()
  @IsString()
  @MaxLength(128)
  contact?: string

  /**
   * 由提交者选择是否把这条反馈转发成 GitHub Issue。默认 false：项目开了转发
   * 只是「允许」，不代表每条反馈都往仓库里丢。选 true 时联系方式必填且单 IP 限流。
   */
  @IsOptional()
  @IsBoolean()
  forward_to_github?: boolean

  /** 隐藏后后台列表默认不返回；评分仍计入统计。 */
  @IsOptional()
  @IsBoolean()
  is_hidden?: boolean

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
