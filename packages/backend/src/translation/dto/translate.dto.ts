import { IsIn, IsObject, IsOptional, IsString, Matches, MaxLength } from "class-validator"

import { LOCALE_PATTERN, MAX_LOCALE_LENGTH, NormalizeLocale } from "../../common/locale"
import { TRANSLATION_KINDS, type TranslationKind } from "../types"

export class TranslateDto {
  /** 决定允许哪些字段，以及提示词里怎么描述内容形态。 */
  @IsIn(TRANSLATION_KINDS)
  kind!: TranslationKind

  /** 必须是该项目已注册的语言（同义标签同样算命中），否则 400。 */
  @NormalizeLocale()
  @IsString()
  @MaxLength(MAX_LOCALE_LENGTH)
  @Matches(LOCALE_PATTERN, { message: "target_locale format is invalid" })
  target_locale!: string

  /** 原文语言，只作为提示词里的一句说明；留空即让模型自己判断。 */
  @IsOptional()
  @NormalizeLocale()
  @IsString()
  @MaxLength(MAX_LOCALE_LENGTH)
  source_locale?: string | null

  /**
   * 待译字段，键取自该 kind 的字段清单，值为原文。
   * 键与值的校验在 service 里做：这里是动态键的对象，装饰器表达不了。
   */
  @IsObject()
  fields!: Record<string, unknown>
}
