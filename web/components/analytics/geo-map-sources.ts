/**
 * 热力地图的底图定义与取数。
 *
 * 单独成文件是为了让统计大屏能在不 import echarts 的前提下引用它们——地图组件
 * 是懒加载的，把这些放在组件文件里会把整个 echarts 拽进主 bundle。
 */

import { LOCAL_REGION, UNKNOWN_REGION } from "@/lib/analytics-api"

/**
 * 一张可注册的底图。
 *
 * `key` 是 feature 里用来跟数据对齐的属性：省级图用省名，世界图用 ISO alpha-2
 * 码。用码而不是国名对齐，是因为后端记录的就是码，中间再过一层国名表只会引入
 * 「United States of America」对不上「United States」这类错配。
 */
export type GeoMapSource = {
  /** echarts 全局注册名，各底图唯一。 */
  name: string
  /** GeoJSON 地址，public 下的静态资源。 */
  url: string
  /** feature.properties 里作为区域名的字段。 */
  key: string
  /**
   * 经度方向缩放。省级图省略、走 echarts 默认 0.75——在中纬度按 cos(lat) 压一压经度才不显宽；
   * 世界图设 1 取标准等距柱状投影(plate carrée)的 2:1 观感。
   */
  aspectScale?: number
  /**
   * 容器宽高比（Tailwind aspect-[] 值），让卡片盒子贴合底图形状、减少留白。
   * 与 preserveAspect 配合：盒子接近底图比例，地图就几乎填满且不变形。
   */
  aspectClass: string
  /**
   * 视野裁剪框 [[西北经纬], [东南经纬]]。世界图靠它砍掉南极洲那条空带，
   * 否则有效区域被压扁到卡片的上半截。
   */
  boundingCoords?: [[number, number], [number, number]]
}

/** 中国省级底图，含九段线/南海诸岛的官方边界。 */
export const CHINA_PROVINCE_MAP: GeoMapSource = {
  name: "china",
  url: "/geo/china-provinces.json",
  key: "name",
  aspectClass: "aspect-[4/3] w-full",
}

/**
 * 世界国家级底图：由 echarts 的 world.json 补上 ISO alpha-2 码生成，台港澳含在
 * 中国的图形内（数据侧同样并入 CN）。纬度裁到 84°N~58°S：南极洲不会有流量，
 * 留着只会把其余大陆压扁。
 */
export const WORLD_COUNTRY_MAP: GeoMapSource = {
  name: "world",
  url: "/geo/world-countries.json",
  key: "code",
  aspectScale: 1,
  aspectClass: "aspect-[2/1] w-full",
  boundingCoords: [
    [-180, 84],
    [180, -58],
  ],
}

/** 一个区域的计数。`key` 必须与底图 `key` 字段的取值一致。 */
export type GeoMapDatum = { key: string; count: number }

/**
 * 世界底图里没有独立图形、并入中国的地区码。
 * 不并的话这部分流量在地图上会凭空消失（「来源地区」图里仍按原码单列）。
 */
const MERGED_INTO_CN = new Set(["HK", "MO", "TW"])

/**
 * 把国家/地区分布桶折成世界底图的着色数据。
 * 「未知」「内网/本机」两个哨兵桶落不到任何图形上，直接丢掉。
 */
export function toCountryHeat(buckets: { region: string; count: number }[]): GeoMapDatum[] {
  const totals = new Map<string, number>()
  for (const bucket of buckets) {
    if (bucket.region === UNKNOWN_REGION || bucket.region === LOCAL_REGION) continue
    const code = MERGED_INTO_CN.has(bucket.region) ? "CN" : bucket.region
    totals.set(code, (totals.get(code) ?? 0) + bucket.count)
  }
  return [...totals.entries()].map(([key, count]) => ({ key, count }))
}
