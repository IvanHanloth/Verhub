"use client"

import * as React from "react"
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, XAxis, YAxis } from "recharts"

import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@workspace/ui/components/chart"

import { collapseTail, formatNumber, percent, type DistributionItem } from "./chart-utils"
import type { ChartView } from "./chart-card"

/**
 * 大屏上所有「一个维度的分布」都走这一个组件：系统版本、客户端版本、接口构成、
 * 来源平台、来源地区。
 *
 * 它们此前是五段几乎一样的 JSX，配色、长尾折叠、tooltip 措辞各写各的，加一张图
 * 就要再抄一遍。统一之后，「柱状图排名 / 环形图看占比」这条规则由组件保证。
 */

type DistributionChartProps = {
  items: DistributionItem[]
  view: ChartView
  /** 度量名，出现在 tooltip 与图例里，如「请求数」「上报数」。 */
  measureLabel: string
  /** 柱状图单色时用的颜色；环形图始终按类目取 `item.fill`。 */
  barColor?: string
  /** API 已截断的尾巴计数，折进环形图的「其他」楔形，避免占比不闭合。 */
  extraTail?: number
  /** 轴标签列宽。窄屏上留给条形的空间有限，默认值已按最窄的卡片取。 */
  labelWidth?: number
  /** 轴标签最多显示几个字符，超出截断；完整名字仍在 tooltip 里。 */
  labelMaxChars?: number
  className?: string
}

/**
 * `ChartStyle` 把 config 的键直接拼进 `--color-<key>`，而类目名里常有点和冒号
 * （`1.20.326`、`WINDOWS:11`），拼出来是非法的自定义属性名，整条规则会被浏览器
 * 丢弃。所以类目原名只进 label，config 的键一律用下标生成的安全名。
 */
function safeKey(index: number): string {
  return `c${index}`
}

export function DistributionChart({
  items,
  view,
  measureLabel,
  barColor = "var(--series-1)",
  extraTail = 0,
  labelWidth = 96,
  labelMaxChars = 12,
  className = "aspect-[4/3] w-full",
}: DistributionChartProps) {
  const donutItems = React.useMemo(
    () => collapseTail(items, extraTail).map((item, index) => ({ ...item, slot: safeKey(index) })),
    [items, extraTail],
  )

  // 柱状图的身份在坐标轴上，只需要一个度量色；环形图要按楔形给图例和 tooltip
  // 取名，所以每个类目都得进 config。
  const config: ChartConfig = React.useMemo(() => {
    if (view === "bar") {
      return { count: { label: measureLabel, color: barColor } }
    }
    const next: ChartConfig = { count: { label: measureLabel } }
    for (const item of donutItems) {
      next[item.slot] = { label: item.label, color: item.fill }
    }
    return next
  }, [view, measureLabel, barColor, donutItems])

  if (view === "donut") {
    return (
      <ChartContainer config={config} className={className}>
        <PieChart>
          <ChartTooltip content={<ChartTooltipContent nameKey="slot" hideLabel />} />
          {/* isAnimationActive={false}: 重渲染时重播入场动画会让并排的几张环形图
              各自转一圈，读起来像数据在跳。 */}
          <Pie
            data={donutItems}
            dataKey="count"
            nameKey="slot"
            innerRadius="55%"
            outerRadius="85%"
            strokeWidth={2}
            isAnimationActive={false}
          />
          <ChartLegend content={<ChartLegendContent nameKey="slot" />} />
        </PieChart>
      </ChartContainer>
    )
  }

  return (
    <ChartContainer config={config} className={className}>
      <BarChart data={items} layout="vertical" margin={{ left: 4, right: 16, top: 4, bottom: 4 }}>
        <CartesianGrid horizontal={false} strokeDasharray="3 3" />
        <XAxis type="number" dataKey="count" hide allowDecimals={false} />
        {/* Identity lives on the axis here, so every tick must render. */}
        <YAxis
          type="category"
          dataKey="label"
          tickLine={false}
          axisLine={false}
          width={labelWidth}
          interval={0}
          tick={{ fontSize: 11 }}
          tickFormatter={(value: string) =>
            value.length > labelMaxChars ? `${value.slice(0, labelMaxChars - 1)}…` : value
          }
        />
        {/* 轴上的名字可能被截断过，所以这里保留 label：tooltip 是完整名字的去处。 */}
        <ChartTooltip content={<ChartTooltipContent />} />
        <Bar dataKey="count" radius={4} barSize={12}>
          {items.map((item) => (
            <Cell key={item.key} fill={item.fill} />
          ))}
        </Bar>
      </BarChart>
    </ChartContainer>
  )
}

/**
 * 分布的文字版：排名 + 计数 + 占比。
 *
 * 与图表成对出现而不是二选一——定类调色板里有几个色在浅色背景下对比度不足
 * 3:1，规则是用了它们的图必须配一份以文字承载身份的视图。
 */
export function ShareTable({
  items,
  total,
  categoryHeader,
  measureHeader,
  tailCount = 0,
  tailLabel = "其他",
}: {
  items: Array<DistributionItem & { suffix?: string }>
  total: number
  categoryHeader: string
  measureHeader: string
  tailCount?: number
  tailLabel?: string
}) {
  return (
    <div className="-mx-1 overflow-x-auto px-1">
      <table className="w-full min-w-[18rem] text-sm">
        <thead className="text-xs text-slate-500 dark:text-slate-400">
          <tr className="border-b border-slate-900/10 dark:border-white/10">
            <th className="py-2 text-left font-medium">{categoryHeader}</th>
            <th className="py-2 text-right font-medium">{measureHeader}</th>
            <th className="py-2 text-right font-medium">占比</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr
              key={item.key}
              className="border-b border-slate-900/5 last:border-0 dark:border-white/5"
            >
              <td className="py-2 text-xs">
                <span
                  className="mr-2 inline-block size-2 shrink-0 rounded-full align-middle"
                  style={{ background: item.fill }}
                  aria-hidden
                />
                {item.label}
                {item.suffix ? <span className="text-slate-400">{item.suffix}</span> : null}
              </td>
              <td className="py-2 text-right tabular-nums">{formatNumber(item.count)}</td>
              <td className="py-2 text-right tabular-nums">{percent(item.count, total)}</td>
            </tr>
          ))}
          {tailCount > 0 ? (
            <tr className="text-slate-500 dark:text-slate-400">
              <td className="py-2 text-xs">{tailLabel}</td>
              <td className="py-2 text-right tabular-nums">{formatNumber(tailCount)}</td>
              <td className="py-2 text-right tabular-nums">{percent(tailCount, total)}</td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  )
}
