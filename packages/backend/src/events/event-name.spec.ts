import { MAX_EVENT_NAME_LENGTH, normalizeEventName } from "./event-name"

describe("normalizeEventName", () => {
  it("lowercases and trims so one埋点 does not split into several events", () => {
    expect(normalizeEventName("  Checkout_Clicked ")).toBe("checkout_clicked")
    expect(normalizeEventName("CHECKOUT_CLICKED")).toBe("checkout_clicked")
  })

  it("accepts the character set that survives legends, CSV and DSL aliases", () => {
    expect(normalizeEventName("page.view")).toBe("page.view")
    expect(normalizeEventName("cart:add")).toBe("cart:add")
    expect(normalizeEventName("sign-up")).toBe("sign-up")
    expect(normalizeEventName("step_2")).toBe("step_2")
  })

  it("rejects anything that would need escaping downstream", () => {
    expect(normalizeEventName("checkout clicked")).toBeNull()
    expect(normalizeEventName('checkout"clicked')).toBeNull()
    expect(normalizeEventName("checkout/clicked")).toBeNull()
    expect(normalizeEventName("结算点击")).toBeNull()
  })

  it("rejects empty and oversized names", () => {
    expect(normalizeEventName("")).toBeNull()
    expect(normalizeEventName("   ")).toBeNull()
    expect(normalizeEventName("a".repeat(MAX_EVENT_NAME_LENGTH))).toHaveLength(
      MAX_EVENT_NAME_LENGTH,
    )
    expect(normalizeEventName("a".repeat(MAX_EVENT_NAME_LENGTH + 1))).toBeNull()
  })

  it("rejects non-strings instead of coercing them", () => {
    expect(normalizeEventName(undefined)).toBeNull()
    expect(normalizeEventName(null)).toBeNull()
    expect(normalizeEventName(42)).toBeNull()
  })
})
