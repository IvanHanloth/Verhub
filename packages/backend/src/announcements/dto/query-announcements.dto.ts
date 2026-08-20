import { Transform } from "class-transformer"
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from "class-validator"

import { LOCALE_PATTERN, MAX_LOCALE_LENGTH, NormalizeLocale } from "../../common/locale"
import { NormalizePlatform, PLATFORM_VALUES, type PlatformValue } from "../../common/platform"
import {
  MAX_SEARCH_LENGTH,
  NormalizeOptionalBoolean,
  NormalizeSearch,
} from "../../common/query-filters"

export class QueryAnnouncementsDto {
  @IsOptional()
  @Transform(({ value }) => Number(value ?? 20))
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20

  @IsOptional()
  @Transform(({ value }) => Number(value ?? 0))
  @IsInt()
  @Min(0)
  offset = 0

  @IsOptional()
  @NormalizePlatform()
  @IsIn(PLATFORM_VALUES)
  platform?: PlatformValue

  /** 关键字，匹配标题、正文与作者。 */
  @IsOptional()
  @NormalizeSearch()
  @IsString()
  @MaxLength(MAX_SEARCH_LENGTH)
  search?: string

  /** 只看置顶 / 只看非置顶；不传则不限。 */
  @IsOptional()
  @NormalizeOptionalBoolean()
  @IsBoolean()
  is_pinned?: boolean

  /**
   * 只看隐藏 / 只看可见；不传则不限。
   *
   * 与反馈、日志的 include_hidden 不同：公告的隐藏是发布流程的一部分（先建后放），
   * 后台默认就要能看见隐藏的公告，所以这里是个筛选维度而不是「要不要带出来」的开关。
   * 公开端不受此参数影响，永远只返回未隐藏的公告。
   */
  @IsOptional()
  @NormalizeOptionalBoolean()
  @IsBoolean()
  is_hidden?: boolean

  /**
   * 客户端当前版本号，公开端用来筛掉不在可见版本范围内的公告。
   *
   * 先当可比较版本号解析，解析不了再去版本表按 version 精确查一次拿它的
   * comparable_version——客户端报的通常是自己展示用的版本号，不该要求它先做换算。
   * 两条路都拿不到时等同没传：带版本范围的公告一律不返回。
   *
   * 后台列表不受此参数影响，公告的可见范围是发布配置，不是后台的筛选维度。
   */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  @Transform(({ value }: { value: unknown }) => (typeof value === "string" ? value.trim() : value))
  version?: string

  /**
   * 语言偏好。命中项目注册的语言（大小写不敏感）且该公告有对应译文时返回译文，
   * 否则一律回落公告的默认内容。后台列表不受影响，永远返回默认内容与全部译文。
   */
  @IsOptional()
  @NormalizeLocale()
  @IsString()
  @MaxLength(MAX_LOCALE_LENGTH)
  @Matches(LOCALE_PATTERN, { message: "locale format is invalid" })
  locale?: string
}
