/**
 * 时间分桶与时区折叠，请求统计与事件统计共用。
 *
 * 从 RequestStatsService 的私有方法提出来的：两个模块的时间轴语义必须完全一致，
 * 否则同一段区间在「接口调用量」和「事件量」两张图上会给出对不上的桶边界。
 */

export const HOUR_SECONDS = 3600
export const DAY_SECONDS = 86400

/** 调用方没给区间时的默认窗口：最近 7 天。 */
export const DEFAULT_RANGE_SECONDS = 7 * DAY_SECONDS

export type StatsRange = {
  startTime: number
  endTime: number
}

/**
 * 把查询参数里的可选区间解析成闭区间。
 *
 * 抛 RangeError 而不是 BadRequestException：这个模块不该依赖 Nest 的 HTTP 层，
 * 由调用它的 controller 转成 400。
 */
export function resolveStatsRange(
  query: { start_time?: number; end_time?: number },
  now: number,
): StatsRange {
  const endTime = query.end_time ?? now
  const startTime = query.start_time ?? endTime - DEFAULT_RANGE_SECONDS

  if (startTime > endTime) {
    throw new RangeError("start_time must not be greater than end_time")
  }

  return { startTime, endTime }
}

export type TimeseriesPoint = { bucket: number; count: number }

/** 一条命名序列，用于堆叠图。`key` 是端点名 / 平台名 / 版本号 / 事件名。 */
export type TimeseriesSeries = { key: string; data: TimeseriesPoint[] }

/**
 * `weekday` is 0=Sunday..6=Saturday and `hour` is 0..23, folded in each
 * request's *source* timezone (by country code); `tz_offset_minutes` is only the
 * fallback for sources that cannot be placed.
 */
export type HeatmapCell = { weekday: number; hour: number; count: number }

/** Truncate a Unix-seconds timestamp to the start of its UTC hour. */
export function toHourBucket(timestamp: number): number {
  return Math.floor(timestamp / HOUR_SECONDS) * HOUR_SECONDS
}

/** Truncate a Unix-seconds timestamp to the start of its day in the shifted timezone. */
export function toDayBucket(timestamp: number, tzOffsetMinutes = 0): number {
  return floorTo(timestamp, DAY_SECONDS, tzOffsetMinutes * 60)
}

/**
 * Floor a timestamp to a bucket boundary in the shifted timezone, then map it
 * back to real Unix seconds. The returned value is the instant the local
 * bucket started, so formatting it with local-time getters reproduces the
 * label the viewer expects.
 */
export function floorTo(timestamp: number, step: number, shift: number): number {
  return Math.floor((timestamp + shift) / step) * step - shift
}

/** 区间内全部桶的起点，含无流量的空桶。 */
export function bucketBoundaries(range: StatsRange, step: number, shift: number): number[] {
  const boundaries: number[] = []
  const last = floorTo(range.endTime, step, shift)
  for (let bucket = floorTo(range.startTime, step, shift); bucket <= last; bucket += step) {
    boundaries.push(bucket)
  }
  return boundaries
}

/**
 * 日桶必须断在查看者的午夜而不是 UTC 的午夜，否则 UTC+8 的一个繁忙夜晚会落到
 * 第二天。小时桶本身已经对齐到整点，任何真实偏移都能保持这个对齐。
 */
export function bucketShift(granularity: "hour" | "day", tzOffsetMinutes: number): number {
  return granularity === "day" ? tzOffsetMinutes * 60 : 0
}

export function bucketStep(granularity: "hour" | "day"): number {
  return granularity === "hour" ? HOUR_SECONDS : DAY_SECONDS
}

/**
 * 把 (桶, 计数) 明细折成补齐零点的多条序列，按区间总量降序。
 *
 * 大的在前，前端的配色与图例顺序才稳定，不会因为某小时的抖动而换位。补零是
 * 硬要求：Recharts 的堆叠图按下标对齐各序列，缺桶会让后面的点整体错位。
 */
export function foldSeries(
  rows: Array<{ key: string; bucket: number; count: number }>,
  range: StatsRange,
  step: number,
  shift: number,
  limit?: number,
): TimeseriesSeries[] {
  const totalsByKey = new Map<string, Map<number, number>>()
  const grandTotals = new Map<string, number>()

  for (const row of rows) {
    const bucket = floorTo(row.bucket, step, shift)
    const buckets = totalsByKey.get(row.key) ?? new Map<number, number>()
    buckets.set(bucket, (buckets.get(bucket) ?? 0) + row.count)
    totalsByKey.set(row.key, buckets)
    grandTotals.set(row.key, (grandTotals.get(row.key) ?? 0) + row.count)
  }

  const boundaries = bucketBoundaries(range, step, shift)

  const series = [...totalsByKey.entries()]
    .sort(
      (a, b) =>
        (grandTotals.get(b[0]) ?? 0) - (grandTotals.get(a[0]) ?? 0) || a[0].localeCompare(b[0]),
    )
    .map(([key, buckets]) => ({
      key,
      data: boundaries.map((bucket) => ({ bucket, count: buckets.get(bucket) ?? 0 })),
    }))

  return limit === undefined ? series : series.slice(0, limit)
}
