import { anonymizeIp, applyEventIpStorage, resolveEventIpStorage } from "./ip-anonymize"

describe("anonymizeIp", () => {
  it("zeroes the last IPv4 octet", () => {
    expect(anonymizeIp("203.0.113.7")).toBe("203.0.113.0")
    expect(anonymizeIp("10.0.0.255")).toBe("10.0.0.0")
    expect(anonymizeIp(" 192.168.1.42 ")).toBe("192.168.1.0")
  })

  it("treats IPv4-mapped IPv6 as IPv4, matching extractClientIp's normalization", () => {
    expect(anonymizeIp("::ffff:203.0.113.7")).toBe("203.0.113.0")
    expect(anonymizeIp("::FFFF:203.0.113.7")).toBe("203.0.113.0")
  })

  it("keeps the first 48 bits of an IPv6 address and zeroes the rest", () => {
    expect(anonymizeIp("2001:0db8:85a3:0000:0000:8a2e:0370:7334")).toBe("2001:db8:85a3:0:0:0:0:0")
  })

  it("expands :: before truncating so a compressed address lands in the same bucket", () => {
    // 同一个地址的两种写法必须归一到同一个字符串，否则按 IP 分组会分裂成两桶。
    expect(anonymizeIp("2001:db8:1::1")).toBe(anonymizeIp("2001:db8:1:0:0:0:0:1"))
    expect(anonymizeIp("2001:db8:1::1")).toBe("2001:db8:1:0:0:0:0:0")
  })

  it("handles :: at either end", () => {
    expect(anonymizeIp("::1")).toBe("0:0:0:0:0:0:0:0")
    expect(anonymizeIp("2001:db8::")).toBe("2001:db8:0:0:0:0:0:0")
  })

  it("strips the zone index", () => {
    expect(anonymizeIp("fe80::1%eth0")).toBe("fe80:0:0:0:0:0:0:0")
  })

  it("returns null for anything it cannot parse rather than passing it through", () => {
    // 解析不了的更可能是代理写坏的头部，留着既没有分析价值又是个隐私敞口。
    expect(anonymizeIp("")).toBeNull()
    expect(anonymizeIp("   ")).toBeNull()
    expect(anonymizeIp("not-an-address")).toBeNull()
    expect(anonymizeIp("203.0.113")).toBeNull()
    expect(anonymizeIp("203.0.113.7.9")).toBeNull()
    expect(anonymizeIp("203.0.113.999")).toBeNull()
    expect(anonymizeIp("2001::db8::1")).toBeNull()
    expect(anonymizeIp("2001:db8:zzzz::1")).toBeNull()
    expect(anonymizeIp("1:2:3:4:5:6:7:8:9")).toBeNull()
  })
})

describe("applyEventIpStorage", () => {
  it("anonymizes by default", () => {
    expect(applyEventIpStorage("203.0.113.7", "anonymized")).toBe("203.0.113.0")
  })

  it("keeps the full address only when explicitly configured", () => {
    expect(applyEventIpStorage("203.0.113.7", "full")).toBe("203.0.113.7")
  })

  it("stores nothing under none, and never invents an address", () => {
    expect(applyEventIpStorage("203.0.113.7", "none")).toBeNull()
    expect(applyEventIpStorage(null, "full")).toBeNull()
    expect(applyEventIpStorage(null, "anonymized")).toBeNull()
  })
})

describe("resolveEventIpStorage", () => {
  const original = process.env.VERHUB_EVENT_IP_STORAGE

  afterEach(() => {
    if (original === undefined) {
      delete process.env.VERHUB_EVENT_IP_STORAGE
    } else {
      process.env.VERHUB_EVENT_IP_STORAGE = original
    }
  })

  it("defaults to anonymized", () => {
    delete process.env.VERHUB_EVENT_IP_STORAGE
    expect(resolveEventIpStorage()).toBe("anonymized")
  })

  it("accepts the three documented values, case-insensitively", () => {
    process.env.VERHUB_EVENT_IP_STORAGE = "FULL"
    expect(resolveEventIpStorage()).toBe("full")
    process.env.VERHUB_EVENT_IP_STORAGE = "none"
    expect(resolveEventIpStorage()).toBe("none")
  })

  it("falls back to anonymized on an unrecognised value rather than storing everything", () => {
    process.env.VERHUB_EVENT_IP_STORAGE = "yes-please"
    expect(resolveEventIpStorage()).toBe("anonymized")
  })
})
