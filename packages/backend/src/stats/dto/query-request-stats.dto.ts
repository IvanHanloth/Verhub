import { Transform } from "class-transformer"
import { IsEnum, IsIn, IsInt, IsOptional, Max, Min } from "class-validator"
import { PublicEndpoint } from "@prisma/client"

import type { TimeseriesGroupBy } from "../request-stats.service"

/** Transform that coerces a query-string value to a number, preserving undefined. */
function NumberTransform() {
  return Transform(({ value }: { value: unknown }) =>
    value === undefined || value === null || value === "" ? undefined : Number(value),
  )
}

/**
 * Real-world UTC offsets span UTC-12 to UTC+14; the bounds are widened by one
 * hour on each side so a client that adds its own DST correction cannot be
 * rejected for a value that is still physically meaningful.
 */
export const MIN_TZ_OFFSET_MINUTES = -840
export const MAX_TZ_OFFSET_MINUTES = 900

export class QueryRequestStatsDto {
  @IsOptional()
  @NumberTransform()
  @IsInt()
  @Min(0)
  start_time?: number

  @IsOptional()
  @NumberTransform()
  @IsInt()
  @Min(0)
  end_time?: number

  /**
   * Minutes east of UTC, i.e. `-new Date().getTimezoneOffset()`.
   *
   * Buckets are stored in UTC, but "which hour is busy" is a question about the
   * audience's wall clock, so the fold into weekday × hour (and into calendar
   * days) happens against this offset. Defaults to 0, which reproduces the
   * previous UTC-only behaviour for callers that do not send it.
   */
  @IsOptional()
  @NumberTransform()
  @IsInt()
  @Min(MIN_TZ_OFFSET_MINUTES)
  @Max(MAX_TZ_OFFSET_MINUTES)
  tz_offset_minutes: number = 0
}

export class QueryRequestTimeseriesDto extends QueryRequestStatsDto {
  @IsOptional()
  @IsIn(["hour", "day"])
  granularity: "hour" | "day" = "hour"

  @IsOptional()
  @IsEnum(PublicEndpoint)
  endpoint?: PublicEndpoint

  /**
   * 额外按维度拆出多条序列，用于堆叠图。总量那条线不受影响，始终返回。
   * 只开放低基数的枚举列：自由文本维度拆出来的序列数没有上界。
   */
  @IsOptional()
  @IsIn(["endpoint", "platform"])
  group_by?: TimeseriesGroupBy
}

/**
 * 版本采纳曲线的默认序列数。比分布图更少：折线图里超过六七条就分不清颜色了，
 * 而这张图要看的是头部几个版本此消彼长。
 */
export const DEFAULT_VERSION_ADOPTION_LIMIT = 6
export const MAX_VERSION_ADOPTION_LIMIT = 20

export class QueryVersionAdoptionDto extends QueryRequestStatsDto {
  @IsOptional()
  @IsIn(["hour", "day"])
  granularity: "hour" | "day" = "day"

  @IsOptional()
  @NumberTransform()
  @IsInt()
  @Min(1)
  @Max(MAX_VERSION_ADOPTION_LIMIT)
  limit: number = DEFAULT_VERSION_ADOPTION_LIMIT
}

/** Default rows for the version distribution chart; the long tail is summarized as "其他". */
export const DEFAULT_CLIENT_VERSION_LIMIT = 15
export const MAX_CLIENT_VERSION_LIMIT = 100

export class QueryClientVersionStatsDto extends QueryRequestStatsDto {
  @IsOptional()
  @NumberTransform()
  @IsInt()
  @Min(1)
  @Max(MAX_CLIENT_VERSION_LIMIT)
  limit: number = DEFAULT_CLIENT_VERSION_LIMIT
}

/**
 * 系统版本分布的默认行数。比客户端版本更宽：一个项目同时覆盖 Windows 10/11、
 * 若干 Android 大版本和几个发行版是常态，15 行会把尾巴切在有意义的地方之前。
 */
export const DEFAULT_PLATFORM_VERSION_LIMIT = 30
export const MAX_PLATFORM_VERSION_LIMIT = 200

export class QueryPlatformVersionStatsDto extends QueryRequestStatsDto {
  @IsOptional()
  @NumberTransform()
  @IsInt()
  @Min(1)
  @Max(MAX_PLATFORM_VERSION_LIMIT)
  limit: number = DEFAULT_PLATFORM_VERSION_LIMIT
}
