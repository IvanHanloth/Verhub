import {
  DEFAULT_EVENT_CLOCK_SKEW_SECONDS,
  FUTURE_CLOCK_TOLERANCE_SECONDS,
  clampOccurredAt,
  hasDoNotTrackHeader,
  resolveEventBatchMax,
} from "./event-config"

describe("clampOccurredAt", () => {
  const receivedAt = 1_760_000_000
  const skew = DEFAULT_EVENT_CLOCK_SKEW_SECONDS

  it("trusts a client timestamp inside the window so offline backfill lands on the right day", () => {
    const threeDaysAgo = receivedAt - 3 * 86400
    expect(clampOccurredAt(threeDaysAgo, receivedAt, skew)).toBe(threeDaysAgo)
  })

  it("accepts the exact window boundaries", () => {
    expect(clampOccurredAt(receivedAt - skew, receivedAt, skew)).toBe(receivedAt - skew)
    expect(clampOccurredAt(receivedAt + FUTURE_CLOCK_TOLERANCE_SECONDS, receivedAt, skew)).toBe(
      receivedAt + FUTURE_CLOCK_TOLERANCE_SECONDS,
    )
  })

  it("falls back to the receive time just past either boundary", () => {
    // 时钟错乱的设备不能把数据写进远古或者未来的桶里，那会把趋势图的横轴拉到没法看。
    expect(clampOccurredAt(receivedAt - skew - 1, receivedAt, skew)).toBe(receivedAt)
    expect(clampOccurredAt(receivedAt + FUTURE_CLOCK_TOLERANCE_SECONDS + 1, receivedAt, skew)).toBe(
      receivedAt,
    )
  })

  it("falls back when the client sent nothing usable", () => {
    expect(clampOccurredAt(undefined, receivedAt, skew)).toBe(receivedAt)
    expect(clampOccurredAt(Number.NaN, receivedAt, skew)).toBe(receivedAt)
    expect(clampOccurredAt(Number.POSITIVE_INFINITY, receivedAt, skew)).toBe(receivedAt)
  })

  it("truncates fractional seconds", () => {
    const result = clampOccurredAt(receivedAt - 10.9, receivedAt, skew)
    expect(Number.isInteger(result)).toBe(true)
    expect(result).toBe(Math.trunc(receivedAt - 10.9))
  })
})

describe("hasDoNotTrackHeader", () => {
  it("recognises the documented affirmative values", () => {
    expect(hasDoNotTrackHeader({ "x-verhub-do-not-track": "1" })).toBe(true)
    expect(hasDoNotTrackHeader({ "x-verhub-do-not-track": "true" })).toBe(true)
    expect(hasDoNotTrackHeader({ "x-verhub-do-not-track": " YES " })).toBe(true)
  })

  it("takes the first value when a proxy duplicated the header", () => {
    expect(hasDoNotTrackHeader({ "x-verhub-do-not-track": ["1", "0"] })).toBe(true)
  })

  it("treats anything unrecognised as not opted out", () => {
    // 把无法解析的值当成退出，会让一个写错的代理头静默关掉整个实例的采集。
    expect(hasDoNotTrackHeader({})).toBe(false)
    expect(hasDoNotTrackHeader({ "x-verhub-do-not-track": "0" })).toBe(false)
    expect(hasDoNotTrackHeader({ "x-verhub-do-not-track": "" })).toBe(false)
    expect(hasDoNotTrackHeader({ "x-verhub-do-not-track": "maybe" })).toBe(false)
    expect(hasDoNotTrackHeader({ "x-verhub-do-not-track": undefined })).toBe(false)
  })
})

describe("resolveEventBatchMax", () => {
  const original = process.env.VERHUB_EVENT_BATCH_MAX

  afterEach(() => {
    if (original === undefined) {
      delete process.env.VERHUB_EVENT_BATCH_MAX
    } else {
      process.env.VERHUB_EVENT_BATCH_MAX = original
    }
  })

  it("defaults to 50 and ignores non-positive or unparsable values", () => {
    delete process.env.VERHUB_EVENT_BATCH_MAX
    expect(resolveEventBatchMax()).toBe(50)
    process.env.VERHUB_EVENT_BATCH_MAX = "0"
    expect(resolveEventBatchMax()).toBe(50)
    process.env.VERHUB_EVENT_BATCH_MAX = "lots"
    expect(resolveEventBatchMax()).toBe(50)
    process.env.VERHUB_EVENT_BATCH_MAX = "200"
    expect(resolveEventBatchMax()).toBe(200)
  })
})
