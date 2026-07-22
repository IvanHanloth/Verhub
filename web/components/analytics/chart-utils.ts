/**
 * 统计大屏各卡片共用的配色、格式化与分桶工具。
 *
 * 抽出来是因为「同一个平台在饼图和堆叠图里必须是同一个颜色」这类约束一旦分散
 * 到各个卡片里就守不住了——大屏上同一维度换了颜色，读图的人会当成两回事。
 */

import type { Granularity, PublicEndpoint } from "@/lib/analytics-api"
import { ENDPOINT_LABELS, PLATFORM_LABELS } from "@/lib/analytics-api"
import type { StatPlatform } from "@/lib/platform"

export const DAY_SECONDS = 86400

/**
 * Categorical slots, assigned in fixed order and never cycled. Platform count is
 * bounded at 7 by the backend enum, so the 8-slot palette always suffices.
 */
export const PLATFORM_COLORS: Record<StatPlatform, string> = {
  IOS: "var(--series-1)",
  ANDROID: "var(--series-2)",
  WINDOWS: "var(--series-3)",
  LINUX: "var(--series-4)",
  MACOS: "var(--series-5)",
  WEB: "var(--series-6)",
  OTHERS: "var(--series-8)",
}

/**
 * Slots for charts whose categories come from the data (versions, countries)
 * rather than a fixed enum. Assigned by rank and cycled once exhausted: past
 * eight categories a repeated hue is unavoidable, and every one of these charts
 * is paired with a table that carries the identity as text.
 */
const SERIES_VARS = Array.from({ length: 8 }, (_, index) => `var(--series-${index + 1})`)

export function seriesColor(index: number): string {
  return SERIES_VARS[index % SERIES_VARS.length]!
}

/** 聚合类目（「其他」楔形、长尾行）的中性色，避免读成又一个类目。 */
export const TAIL_COLOR = "var(--muted-foreground)"

/** How many slices a donut stays readable at; the rest collapses into 其他. */
export const PIE_SLICE_LIMIT = 8

export function formatBucket(bucket: number, granularity: Granularity): string {
  const date = new Date(bucket * 1000)
  if (granularity === "hour") {
    return `${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(
      2,
      "0",
    )} ${String(date.getHours()).padStart(2, "0")}:00`
  }
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`
}

export function formatNumber(value: number): string {
  return value.toLocaleString("zh-CN")
}

export function percent(value: number, total: number): string {
  if (total <= 0) return "0%"
  return `${((value / total) * 100).toFixed(1)}%`
}

/** 一个分布类目：图表画 `count`，图例与表格显示 `label`，两处共用 `fill`。 */
export type DistributionItem = {
  key: string
  label: string
  count: number
  fill: string
}

/**
 * Keep the largest slices and fold everything else into one 其他 wedge.
 *
 * A donut stops communicating anything past a handful of slices, but dropping
 * the tail outright would leave a chart whose wedges do not add up to the total
 * the card claims — so the tail becomes a wedge of its own. `extraTail` carries
 * the rows the API already truncated.
 */
export function collapseTail(items: DistributionItem[], extraTail = 0): DistributionItem[] {
  const head = items.slice(0, PIE_SLICE_LIMIT)
  const tail =
    items.slice(PIE_SLICE_LIMIT).reduce((sum, item) => sum + item.count, 0) + Math.max(extraTail, 0)

  if (tail <= 0) {
    return head
  }

  return [...head, { key: "__tail__", label: "其他", count: tail, fill: TAIL_COLOR }]
}

/** 端点名 / 平台名 → 中文标签，供堆叠图的图例复用。 */
export function seriesLabel(groupBy: "endpoint" | "platform", key: string): string {
  if (groupBy === "endpoint") {
    return ENDPOINT_LABELS[key as PublicEndpoint] ?? key
  }
  return PLATFORM_LABELS[key as StatPlatform] ?? key
}

/** 堆叠序列的颜色：平台用固定配色，端点按排名取槽位。 */
export function seriesFill(groupBy: "endpoint" | "platform", key: string, index: number): string {
  if (groupBy === "platform") {
    return PLATFORM_COLORS[key as StatPlatform] ?? TAIL_COLOR
  }
  return seriesColor(index)
}
