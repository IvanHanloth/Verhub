"use client"

import * as React from "react"
import { Area, AreaChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts"

import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@workspace/ui/components/chart"

import type { Granularity, TimeseriesSeries } from "@/lib/analytics-api"

import { formatBucket, seriesFill, seriesLabel } from "./chart-utils"

/**
 * 时间趋势图：一条总量线，或按维度拆开的堆叠面积。
 *
 * 堆叠而不是多条独立折线：这些维度（端点、平台、版本）是对同一批请求的划分，
 * 它们的和就是总量，堆叠把「构成怎么变」和「总量怎么变」画在同一张图里；并排
 * 折线则要读者自己在脑子里做加法。
 */

export type TrendPoint = { bucket: number; count: number }

/** 堆叠序列的通用形状：`key` 是端点名 / 平台名 / 版本号。 */
export type TrendSeries = TimeseriesSeries

type TrendChartProps = {
  points: TrendPoint[]
  granularity: Granularity
  className?: string
}

export function TrendLineChart({
  points,
  granularity,
  className = "aspect-[16/7] w-full",
}: TrendChartProps) {
  const data = React.useMemo(
    () =>
      points.map((point) => ({
        bucket: point.bucket,
        label: formatBucket(point.bucket, granularity),
        count: point.count,
      })),
    [points, granularity],
  )

  const config: ChartConfig = { count: { label: "请求数", color: "var(--series-1)" } }

  return (
    <ChartContainer config={config} className={className}>
      <LineChart data={data} margin={{ left: 4, right: 12, top: 8, bottom: 4 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} minTickGap={32} />
        <YAxis tickLine={false} axisLine={false} width={36} allowDecimals={false} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Line
          dataKey="count"
          type="monotone"
          stroke="var(--color-count)"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4 }}
        />
      </LineChart>
    </ChartContainer>
  )
}

type StackedTrendProps = {
  series: TrendSeries[]
  /** 时间桶取自第一条序列——后端已把所有序列补齐到同一批桶。 */
  granularity: Granularity
  /** 序列名的解释方式：枚举维度查中文表，版本号原样显示。 */
  naming: "endpoint" | "platform" | "raw"
  className?: string
}

/**
 * `ChartStyle` 把 config 的键直接拼进 `--color-<key>`，而版本号里的点会拼出
 * 非法的自定义属性名（`--color-2.3.0`），整条规则被浏览器丢弃、序列变成透明。
 * 所以对外的序列名只进 label，数据键一律用下标生成的安全名。
 */
function safeKey(index: number): string {
  return `s${index}`
}

export function StackedTrendChart({
  series,
  granularity,
  naming,
  className = "aspect-[16/7] w-full",
}: StackedTrendProps) {
  const { data, config, keys } = React.useMemo(() => {
    const buckets = series[0]?.data ?? []

    // 按下标合并各序列：后端保证每条序列都覆盖了同一批时间桶（含 0 值），
    // 少了这个保证就得按 bucket 建索引，堆叠图也会因缺桶而错位。
    const rows = buckets.map((point, index) => {
      const row: Record<string, number | string> = {
        bucket: point.bucket,
        label: formatBucket(point.bucket, granularity),
      }
      series.forEach((item, seriesIndex) => {
        row[safeKey(seriesIndex)] = item.data[index]?.count ?? 0
      })
      return row
    })

    const nextConfig: ChartConfig = {}
    series.forEach((item, index) => {
      nextConfig[safeKey(index)] = {
        label: naming === "raw" ? item.key : seriesLabel(naming, item.key),
        color: seriesFill(naming === "raw" ? "endpoint" : naming, item.key, index),
      }
    })

    return { data: rows, config: nextConfig, keys: series.map((_, index) => safeKey(index)) }
  }, [series, granularity, naming])

  return (
    <ChartContainer config={config} className={className}>
      <AreaChart data={data} margin={{ left: 4, right: 12, top: 8, bottom: 4 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} minTickGap={32} />
        <YAxis tickLine={false} axisLine={false} width={36} allowDecimals={false} />
        <ChartTooltip content={<ChartTooltipContent labelKey="label" />} />
        {keys.map((key) => (
          <Area
            key={key}
            dataKey={key}
            type="monotone"
            stackId="stack"
            stroke={`var(--color-${key})`}
            fill={`var(--color-${key})`}
            fillOpacity={0.35}
            strokeWidth={1.5}
            isAnimationActive={false}
          />
        ))}
        <ChartLegend content={<ChartLegendContent />} />
      </AreaChart>
    </ChartContainer>
  )
}
