/**
 * Public IP-geolocation providers, in fallback order.
 *
 * All of them are keyless free tiers, which is the point: Verhub is
 * self-hosted and must not require the operator to sign up for anything to get
 * a region breakdown. The flip side is that each one is rate limited and can
 * disappear, so no single provider is load-bearing — the resolver walks the
 * list until one answers and records which one did.
 *
 * 国内两家（太平洋科技、纯真网络）排在最前：Verhub 的主要流量来自中国大陆，
 * 这两家给出的是本土化的中文省市名，命中率也更高；它们只覆盖国内线路，境外 IP
 * 解析不出来会自动落到后面的国际供应商。国际部分仍是 HTTPS 优先，`ip-api.com`
 * 因为免费档只有明文 HTTP 排最后。
 */

export type GeoLookupResult = {
  /** ISO-3166 alpha-2, uppercased. */
  countryCode: string
  countryName: string | null
  /** Sub-national area (province/state). */
  regionName: string | null
  city: string | null
  /**
   * 省级行政区划码（GB/T 2260），仅国内两家返回。聚合按码分组以规避各家
   * 中文名不一致（「辽宁省」vs「辽宁」）导致的分桶碎片；名字只做展示。
   */
  regionCode: string | null
  /** 市级行政区划码（GB/T 2260），仅国内两家返回。 */
  cityCode: string | null
}

export type GeoProvider = {
  /** Stable identifier, persisted as `IpGeoCache.source`. */
  name: string
  buildUrl: (ip: string) => string
  /** 响应体字符集，缺省 UTF-8；pconline 返回 GBK，须显式解码否则中文乱码。 */
  charset?: string
  /** Return null when the payload is a valid response that failed to place the IP. */
  parse: (payload: unknown) => GeoLookupResult | null
}

function readString(source: Record<string, unknown>, key: string): string | null {
  const value = source[key]
  if (typeof value !== "string") {
    return null
  }
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function asRecord(payload: unknown): Record<string, unknown> | null {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    return null
  }
  return payload as Record<string, unknown>
}

/**
 * Build a result from a payload, keyed by that provider's field names.
 * Returns null without a country code: a row that cannot name a country is
 * indistinguishable from a failed lookup for every consumer downstream.
 */
function buildResult(
  payload: unknown,
  fields: { code: string; country: string; region: string; city: string },
  isFailure?: (record: Record<string, unknown>) => boolean,
): GeoLookupResult | null {
  const record = asRecord(payload)
  if (!record || isFailure?.(record)) {
    return null
  }

  const countryCode = readString(record, fields.code)
  if (!countryCode || countryCode.length !== 2) {
    return null
  }

  return {
    countryCode: countryCode.toUpperCase(),
    countryName: readString(record, fields.country),
    regionName: readString(record, fields.region),
    city: readString(record, fields.city),
    // 国际 provider 无国标行政区划码，聚合时落到空串 sentinel。
    regionCode: null,
    cityCode: null,
  }
}

/**
 * 太平洋科技：只覆盖国内线路，响应里没有国家码，能定位即视作中国大陆。
 * `err` 非空是失败信号；`pro`（省）为空说明未能定位（境外 IP 该接口返回空省），
 * 返回 null 让链条落到下一家。响应为 GBK，由 service 层按 `charset` 解码。
 */
function parsePconline(payload: unknown): GeoLookupResult | null {
  const record = asRecord(payload)
  if (!record || readString(record, "err")) {
    return null
  }
  const province = readString(record, "pro")
  if (!province) {
    return null
  }
  return {
    countryCode: "CN",
    countryName: "中国",
    regionName: province,
    city: readString(record, "city"),
    regionCode: readString(record, "proCode"),
    cityCode: readString(record, "cityCode"),
  }
}

/** 纯真网络：数据挂在 `data` 下，`success` 为真且带两位国家码才算命中。 */
function parseCz88(payload: unknown): GeoLookupResult | null {
  const record = asRecord(payload)
  if (!record || record.success !== true) {
    return null
  }
  const data = asRecord(record.data)
  if (!data) {
    return null
  }
  const countryCode = readString(data, "countryCode")
  if (!countryCode || countryCode.length !== 2) {
    return null
  }
  return {
    countryCode: countryCode.toUpperCase(),
    countryName: readString(data, "country"),
    regionName: readString(data, "province"),
    city: readString(data, "city"),
    regionCode: readString(data, "provinceCode"),
    cityCode: readString(data, "cityCode"),
  }
}

export const GEO_PROVIDERS: GeoProvider[] = [
  {
    name: "pconline.com.cn",
    charset: "gbk",
    buildUrl: (ip) =>
      `https://whois.pconline.com.cn/ipJson.jsp?ip=${encodeURIComponent(ip)}&json=true`,
    parse: parsePconline,
  },
  {
    name: "cz88.net",
    buildUrl: (ip) => `https://www.cz88.net/api/cz88/ip/geo?ip=${encodeURIComponent(ip)}`,
    parse: parseCz88,
  },
  {
    name: "ipwho.is",
    buildUrl: (ip) => `https://ipwho.is/${encodeURIComponent(ip)}`,
    // Answers 200 with `success: false` for addresses it cannot place, so the
    // HTTP status alone never tells you whether the lookup worked.
    parse: (payload) =>
      buildResult(
        payload,
        { code: "country_code", country: "country", region: "region", city: "city" },
        (record) => record.success === false,
      ),
  },
  {
    name: "freeipapi.com",
    buildUrl: (ip) => `https://free.freeipapi.com/api/json/${encodeURIComponent(ip)}`,
    parse: (payload) =>
      buildResult(payload, {
        code: "countryCode",
        country: "countryName",
        region: "regionName",
        city: "cityName",
      }),
  },
  {
    name: "ipapi.co",
    buildUrl: (ip) => `https://ipapi.co/${encodeURIComponent(ip)}/json/`,
    parse: (payload) =>
      buildResult(
        payload,
        { code: "country_code", country: "country_name", region: "region", city: "city" },
        (record) => record.error === true,
      ),
  },
  {
    name: "ip-api.com",
    // Free tier is HTTP-only; `fields` trims the response to what we store.
    buildUrl: (ip) =>
      `http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,countryCode,country,regionName,city`,
    parse: (payload) =>
      buildResult(
        payload,
        { code: "countryCode", country: "country", region: "regionName", city: "city" },
        (record) => record.status !== "success",
      ),
  },
]

/**
 * Select and order providers from a comma-separated allow-list, preserving the
 * caller's order. An empty or fully unrecognized list falls back to all
 * providers rather than to none — a typo in configuration should degrade to the
 * default, not silently turn geolocation off.
 */
export function selectProviders(names: string | undefined): GeoProvider[] {
  if (!names) {
    return GEO_PROVIDERS
  }

  const wanted = names
    .split(",")
    .map((name) => name.trim().toLowerCase())
    .filter((name) => name.length > 0)

  const selected = wanted
    .map((name) => GEO_PROVIDERS.find((provider) => provider.name.toLowerCase() === name))
    .filter((provider): provider is GeoProvider => provider !== undefined)

  return selected.length > 0 ? selected : GEO_PROVIDERS
}
