import { parseClientClock, tzOffsetColumn, UNKNOWN_TZ_OFFSET } from "./client-clock"

const RECEIVED_AT = Date.parse("2026-09-24T02:00:10.000Z")

function parse(value: string | undefined) {
  return parseClientClock({ "x-verhub-client-time": value }, RECEIVED_AT)
}

describe("parseClientClock", () => {
  it("reads both the offset and the skew from one value", () => {
    expect(parse("2026-09-24T10:00:00.000+08:00")).toEqual({
      tzOffsetMinutes: 480,
      skewSeconds: 10,
    })
    expect(parse("2026-09-23T19:00:10-07:00")).toEqual({ tzOffsetMinutes: -420, skewSeconds: 0 })
  })

  it("accepts Z, compact offsets and quarter-hour zones", () => {
    expect(parse("2026-09-24T02:00:10Z").tzOffsetMinutes).toBe(0)
    expect(parse("2026-09-24T07:45:10+0545").tzOffsetMinutes).toBe(345)
  })

  it("reports a slow device clock as positive skew", () => {
    expect(parse("2026-09-24T08:00:10.000+08:00").skewSeconds).toBe(7200)
  })

  it("treats anything unusable as not reported instead of failing", () => {
    for (const value of [
      undefined,
      "",
      "2026-09-24T10:00:00", // 没有偏移，无从判断时区
      "2026-09-24 10:00:00+08:00",
      "2026-09-24T10:00:00+15:00", // 超出现行时区范围
      "2026-09-24T10:00:00+08:10", // 不是 15 分钟的整数倍
      "not a time",
    ]) {
      expect(parse(value)).toEqual({ tzOffsetMinutes: null, skewSeconds: null })
    }
  })

  it("falls back to the sentinel column value when not reported", () => {
    expect(tzOffsetColumn(parse(undefined))).toBe(UNKNOWN_TZ_OFFSET)
    expect(tzOffsetColumn(parse("2026-09-24T10:00:00+08:00"))).toBe(480)
  })
})
