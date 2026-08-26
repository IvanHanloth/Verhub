import { IsBoolean, IsOptional, IsString, Matches, MaxLength } from "class-validator"

import { LOCALE_PATTERN, MAX_LOCALE_LENGTH, NormalizeLocale } from "../../common/locale"

const COMPARABLE_VERSION_PATTERN =
  /^(?<core>\d+(?:\.\d+)*)(?:-(?<tag>alpha|beta|rc)(?:\.(?<tail>\d+(?:\.\d+)*))?)?$/

export class CheckVersionUpdateDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  current_version?: string

  @IsOptional()
  @IsString()
  @MaxLength(64)
  @Matches(COMPARABLE_VERSION_PATTERN, {
    message: "current_comparable_version format is invalid",
  })
  current_comparable_version?: string

  @IsOptional()
  @IsBoolean()
  include_preview?: boolean

  /**
   * 语言偏好。命中项目注册的语言时，响应里三个版本对象的 title / content 都返回
   * 对应译文；没命中或该版本没译文则回落默认内容。
   */
  @IsOptional()
  @NormalizeLocale()
  @IsString()
  @MaxLength(MAX_LOCALE_LENGTH)
  @Matches(LOCALE_PATTERN, { message: "locale format is invalid" })
  locale?: string

  /** Validate that at least one version identifier is provided */
  validate(): boolean {
    if (!this.current_version && !this.current_comparable_version) {
      return false
    }
    return true
  }
}
