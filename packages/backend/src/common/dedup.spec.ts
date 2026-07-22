import {
  buildDedupHash,
  DEFAULT_DEDUP_WINDOW_SECONDS,
  resolveDedupWindowSeconds,
  stableStringify,
} from "./dedup"

describe("buildDedupHash", () => {
  it("is stable for identical inputs", () => {
    expect(buildDedupHash(["verhub", 3, "boom"])).toBe(buildDedupHash(["verhub", 3, "boom"]))
  })

  it("distinguishes a differently split part list", () => {
    expect(buildDedupHash(["ab", "c"])).not.toBe(buildDedupHash(["a", "bc"]))
  })

  it("treats null and undefined as the same empty part", () => {
    expect(buildDedupHash(["a", null, "b"])).toBe(buildDedupHash(["a", undefined, "b"]))
  })

  it("changes when any part changes", () => {
    expect(buildDedupHash(["verhub", 3, "boom"])).not.toBe(buildDedupHash(["verhub", 2, "boom"]))
  })
})

describe("stableStringify", () => {
  it("ignores key order so an SDK's serialization does not split the bucket", () => {
    expect(stableStringify({ b: 1, a: 2 })).toBe(stableStringify({ a: 2, b: 1 }))
  })

  it("keeps array order significant", () => {
    expect(stableStringify([1, 2])).not.toBe(stableStringify([2, 1]))
  })

  it("recurses into nested objects", () => {
    expect(stableStringify({ x: { b: 1, a: 2 } })).toBe(stableStringify({ x: { a: 2, b: 1 } }))
  })

  it("maps null and undefined to the same empty string", () => {
    expect(stableStringify(null)).toBe("")
    expect(stableStringify(undefined)).toBe("")
  })
})

describe("resolveDedupWindowSeconds", () => {
  const original = process.env.VERHUB_DEDUP_WINDOW_SECONDS

  afterEach(() => {
    if (original === undefined) {
      delete process.env.VERHUB_DEDUP_WINDOW_SECONDS
    } else {
      process.env.VERHUB_DEDUP_WINDOW_SECONDS = original
    }
  })

  it("defaults when unset", () => {
    delete process.env.VERHUB_DEDUP_WINDOW_SECONDS
    expect(resolveDedupWindowSeconds()).toBe(DEFAULT_DEDUP_WINDOW_SECONDS)
  })

  it("reads a configured window", () => {
    process.env.VERHUB_DEDUP_WINDOW_SECONDS = "300"
    expect(resolveDedupWindowSeconds()).toBe(300)
  })

  it("treats zero and garbage as suppression disabled", () => {
    process.env.VERHUB_DEDUP_WINDOW_SECONDS = "0"
    expect(resolveDedupWindowSeconds()).toBe(0)

    process.env.VERHUB_DEDUP_WINDOW_SECONDS = "not-a-number"
    expect(resolveDedupWindowSeconds()).toBe(0)
  })
})
