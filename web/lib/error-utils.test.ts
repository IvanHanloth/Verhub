import { describe, expect, it } from "vitest"

import { ApiError } from "@/lib/api-client"

import { getErrorMessage } from "./error-utils"

describe("getErrorMessage", () => {
  it("formats ApiError with status code", () => {
    const err = new ApiError("Not Found", 404)
    expect(getErrorMessage(err)).toBe("Not Found (HTTP 404)")
  })

  it("returns message for generic Error", () => {
    const err = new Error("something broke")
    expect(getErrorMessage(err)).toBe("something broke")
  })

  it("returns fallback for non-Error values", () => {
    expect(getErrorMessage("string error")).toBe("请求失败，请稍后再试。")
    expect(getErrorMessage(null)).toBe("请求失败，请稍后再试。")
    expect(getErrorMessage(42)).toBe("请求失败，请稍后再试。")
    expect(getErrorMessage(undefined)).toBe("请求失败，请稍后再试。")
  })

  it("prefers ApiError over plain Error", () => {
    // ApiError extends Error — make sure the first branch wins
    const err = new ApiError("Forbidden", 403)
    expect(err instanceof Error).toBe(true)
    expect(getErrorMessage(err)).toContain("HTTP 403")
  })
})
