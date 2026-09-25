import { localeKey, matchRegisteredLocale, resolveLocalePreference } from "./locale"

describe("localeKey", () => {
  it("treats hyphen, underscore and parentheses as the same separator", () => {
    for (const value of ["en-US", "en_US", "en(US)", "EN (us)", " en-us "]) {
      expect(localeKey(value)).toBe("en-us")
    }
    expect(localeKey("zh_Hans_CN")).toBe("zh-hans-cn")
    expect(localeKey("zh-Hans(CN)")).toBe("zh-hans-cn")
  })

  it("compares tags without separators as a whole string", () => {
    expect(localeKey("English")).toBe("english")
    expect(localeKey("简体中文")).toBe("简体中文")
  })

  it("keeps separator-only input distinct from an empty key", () => {
    expect(localeKey("()")).toBe("()")
  })
})

describe("resolveLocalePreference", () => {
  const registered = [
    { locale: "en", aliases: ["en-GB"] },
    { locale: "zh-CN", aliases: [] },
  ]

  it("returns the primary tag for any spelling of a registered tag or alias", () => {
    expect(resolveLocalePreference(registered, "zh_cn")).toEqual({ locale: "zh-CN", message: null })
    expect(resolveLocalePreference(registered, "en(GB)")).toEqual({ locale: "en", message: null })
  })

  it("does not fall back by prefix", () => {
    expect(matchRegisteredLocale(registered, "en-US")).toBeNull()
  })

  it("never rejects a format: unmatched input yields a message instead", () => {
    const result = resolveLocalePreference(registered, "français!!")
    expect(result.locale).toBeNull()
    expect(result.message).toContain("français!!")
  })

  it("stays silent when no preference is given", () => {
    expect(resolveLocalePreference(registered, "  ")).toEqual({ locale: null, message: null })
    expect(resolveLocalePreference(registered, undefined)).toEqual({ locale: null, message: null })
  })
})
