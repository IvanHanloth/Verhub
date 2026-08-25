/**
 * 事件采集的环境级开关与退出信号。
 *
 * 项目级开关在 Project.eventCollectionEnabled，这里只放实例级的。
 */

/** 单批上限。给得比 SDK 默认批量（20）宽，留出离线补发时攒批的余地。 */
export const DEFAULT_EVENT_BATCH_MAX = 50

/**
 * 客户端时间的可信窗口（秒）。
 *
 * 离线补发要求信任 occurred_at，否则补上来的事件会全部堆在恢复联网的那一刻。
 * 但不能无条件信任：时钟错乱的设备会把数据写进未来或者远古的桶里，把趋势图
 * 的横轴拉到没法看。默认往前 7 天、往后 5 分钟，超出即回退到服务端接收时间。
 */
export const DEFAULT_EVENT_CLOCK_SKEW_SECONDS = 7 * 86400
export const FUTURE_CLOCK_TOLERANCE_SECONDS = 300

/** 最终用户的退出信号。SDK 会带，直接打 HTTP 的接入方也可以自己带。 */
export const DO_NOT_TRACK_HEADER = "x-verhub-do-not-track"

export function resolveEventBatchMax(): number {
  const parsed = Number(process.env.VERHUB_EVENT_BATCH_MAX)
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : DEFAULT_EVENT_BATCH_MAX
}

export function resolveEventClockSkewSeconds(): number {
  const parsed = Number(process.env.VERHUB_EVENT_CLOCK_SKEW_SECONDS)
  return Number.isFinite(parsed) && parsed > 0
    ? Math.trunc(parsed)
    : DEFAULT_EVENT_CLOCK_SKEW_SECONDS
}

/**
 * 是否命中退出信号。
 *
 * 只认明确的肯定值："0"、空串、缺失都视为未退出——把无法解析的值当成退出，
 * 会让一个写错的代理头静默关掉整个实例的采集。
 */
export function hasDoNotTrackHeader(
  headers: Record<string, string | string[] | undefined>,
): boolean {
  const raw = headers[DO_NOT_TRACK_HEADER]
  const value = Array.isArray(raw) ? raw[0] : raw
  if (typeof value !== "string") {
    return false
  }
  const normalized = value.trim().toLowerCase()
  return normalized === "1" || normalized === "true" || normalized === "yes"
}

/**
 * 把客户端声明的时间钳到可信窗口内。
 *
 * 返回落库用的 occurredAt：窗口内用客户端值，窗口外一律用接收时间。
 */
export function clampOccurredAt(
  declared: number | undefined,
  receivedAt: number,
  skewSeconds = resolveEventClockSkewSeconds(),
): number {
  if (declared === undefined || !Number.isFinite(declared)) {
    return receivedAt
  }

  const value = Math.trunc(declared)
  if (value < receivedAt - skewSeconds || value > receivedAt + FUTURE_CLOCK_TOLERANCE_SECONDS) {
    return receivedAt
  }

  return value
}
