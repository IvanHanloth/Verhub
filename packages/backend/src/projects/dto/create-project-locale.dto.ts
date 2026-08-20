import { ArrayMaxSize, IsArray, IsOptional, IsString, Matches, MaxLength } from "class-validator"

import { LOCALE_PATTERN, MAX_LOCALE_LENGTH, NormalizeLocale } from "../../common/locale"

/**
 * 注册一个项目支持的语言。
 *
 * 只有注册过的语言才能存公告与项目译文，也只有注册过的语言偏好会被公开端认账——
 * 没有这层白名单，客户端传什么语言都会命中数据库里的任意脏数据。
 */
export class CreateProjectLocaleDto {
  /** 如 zh-CN / en-US。原样保存录入时的写法，匹配时大小写不敏感。 */
  @NormalizeLocale()
  @IsString()
  @MaxLength(MAX_LOCALE_LENGTH)
  @Matches(LOCALE_PATTERN, { message: "locale format is invalid" })
  locale!: string

  /**
   * 同义标签：命中其中任何一个都等价于命中主标签（多对一）。
   * 例如主标签 `en` 列出 `en-US` / `en-GB`，三种写法取到同一份译文。
   * 不能与本项目其它语言的主标签或同义标签相撞，否则 400。
   */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(16)
  @IsString({ each: true })
  @MaxLength(MAX_LOCALE_LENGTH, { each: true })
  @Matches(LOCALE_PATTERN, { each: true, message: "alias format is invalid" })
  aliases?: string[]

  /** 后台展示名，如「简体中文」。留空则界面上直接显示 locale。 */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  label?: string
}
