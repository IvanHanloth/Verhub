import { Type } from "class-transformer"
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
} from "class-validator"

import { LOCALE_PATTERN, MAX_LOCALE_LENGTH, NormalizeLocale } from "../../common/locale"
import { NormalizePlatform, PLATFORM_VALUES, type PlatformValue } from "../../common/platform"
import { COMPARABLE_VERSION_PATTERN } from "../../versions/version-comparator"

/**
 * 一份译文，本质是「某个语言下的覆盖设置」，三个维度彼此独立：
 * title 留空即用默认标题、content 留空即用默认正文、is_hidden 为真则该语言下整条不返回。
 * 三者至少要有一项有意义，全空会被拒。
 */
export class AnnouncementTranslationDto {
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

  /** 不设长度上限，理由同默认正文。 */
  @IsOptional()
  @IsString()
  content?: string | null

  /** 该语言下不返回这条公告。与公告自身的 is_hidden 是两层：那个对所有人生效。 */
  @IsOptional()
  @IsBoolean()
  is_hidden?: boolean
}

export class CreateAnnouncementDto {
  @IsString()
  @MaxLength(128)
  title!: string

  /**
   * 不设长度上限：正文是运营写的长文，卡一个数字只会在写到一半时把人拦住。
   * 兜底交给 main.ts 的请求体上限，那是一条对所有端点统一的防线。
   */
  @IsString()
  content!: string

  @IsOptional()
  @IsBoolean()
  is_pinned?: boolean

  @IsOptional()
  @IsBoolean()
  is_hidden?: boolean

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(8)
  @NormalizePlatform()
  @IsIn(PLATFORM_VALUES, { each: true })
  platforms?: PlatformValue[]

  @IsOptional()
  @IsString()
  @MaxLength(64)
  author?: string

  /**
   * 可见版本范围，闭区间，两端各自可空（空即该端不限）。
   * 客户端上报的版本号落在范围内才看得到这条公告；客户端没报版本号时一律看不到。
   */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  @Matches(COMPARABLE_VERSION_PATTERN, { message: "min_comparable_version format is invalid" })
  min_comparable_version?: string | null

  @IsOptional()
  @IsString()
  @MaxLength(64)
  @Matches(COMPARABLE_VERSION_PATTERN, { message: "max_comparable_version format is invalid" })
  max_comparable_version?: string | null

  /** 传了就整体替换该公告的译文集合；不传则不动。空数组即清空全部译文。 */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AnnouncementTranslationDto)
  @ArrayMaxSize(32)
  translations?: AnnouncementTranslationDto[]

  @IsOptional()
  @IsInt()
  published_at?: number
}
