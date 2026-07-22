import { GeoLocationService, LOCAL_COUNTRY, UNKNOWN_COUNTRY } from "./geo-location.service"

function createPrismaMock() {
  return {
    ipGeoCache: {
      findUnique: jest.fn().mockResolvedValue(null),
      upsert: jest.fn().mockResolvedValue({}),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
  }
}

function jsonResponse(body: unknown, ok = true) {
  return { ok, json: () => Promise.resolve(body) }
}

/** 模拟按字节返回的响应，用于覆盖 charset 解码分支（如 pconline 的 GBK）。 */
function bufferResponse(body: unknown, ok = true) {
  const buffer = new TextEncoder().encode(JSON.stringify(body)).buffer
  return { ok, arrayBuffer: () => Promise.resolve(buffer) }
}

const originalFetch = global.fetch
const originalEnv = { ...process.env }

function createService(prisma: ReturnType<typeof createPrismaMock>) {
  return new GeoLocationService(prisma as never)
}

describe("GeoLocationService", () => {
  beforeEach(() => {
    jest.restoreAllMocks()
    process.env = { ...originalEnv }
    delete process.env.VERHUB_GEO_ENABLED
    delete process.env.VERHUB_GEO_PROVIDERS
    delete process.env.VERHUB_GEO_TIMEOUT_MS
  })

  afterAll(() => {
    global.fetch = originalFetch
    process.env = originalEnv
  })

  it("short-circuits private addresses without touching a provider", async () => {
    const fetchMock = jest.fn()
    global.fetch = fetchMock as never
    const prisma = createPrismaMock()

    await expect(createService(prisma).resolve("192.168.1.10")).resolves.toEqual({
      countryCode: LOCAL_COUNTRY,
      countryName: null,
      regionName: null,
      city: null,
      regionCode: null,
      cityCode: null,
    })

    expect(fetchMock).not.toHaveBeenCalled()
    expect(prisma.ipGeoCache.findUnique).not.toHaveBeenCalled()
  })

  it("returns UNKNOWN without a lookup when there is no address", async () => {
    const fetchMock = jest.fn()
    global.fetch = fetchMock as never

    await expect(createService(createPrismaMock()).resolve(null)).resolves.toEqual({
      countryCode: UNKNOWN_COUNTRY,
      countryName: null,
      regionName: null,
      city: null,
      regionCode: null,
      cityCode: null,
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("serves a fresh row from the persistent cache", async () => {
    const fetchMock = jest.fn()
    global.fetch = fetchMock as never
    const prisma = createPrismaMock()
    prisma.ipGeoCache.findUnique.mockResolvedValue({
      ip: "203.0.113.9",
      countryCode: "JP",
      countryName: "Japan",
      regionName: "Tokyo",
      city: "Shibuya",
      regionCode: null,
      cityCode: null,
      source: "ipwho.is",
      // Far enough out that the freshness check cannot be time-of-day sensitive.
      expiresAt: Math.floor(Date.now() / 1000) + 86400,
    })

    await expect(createService(prisma).resolve("203.0.113.9")).resolves.toEqual({
      countryCode: "JP",
      countryName: "Japan",
      regionName: "Tokyo",
      city: "Shibuya",
      regionCode: null,
      cityCode: null,
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("falls through to the next provider when the first one fails", async () => {
    process.env.VERHUB_GEO_PROVIDERS = "ipwho.is,freeipapi.com"
    const fetchMock = jest
      .fn()
      .mockRejectedValueOnce(new Error("timeout"))
      .mockResolvedValueOnce(
        jsonResponse({
          countryCode: "DE",
          countryName: "Germany",
          regionName: "Berlin",
          cityName: "Berlin",
        }),
      )
    global.fetch = fetchMock as never
    const prisma = createPrismaMock()

    await expect(createService(prisma).resolve("203.0.113.9")).resolves.toEqual({
      countryCode: "DE",
      countryName: "Germany",
      regionName: "Berlin",
      city: "Berlin",
      regionCode: null,
      cityCode: null,
    })

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(prisma.ipGeoCache.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ countryCode: "DE", source: "freeipapi.com" }),
      }),
    )
  })

  it("caches the failure when every provider gives up", async () => {
    global.fetch = jest.fn().mockResolvedValue(jsonResponse({}, false)) as never
    const prisma = createPrismaMock()

    await expect(createService(prisma).resolve("203.0.113.9")).resolves.toEqual({
      countryCode: UNKNOWN_COUNTRY,
      countryName: null,
      regionName: null,
      city: null,
      regionCode: null,
      cityCode: null,
    })

    // Negative entries exist so the next request does not replay the whole chain.
    expect(prisma.ipGeoCache.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ source: "NONE" }) }),
    )
  })

  it("collapses a burst for one address into a single provider call", async () => {
    process.env.VERHUB_GEO_PROVIDERS = "ipwho.is"
    const fetchMock = jest
      .fn()
      .mockResolvedValue(jsonResponse({ success: true, country_code: "US", country: "USA" }))
    global.fetch = fetchMock as never
    const service = createService(createPrismaMock())

    const results = await Promise.all([
      service.resolve("203.0.113.9"),
      service.resolve("203.0.113.9"),
      service.resolve("203.0.113.9"),
    ])

    expect(results.every((result) => result.countryCode === "US")).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("reuses the in-process cache on a second call", async () => {
    process.env.VERHUB_GEO_PROVIDERS = "ipwho.is"
    const fetchMock = jest
      .fn()
      .mockResolvedValue(jsonResponse({ success: true, country_code: "US", country: "USA" }))
    global.fetch = fetchMock as never
    const prisma = createPrismaMock()
    const service = createService(prisma)

    await service.resolve("203.0.113.9")
    await service.resolve("203.0.113.9")

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(prisma.ipGeoCache.findUnique).toHaveBeenCalledTimes(1)
  })

  it("makes no outbound call when disabled", async () => {
    process.env.VERHUB_GEO_ENABLED = "false"
    const fetchMock = jest.fn()
    global.fetch = fetchMock as never

    await expect(createService(createPrismaMock()).resolve("203.0.113.9")).resolves.toEqual({
      countryCode: UNKNOWN_COUNTRY,
      countryName: null,
      regionName: null,
      city: null,
      regionCode: null,
      cityCode: null,
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("uses only the configured providers", async () => {
    process.env.VERHUB_GEO_PROVIDERS = "ip-api.com"
    const fetchMock = jest.fn().mockResolvedValue(
      jsonResponse({
        status: "success",
        countryCode: "FR",
        country: "France",
        regionName: "IDF",
        city: "Paris",
      }),
    )
    global.fetch = fetchMock as never

    const result = await createService(createPrismaMock()).resolve("203.0.113.9")

    expect(result.countryCode).toBe("FR")
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(String(fetchMock.mock.calls[0]![0])).toContain("ip-api.com")
  })

  it("decodes a charset-tagged provider body from raw bytes", async () => {
    // pconline 声明 GBK，走 arrayBuffer 解码分支而非 response.json()。
    // 断言用 ASCII 值（GBK 与 UTF-8 在 ASCII 上等价），只为覆盖解码通路；
    // countryName 由解析器写死为中文，不受字节解码影响。
    process.env.VERHUB_GEO_PROVIDERS = "pconline.com.cn"
    const fetchMock = jest.fn().mockResolvedValue(
      bufferResponse({
        err: "",
        pro: "Liaoning",
        proCode: "210000",
        city: "Dalian",
        cityCode: "210200",
      }),
    )
    global.fetch = fetchMock as never

    await expect(createService(createPrismaMock()).resolve("203.0.113.9")).resolves.toEqual({
      countryCode: "CN",
      countryName: "中国",
      regionName: "Liaoning",
      city: "Dalian",
      regionCode: "210000",
      cityCode: "210200",
    })
    expect(String(fetchMock.mock.calls[0]![0])).toContain("whois.pconline.com.cn")
  })

  it("still resolves when the cache table is unreadable", async () => {
    process.env.VERHUB_GEO_PROVIDERS = "ipwho.is"
    global.fetch = jest
      .fn()
      .mockResolvedValue(
        jsonResponse({ success: true, country_code: "US", country: "USA" }),
      ) as never
    const prisma = createPrismaMock()
    prisma.ipGeoCache.findUnique.mockRejectedValue(new Error("relation does not exist"))

    await expect(createService(prisma).resolve("203.0.113.9")).resolves.toMatchObject({
      countryCode: "US",
    })
  })

  it("stops walking the chain once the total budget is gone", async () => {
    // 1ms budget: the first attempt consumes it, so no provider after the one
    // that failed is even tried. 用带延迟的拒绝让预算确定性耗尽，避免依赖真实耗时。
    process.env.VERHUB_GEO_TIMEOUT_MS = "1"
    const fetchMock = jest.fn(
      () => new Promise((_resolve, reject) => setTimeout(() => reject(new Error("timeout")), 20)),
    )
    global.fetch = fetchMock as never

    await expect(createService(createPrismaMock()).resolve("203.0.113.9")).resolves.toMatchObject({
      countryCode: UNKNOWN_COUNTRY,
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("reports its configuration for the admin view", () => {
    process.env.VERHUB_GEO_PROVIDERS = "ipwho.is,ipapi.co"
    expect(createService(createPrismaMock()).getConfiguration()).toEqual({
      enabled: true,
      providers: ["ipwho.is", "ipapi.co"],
      ttl_days: 30,
    })
  })
})
