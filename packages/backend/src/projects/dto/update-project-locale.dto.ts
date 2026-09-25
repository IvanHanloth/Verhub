import { ArrayMaxSize, IsArray, IsOptional, IsString, Matches, MaxLength } from "class-validator"

import { LOCALE_PATTERN, MAX_LOCALE_LENGTH, NormalizeLocale } from "../../common/locale"

/**
 * 修改一个已注册的语言。字段缺省即保持原值。
 *
 * 改主标签会把本项目下该语言的全部译文（项目、版本、公告）一并迁到新标签，
 * 客户端用旧写法请求时若要继续命中，把旧标签放进 aliases。
 */
export class UpdateProjectLocaleDto {
  @IsOptional()
  @NormalizeLocale()
  @IsString()
  @MaxLength(MAX_LOCALE_LENGTH)
  @Matches(LOCALE_PATTERN, { message: "locale format is invalid" })
  locale?: string

  /** 整体替换同义标签列表；传空数组即清空。 */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(16)
  @IsString({ each: true })
  @MaxLength(MAX_LOCALE_LENGTH, { each: true })
  @Matches(LOCALE_PATTERN, { each: true, message: "alias format is invalid" })
  aliases?: string[]

  /** 传空串或 null 即清空展示名。 */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  label?: string | null
}
