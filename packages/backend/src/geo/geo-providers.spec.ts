import { GEO_PROVIDERS, selectProviders } from "./geo-providers"

function providerNamed(name: string) {
  const provider = GEO_PROVIDERS.find((candidate) => candidate.name === name)
  if (!provider) {
    throw new Error(`provider ${name} is missing from the fallback chain`)
  }
  return provider
}

describe("provider payload parsing", () => {
  it("parses a pconline payload as a mainland-China placement", () => {
    expect(
      providerNamed("pconline.com.cn").parse({
        ip: "43.226.46.193",
        pro: "辽宁省",
        proCode: "210000",
        city: "大连市",
        cityCode: "210200",
        addr: "辽宁省大连市 电信",
        err: "",
      }),
    ).toEqual({
      countryCode: "CN",
      countryName: "中国",
      regionName: "辽宁省",
      city: "大连市",
      regionCode: "210000",
      cityCode: "210200",
    })
  })

  it("rejects a pconline payload with an error or no province", () => {
    expect(providerNamed("pconline.com.cn").parse({ pro: "", city: "", err: "非法IP" })).toBeNull()
    // 境外 IP：该接口返回空省份，交后续 provider 处理。
    expect(providerNamed("pconline.com.cn").parse({ pro: "", city: "", err: "" })).toBeNull()
  })

  it("parses a cz88 payload from its nested data object", () => {
    expect(
      providerNamed("cz88.net").parse({
        code: 200,
        success: true,
        data: {
          country: "中国",
          province: "辽宁",
          city: "大连",
          districts: "中山区",
          countryCode: "CN",
          provinceCode: "210000",
          cityCode: "210200",
        },
      }),
    ).toEqual({
      countryCode: "CN",
      countryName: "中国",
      regionName: "辽宁",
      city: "大连",
      regionCode: "210000",
      cityCode: "210200",
    })
  })

  it("rejects a cz88 payload that did not succeed", () => {
    expect(
      providerNamed("cz88.net").parse({ code: 400, success: false, message: "失败" }),
    ).toBeNull()
    expect(providerNamed("cz88.net").parse({ success: true })).toBeNull()
  })

  it("parses an ipwho.is success payload", () => {
    expect(
      providerNamed("ipwho.is").parse({
        success: true,
        country_code: "jp",
        country: "Japan",
        region: "Tokyo",
        city: "Shibuya",
      }),
    ).toEqual({
      countryCode: "JP",
      countryName: "Japan",
      regionName: "Tokyo",
      city: "Shibuya",
      regionCode: null,
      cityCode: null,
    })
  })

  it("rejects an ipwho.is failure that still returned HTTP 200", () => {
    expect(
      providerNamed("ipwho.is").parse({ success: false, message: "Reserved range" }),
    ).toBeNull()
  })

  it("parses a freeipapi.com payload", () => {
    expect(
      providerNamed("freeipapi.com").parse({
        countryCode: "DE",
        countryName: "Germany",
        regionName: "Berlin",
        cityName: "Berlin",
      }),
    ).toEqual({
      countryCode: "DE",
      countryName: "Germany",
      regionName: "Berlin",
      city: "Berlin",
      regionCode: null,
      cityCode: null,
    })
  })

  it("rejects an ipapi.co error payload", () => {
    expect(providerNamed("ipapi.co").parse({ error: true, reason: "RateLimited" })).toBeNull()
  })

  it("rejects an ip-api.com response whose status is not success", () => {
    expect(
      providerNamed("ip-api.com").parse({ status: "fail", message: "reserved range" }),
    ).toBeNull()
  })

  it("rejects a payload with no usable country code", () => {
    expect(providerNamed("ipwho.is").parse({ success: true, city: "Nowhere" })).toBeNull()
    // Country *name* in the code field is the shape a changed API would return.
    expect(providerNamed("ipwho.is").parse({ success: true, country_code: "Japan" })).toBeNull()
  })

  it("rejects non-object payloads", () => {
    expect(providerNamed("ipwho.is").parse("nope")).toBeNull()
    expect(providerNamed("ipwho.is").parse(null)).toBeNull()
  })

  it("blanks out empty optional fields rather than storing empty strings", () => {
    expect(
      providerNamed("freeipapi.com").parse({
        countryCode: "US",
        countryName: "  ",
        regionName: "",
        cityName: "Austin",
      }),
    ).toEqual({
      countryCode: "US",
      countryName: null,
      regionName: null,
      city: "Austin",
      regionCode: null,
      cityCode: null,
    })
  })
})

describe("buildUrl", () => {
  it("escapes the address into the path", () => {
    expect(providerNamed("ipwho.is").buildUrl("203.0.113.9")).toBe("https://ipwho.is/203.0.113.9")
    expect(providerNamed("ipwho.is").buildUrl("2001:db8::1")).toContain("2001%3Adb8%3A%3A1")
  })

  it("escapes the address into the China providers' query string", () => {
    expect(providerNamed("pconline.com.cn").buildUrl("2001:db8::1")).toBe(
      "https://whois.pconline.com.cn/ipJson.jsp?ip=2001%3Adb8%3A%3A1&json=true",
    )
    expect(providerNamed("cz88.net").buildUrl("203.0.113.9")).toBe(
      "https://www.cz88.net/api/cz88/ip/geo?ip=203.0.113.9",
    )
  })
})

describe("selectProviders", () => {
  it("returns the full chain when nothing is configured", () => {
    expect(selectProviders(undefined)).toEqual(GEO_PROVIDERS)
  })

  it("honours the configured order", () => {
    expect(selectProviders("ip-api.com,ipwho.is").map((provider) => provider.name)).toEqual([
      "ip-api.com",
      "ipwho.is",
    ])
  })

  it("ignores unknown names", () => {
    expect(selectProviders("ipwho.is,made-up").map((provider) => provider.name)).toEqual([
      "ipwho.is",
    ])
  })

  it("falls back to the full chain when the list resolves to nothing", () => {
    // A typo must degrade to the default rather than silently disabling lookups.
    expect(selectProviders("made-up, also-fake")).toEqual(GEO_PROVIDERS)
    expect(selectProviders("  ")).toEqual(GEO_PROVIDERS)
  })
})
