import { IsBoolean, IsIn, IsOptional, IsString, MaxLength } from "class-validator"

import { TRANSLATION_PROVIDERS, type TranslationProvider } from "../types"

/** 部分更新：只动传了的字段。api_key 传空字符串表示清除。 */
export class UpdateTranslationConfigDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean

  @IsOptional()
  @IsIn(TRANSLATION_PROVIDERS)
  provider?: TranslationProvider

  /** 路径前缀，如 https://api.openai.com/v1，后缀由 provider 决定。 */
  @IsOptional()
  @IsString()
  @MaxLength(512)
  base_url?: string

  /** 只写不读，回读只给指纹。 */
  @IsOptional()
  @IsString()
  @MaxLength(512)
  api_key?: string

  @IsOptional()
  @IsString()
  @MaxLength(128)
  model?: string

  /** 关掉时 system_prompt 被忽略，一律用内置提示词。 */
  @IsOptional()
  @IsBoolean()
  custom_prompt?: boolean

  @IsOptional()
  @IsString()
  @MaxLength(8192)
  system_prompt?: string
}
