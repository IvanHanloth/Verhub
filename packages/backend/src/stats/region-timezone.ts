/**
 * 国家码 → 代表 UTC 偏移（分钟），供热力图按「来源当地时区」折叠。
 *
 * 聚合表只存到国家码，没有经度/省级时区，所以跨时区国家（美/俄/加/澳等）只能用
 * 一个代表时区近似——取其人口/流量主要落点。中国全境官方统一 UTC+8，精确无损。
 * 表外国家与 UNKNOWN/LOCAL 回退到调用方时区（见 resolveTzOffset）。
 */
const HOUR = 60

// 仅列主要来源国；缺失的走回退，不必穷举 ISO-3166。
export const COUNTRY_TZ_OFFSET_MINUTES: Record<string, number> = {
  CN: 8 * HOUR, // 中国：全境 UTC+8，精确
  HK: 8 * HOUR,
  MO: 8 * HOUR,
  TW: 8 * HOUR,
  JP: 9 * HOUR,
  KR: 9 * HOUR,
  SG: 8 * HOUR,
  IN: 5 * HOUR + 30,
  TH: 7 * HOUR,
  VN: 7 * HOUR,
  ID: 7 * HOUR, // 跨三时区，取西部（雅加达）
  MY: 8 * HOUR,
  PH: 8 * HOUR,
  AE: 4 * HOUR,
  GB: 0,
  IE: 0,
  DE: 1 * HOUR,
  FR: 1 * HOUR,
  NL: 1 * HOUR,
  ES: 1 * HOUR,
  IT: 1 * HOUR,
  SE: 1 * HOUR,
  PL: 1 * HOUR,
  RU: 3 * HOUR, // 跨多时区，取莫斯科
  TR: 3 * HOUR,
  US: -5 * HOUR, // 跨多时区，取东部
  CA: -5 * HOUR, // 跨多时区，取东部
  BR: -3 * HOUR, // 跨多时区，取圣保罗
  MX: -6 * HOUR,
  AU: 10 * HOUR, // 跨多时区，取东部（悉尼）
  NZ: 12 * HOUR,
}

/**
 * 解析某来源国家码应折叠到的分钟偏移。命中表用表值；表外或 UNKNOWN/LOCAL
 * 无从判断来源时区，回退到调用方（管理员）时区，避免这类流量凭空聚到 UTC。
 */
export function resolveTzOffset(region: string, fallbackMinutes: number): number {
  const offset = COUNTRY_TZ_OFFSET_MINUTES[region]
  return offset === undefined ? fallbackMinutes : offset
}
