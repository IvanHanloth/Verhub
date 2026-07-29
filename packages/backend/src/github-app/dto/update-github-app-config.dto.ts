import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from "class-validator"

import { GITHUB_APP_FEATURES, type GithubAppFeature } from "../types"

/** 部分更新：只动传了的字段。传空字符串表示清除对应机密。 */
export class UpdateGithubAppConfigDto {
  @IsOptional()
  @IsString()
  @MaxLength(32)
  app_id?: string

  /** PEM 私钥原文，只写不读。 */
  @IsOptional()
  @IsString()
  @MaxLength(16384)
  private_key?: string

  @IsOptional()
  @IsString()
  @MaxLength(256)
  webhook_secret?: string

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(GITHUB_APP_FEATURES.length)
  @IsIn(GITHUB_APP_FEATURES, { each: true })
  enabled_features?: GithubAppFeature[]

  /** 关掉时下面两个模板字段被忽略，实例缺省回到内置模板。 */
  @IsOptional()
  @IsBoolean()
  feedback_issue_custom_template?: boolean

  @IsOptional()
  @IsString()
  @MaxLength(256)
  feedback_issue_title_template?: string

  @IsOptional()
  @IsString()
  @MaxLength(8192)
  feedback_issue_body_template?: string
}
