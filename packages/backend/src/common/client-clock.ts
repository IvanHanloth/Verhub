/**
 * SDK 随请求上报的客户端本地时间（`X-Verhub-Client-Time`）。
 *
 * 形如 `2026-09-24T10:00:00.123+08:00`：一个值同时给出两样东西——
 * UTC 偏移（热力图按用户当地时间折叠）与设备时钟相对服务端的偏差（校正离线补发
 * 事件的发生时间）。只认带显式偏移的 ISO 8601，缺偏移的写法无从判断时区，按未上报处理。
 */

import type { IncomingHttpHeaders } from "node:http"

export const CLIENT_TIME_HEADER = "x-verhub-client-time"

/**
 * 汇总表里"没上报时区"的哨兵。维度列 NOT NULL 的理由同 ApiRequestStat.region：
 * Postgres unique 视 NULL 互异，会破坏 upsert-increment。取一个不可能是真实偏移的值。
 */
export const UNKNOWN_TZ_OFFSET = -32768

/** 现行时区偏移的范围：UTC-12:00 到 UTC+14:00。 */
const MIN_TZ_OFFSET_MINUTES = -12 * 60
const MAX_TZ_OFFSET_MINUTES = 14 * 60

/** 现行时区偏移都是 15 分钟的整数倍（+05:45、+08:45 也不例外）。 */
const TZ_OFFSET_STEP_MINUTES = 15

const CLIENT_TIME_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(Z|[+-]\d{2}:?\d{2})$/i

export type ClientClock = {
  /** 客户端所在时区的 UTC 偏移（分钟，东正西负）；无法得知时为 null。 */
  tzOffsetMinutes: number | null
  /** 服务端时间减客户端时间（秒）；正值表示客户端时钟偏慢。无法得知时为 null。 */
  skewSeconds: number | null
}

export const UNKNOWN_CLIENT_CLOCK: ClientClock = { tzOffsetMinutes: null, skewSeconds: null }

/**
 * 解析客户端时间头。任何不合规的取值都按未上报处理而不是报错——这是尽力而为的
 * 遥测信号，不能因为它让正常请求失败。
 *
 * @param receivedAtMs 服务端收到请求的时刻（毫秒），用来算时钟偏差。
 */
export function parseClientClock(
  headers: IncomingHttpHeaders | Record<string, string | string[] | undefined>,
  receivedAtMs: number,
): ClientClock {
  const raw = headers[CLIENT_TIME_HEADER]
  const value = (Array.isArray(raw) ? raw[0] : raw)?.trim()
  if (!value || value.length > 40) {
    return UNKNOWN_CLIENT_CLOCK
  }

  const match = CLIENT_TIME_PATTERN.exec(value)
  if (!match) {
    return UNKNOWN_CLIENT_CLOCK
  }

  const tzOffsetMinutes = parseOffset(match[8] ?? "")
  if (tzOffsetMinutes === null) {
    return UNKNOWN_CLIENT_CLOCK
  }

  const clientMs = Date.parse(value)
  const skewSeconds = Number.isFinite(clientMs)
    ? Math.round((receivedAtMs - clientMs) / 1000)
    : null

  return { tzOffsetMinutes, skewSeconds }
}

function parseOffset(designator: string): number | null {
  if (designator.toUpperCase() === "Z") {
    return 0
  }

  const sign = designator.startsWith("-") ? -1 : 1
  const digits = designator.slice(1).replace(":", "")
  const hours = Number(digits.slice(0, 2))
  const minutes = Number(digits.slice(2, 4))
  if (!Number.isInteger(hours) || !Number.isInteger(minutes) || minutes >= 60) {
    return null
  }

  const offset = sign * (hours * 60 + minutes)
  if (
    offset < MIN_TZ_OFFSET_MINUTES ||
    offset > MAX_TZ_OFFSET_MINUTES ||
    offset % TZ_OFFSET_STEP_MINUTES !== 0
  ) {
    return null
  }

  return offset
}

/** 写汇总表用：没上报就落哨兵。 */
export function tzOffsetColumn(clock: ClientClock): number {
  return clock.tzOffsetMinutes ?? UNKNOWN_TZ_OFFSET
}
