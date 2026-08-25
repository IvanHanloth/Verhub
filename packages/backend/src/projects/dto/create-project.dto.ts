import { Transform, Type } from "class-transformer"
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from "class-validator"

import { LOCALE_PATTERN, MAX_LOCALE_LENGTH, NormalizeLocale } from "../../common/locale"
import {
  MAX_EVENT_RETENTION_DAYS,
  MAX_STATS_RETENTION_DAYS,
  MIN_EVENT_RETENTION_DAYS,
  MIN_STATS_RETENTION_DAYS,
} from "../../stats/stats-retention.service"

const COMPARABLE_VERSION_PATTERN =
  /^(?<core>\d+(?:\.\d+)*)(?:-(?<tag>alpha|beta|rc)(?:\.(?<tail>\d+(?:\.\d+)*))?)?$/

/**
 * 一份项目译文，本质是「某个语言下的覆盖设置」：名称与描述各自留空即回落项目
 * 自身的值。两者全空会被拒——存下来只会让人以为配过什么。
 */
export class ProjectTranslationDto {
  /** 必须是该项目已注册的语言（同义标签同样算命中），否则整个请求 400。 */
  @NormalizeLocale()
  @IsString()
  @MaxLength(MAX_LOCALE_LENGTH)
  @Matches(LOCALE_PATTERN, { message: "locale format is invalid" })
  locale!: string

  @IsOptional()
  @IsString()
  @MaxLength(128)
  name?: string | null

  @IsOptional()
  @IsString()
  @MaxLength(1024)
  description?: string | null
}

/**
 * Transform that normalizes empty / whitespace-only strings to `null`.
 * Preserves `undefined` (property not sent) and `null` (explicit clear).
 */
function NullableStringTransform() {
  return Transform(({ value }: { value: unknown }) => {
    if (value === undefined) return undefined
    if (value === null) return null
    if (typeof value === "string") {
      const trimmed = value.trim()
      return trimmed.length > 0 ? trimmed : null
    }
    return value
  })
}

export class CreateProjectDto {
  @IsString()
  @MaxLength(64)
  project_key!: string

  @IsString()
  @MaxLength(128)
  name!: string

  @IsOptional()
  @IsString()
  @MaxLength(512)
  repo_url?: string

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  description?: string

  @IsOptional()
  @IsString()
  @MaxLength(128)
  author?: string

  @IsOptional()
  @IsUrl({ require_protocol: true })
  @MaxLength(512)
  author_homepage_url?: string

  @IsOptional()
  @IsUrl({ require_protocol: true })
  @MaxLength(1024)
  icon_url?: string

  @IsOptional()
  @IsUrl({ require_protocol: true })
  @MaxLength(512)
  website_url?: string

  @IsOptional()
  @IsUrl({ require_protocol: true })
  @MaxLength(512)
  docs_url?: string

  @IsOptional()
  @IsInt()
  @Min(0)
  published_at?: number

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (value === undefined ? undefined : Number(value)))
  @IsInt()
  @Min(MIN_STATS_RETENTION_DAYS)
  @Max(MAX_STATS_RETENTION_DAYS)
  stats_retention_days?: number

  /**
   * 事件采集总开关。关掉后采集端点空转返回 202，既有数据保留。
   *
   * 给运营者一个立即止血的手段：收到监管问询时不必改配置重启。
   */
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === undefined ? undefined : value === true || value === "true" || value === "1",
  )
  @IsBoolean()
  event_collection_enabled?: boolean

  /**
   * 事件明细的保留期，独立于 stats_retention_days 且默认更短（90 天）。
   *
   * 明细带匿名标识，是可关联到个人的高频数据，不该与纯计数用同一窗口。
   */
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (value === undefined ? undefined : Number(value)))
  @IsInt()
  @Min(MIN_EVENT_RETENTION_DAYS)
  @Max(MAX_EVENT_RETENTION_DAYS)
  event_retention_days?: number

  @NullableStringTransform()
  @ValidateIf((_object, value) => value !== null && value !== undefined)
  @IsString()
  @MaxLength(64)
  @Matches(COMPARABLE_VERSION_PATTERN, {
    message: "optional_update_min_comparable_version format is invalid",
  })
  optional_update_min_comparable_version?: string | null

  @NullableStringTransform()
  @ValidateIf((_object, value) => value !== null && value !== undefined)
  @IsString()
  @MaxLength(64)
  @Matches(COMPARABLE_VERSION_PATTERN, {
    message: "optional_update_max_comparable_version format is invalid",
  })
  optional_update_max_comparable_version?: string | null

  /**
   * 项目名称与描述的译文。传了就整体替换全部译文，空数组即清空；不传则不动。
   * 语言必须先在项目里注册（同义标签同样算命中），否则整个请求 400。
   */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProjectTranslationDto)
  @ArrayMaxSize(32)
  translations?: ProjectTranslationDto[]
}
