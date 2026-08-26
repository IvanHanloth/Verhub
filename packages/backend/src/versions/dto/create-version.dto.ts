import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from "class-validator"
import { Type } from "class-transformer"

import { LOCALE_PATTERN, MAX_LOCALE_LENGTH, NormalizeLocale } from "../../common/locale"
import { NormalizePlatform, PLATFORM_VALUES, type PlatformValue } from "../../common/platform"

const COMPARABLE_VERSION_PATTERN =
  /^(?<core>\d+(?:\.\d+)*)(?:-(?<tag>alpha|beta|rc)(?:\.(?<tail>\d+(?:\.\d+)*))?)?$/

export class VersionDownloadLinkDto {
  @IsString()
  @IsUrl({ require_protocol: true })
  @MaxLength(2048)
  url!: string

  @IsOptional()
  @IsString()
  @MaxLength(128)
  name?: string

  @IsOptional()
  @IsString()
  @MaxLength(64)
  platform?: string
}

/**
 * 一份译文，本质是「某个语言下的覆盖设置」：title 留空即用默认标题、
 * content 留空即用默认更新说明。两者全空会被拒。
 *
 * 与公告译文的区别是没有 is_hidden：版本是分发对象，「对某个语言藏掉某个版本」
 * 会让那批用户收不到更新提示却仍能下到包。要停发用 is_deprecated，它对所有人生效。
 */
export class VersionTranslationDto {
  /** 必须是该项目已注册的语言（同义标签同样算命中），否则整个请求 400。 */
  @NormalizeLocale()
  @IsString()
  @MaxLength(MAX_LOCALE_LENGTH)
  @Matches(LOCALE_PATTERN, { message: "locale format is invalid" })
  locale!: string

  @IsOptional()
  @IsString()
  @MaxLength(128)
  title?: string | null

  /** 不设长度上限，理由同默认的更新说明。 */
  @IsOptional()
  @IsString()
  content?: string | null
}

export class CreateVersionDto {
  @IsString()
  @MaxLength(64)
  version!: string

  @IsString()
  @MaxLength(64)
  @Matches(COMPARABLE_VERSION_PATTERN, {
    message: "comparable_version format is invalid",
  })
  comparable_version!: string

  @IsOptional()
  @IsString()
  @MaxLength(128)
  title?: string | null

  /**
   * 更新说明。不设长度上限：它既可能是运营手写的长文，也可能整段来自
   * GitHub Release 正文，卡一个数字只会把内容截走。兜底交给 main.ts 的请求体上限。
   */
  @IsOptional()
  @IsString()
  content?: string | null

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  download_url?: string | null

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => VersionDownloadLinkDto)
  @ArrayMaxSize(32)
  download_links?: VersionDownloadLinkDto[]

  @IsOptional()
  @IsBoolean()
  is_latest?: boolean

  @IsOptional()
  @IsBoolean()
  is_preview?: boolean

  @IsOptional()
  @NormalizePlatform()
  @IsIn(PLATFORM_VALUES)
  platform?: PlatformValue

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(8)
  @NormalizePlatform()
  @IsIn(PLATFORM_VALUES, { each: true })
  platforms?: PlatformValue[]

  @IsOptional()
  @IsBoolean()
  is_milestone?: boolean

  @IsOptional()
  @IsBoolean()
  is_deprecated?: boolean

  @IsOptional()
  @IsObject()
  custom_data?: Record<string, unknown> | null

  /** 传了就整体替换该版本的译文集合；不传则不动。空数组即清空全部译文。 */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => VersionTranslationDto)
  @ArrayMaxSize(32)
  translations?: VersionTranslationDto[]

  @IsOptional()
  @IsInt()
  @Min(0)
  published_at?: number
}
