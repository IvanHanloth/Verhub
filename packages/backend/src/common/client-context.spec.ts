import {
  extractClientContext,
  extractClientIp,
  extractUserAgent,
  isPrivateIp,
  MAX_USER_AGENT_LENGTH,
  normalizeIp,
} from "./client-context"

describe("normalizeIp", () => {
  it("unwraps the IPv4-mapped IPv6 form Node reports on dual-stack sockets", () => {
    expect(normalizeIp("::ffff:203.0.113.9")).toBe("203.0.113.9")
  })

  it("strips a port from an IPv4 address", () => {
    expect(normalizeIp("203.0.113.9:56789")).toBe("203.0.113.9")
  })

  it("strips brackets and port from an IPv6 address", () => {
    expect(normalizeIp("[2001:db8::1]:443")).toBe("2001:db8::1")
  })

  it("keeps a bare IPv6 address intact", () => {
    expect(normalizeIp("2001:db8::1")).toBe("2001:db8::1")
  })

  it("returns null for blank or non-string input", () => {
    expect(normalizeIp("   ")).toBeNull()
    expect(normalizeIp(undefined)).toBeNull()
  })
})

describe("extractClientIp", () => {
  afterEach(() => {
    delete process.env.VERHUB_TRUSTED_PROXY_COUNT
    delete process.env.VERHUB_CLIENT_IP_HEADER
  })

  it("takes the entry the trusted proxy appended, not the client-supplied left-most one", () => {
    // 客户端伪造了 198.51.100.4，自带 nginx 在链尾追加了它的直连对端。
    const ip = extractClientIp({
      headers: { "x-forwarded-for": "198.51.100.4, 203.0.113.9" },
    })
    expect(ip).toBe("203.0.113.9")
  })

  it("counts the CDN as an extra hop when VERHUB_TRUSTED_PROXY_COUNT says so", () => {
    process.env.VERHUB_TRUSTED_PROXY_COUNT = "2"
    const ip = extractClientIp({
      // 伪造项 → 真实访客（CDN 追加）→ 边缘节点（nginx 追加）
      headers: { "x-forwarded-for": "198.51.100.4, 203.0.113.9, 172.65.1.1" },
    })
    expect(ip).toBe("203.0.113.9")
  })

  it("prefers the CDN-written header over the forwarded chain", () => {
    const ip = extractClientIp({
      headers: {
        "cf-connecting-ip": "203.0.113.9",
        "x-forwarded-for": "198.51.100.4, 172.65.1.1",
      },
    })
    expect(ip).toBe("203.0.113.9")
  })

  it("keeps walking left when the hop count lands on an internal address", () => {
    const ip = extractClientIp({
      headers: { "x-forwarded-for": "203.0.113.9, 10.0.0.1, 10.0.0.2" },
    })
    expect(ip).toBe("203.0.113.9")
  })

  it("honours an explicitly configured header and ignores the built-in ones", () => {
    process.env.VERHUB_CLIENT_IP_HEADER = "x-my-cdn-ip"
    const ip = extractClientIp({
      headers: { "x-my-cdn-ip": "203.0.113.9", "cf-connecting-ip": "198.51.100.4" },
    })
    expect(ip).toBe("203.0.113.9")
  })

  it("ignores every forwarded header when no proxy is trusted", () => {
    process.env.VERHUB_TRUSTED_PROXY_COUNT = "0"
    const ip = extractClientIp({
      headers: { "x-forwarded-for": "198.51.100.4", "cf-connecting-ip": "198.51.100.5" },
      socket: { remoteAddress: "203.0.113.9" },
    })
    expect(ip).toBe("203.0.113.9")
  })

  it("falls back through the remaining proxy headers", () => {
    expect(extractClientIp({ headers: { "true-client-ip": "198.51.100.4" } })).toBe("198.51.100.4")
    expect(extractClientIp({ headers: { "x-real-ip": "198.51.100.5" } })).toBe("198.51.100.5")
  })

  it("falls back to the socket address when no proxy header is present", () => {
    const ip = extractClientIp({ headers: {}, socket: { remoteAddress: "::ffff:192.0.2.7" } })
    expect(ip).toBe("192.0.2.7")
  })

  it("skips empty entries in the forwarded chain", () => {
    const ip = extractClientIp({ headers: { "x-forwarded-for": " , , 203.0.113.9" } })
    expect(ip).toBe("203.0.113.9")
  })

  it("returns null when nothing usable is available", () => {
    expect(extractClientIp({ headers: {} })).toBeNull()
  })
})

describe("extractUserAgent", () => {
  it("trims and returns the header", () => {
    expect(extractUserAgent({ headers: { "user-agent": "  verhub-sdk/1.0  " } })).toBe(
      "verhub-sdk/1.0",
    )
  })

  it("caps an oversized User-Agent rather than storing it whole", () => {
    const ua = "x".repeat(MAX_USER_AGENT_LENGTH + 200)
    expect(extractUserAgent({ headers: { "user-agent": ua } })).toHaveLength(MAX_USER_AGENT_LENGTH)
  })

  it("returns null when the header is missing or blank", () => {
    expect(extractUserAgent({ headers: {} })).toBeNull()
    expect(extractUserAgent({ headers: { "user-agent": "   " } })).toBeNull()
  })
})

describe("extractClientContext", () => {
  it("returns both observed facts together", () => {
    expect(
      extractClientContext({
        headers: { "x-forwarded-for": "203.0.113.9", "user-agent": "verhub-sdk/1.0" },
      }),
    ).toEqual({ ip: "203.0.113.9", userAgent: "verhub-sdk/1.0" })
  })
})

describe("isPrivateIp", () => {
  it.each([
    "127.0.0.1",
    "10.1.2.3",
    "192.168.1.1",
    "172.16.0.1",
    "172.31.255.254",
    "169.254.1.1",
    "100.64.0.1",
    "::1",
    "fd00::1",
    "fe80::1",
  ])("treats %s as unroutable", (ip) => {
    expect(isPrivateIp(ip)).toBe(true)
  })

  it.each(["203.0.113.9", "8.8.8.8", "172.32.0.1", "100.128.0.1", "2001:db8::1"])(
    "treats %s as public",
    (ip) => {
      expect(isPrivateIp(ip)).toBe(false)
    },
  )
})
