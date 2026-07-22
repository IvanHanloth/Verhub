"use client"

import * as React from "react"
import { useTheme } from "next-themes"
import * as echarts from "echarts/core"
import { MapChart } from "echarts/charts"
import { TooltipComponent, VisualMapComponent } from "echarts/components"
import { CanvasRenderer } from "echarts/renderers"

import type { GeoMapDatum, GeoMapSource } from "./geo-map-sources"

// 按需注册用到的模块，避免打进 echarts 全量包。
echarts.use([MapChart, TooltipComponent, VisualMapComponent, CanvasRenderer])

// 模块级 guard：每张底图只需注册一次，多个图表实例共用。
const registrations = new Map<string, Promise<void>>()

/**
 * 拉取并注册底图 GeoJSON。
 * 失败时抛出，交由组件展示错误态——地图拿不到边界就没有渲染意义。
 */
function ensureMap(source: GeoMapSource): Promise<void> {
  const pending = registrations.get(source.name)
  if (pending) {
    return pending
  }

  const registration = fetch(source.url)
    .then((res) => {
      if (!res.ok) throw new Error(`地图数据加载失败：${res.status}`)
      return res.json()
    })
    .then((geo) => {
      echarts.registerMap(source.name, geo)
    })
    .catch((error) => {
      // 注册失败要清掉缓存，否则后续实例永远拿到这个失败的 Promise。
      registrations.delete(source.name)
      throw error
    })

  registrations.set(source.name, registration)
  return registration
}

/** 读取一个 CSS 变量的计算值，供 canvas 着色跟随明暗主题。 */
function readCssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

/** 从 --heat-* 变量取一条渐变色阶，deps 传 resolvedTheme 以在切主题时重取。 */
function readHeatColors(): string[] {
  return [1, 2, 3, 4].map((step) => readCssVar(`--heat-${step}`))
}

/**
 * 区域请求量热力地图。按区域请求数着色，hover 显示区域名、请求数与占比。
 *
 * 数据只含有流量的区域；无数据的区域自动落到 visualMap 的最小档（近乎无色），
 * 因此无需补零。canvas 渲染，明暗主题通过读取 CSS 变量色值切换。
 */
export function GeoHeatMap({
  source,
  data,
  loading,
  label,
  emptyText,
  ariaLabel,
}: {
  source: GeoMapSource
  data: GeoMapDatum[]
  loading: boolean
  /** 区域 key 到展示名，世界图用它把 ISO 码翻成中文国名。 */
  label: (key: string) => string
  emptyText: string
  ariaLabel: string
}) {
  const { resolvedTheme } = useTheme()
  const containerRef = React.useRef<HTMLDivElement | null>(null)
  const chartRef = React.useRef<echarts.ECharts | null>(null)
  const [readyMap, setReadyMap] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  const total = React.useMemo(() => data.reduce((sum, item) => sum + item.count, 0), [data])
  const max = React.useMemo(
    () => data.reduce((peak, item) => Math.max(peak, item.count), 0),
    [data],
  )

  // 注册底图（每张一次），完成后允许初始化图表。切换底图时先退回未就绪，
  // 避免用旧底图渲染新数据。
  React.useEffect(() => {
    let alive = true
    setReadyMap(null)
    setError(null)
    ensureMap(source).then(
      () => alive && setReadyMap(source.name),
      (err: unknown) => alive && setError(err instanceof Error ? err.message : String(err)),
    )
    return () => {
      alive = false
    }
  }, [source])

  // 初始化 / 更新图表。依赖数据、主题、就绪态；容器尺寸变化用 ResizeObserver 兜住。
  React.useEffect(() => {
    if (readyMap !== source.name || !containerRef.current) return

    const chart = chartRef.current ?? echarts.init(containerRef.current)
    chartRef.current = chart

    const colors = readHeatColors()
    const empty = readCssVar("--heat-0")
    const border = resolvedTheme === "dark" ? "#334155" : "#cbd5e1"

    chart.setOption(
      {
        tooltip: {
          trigger: "item",
          formatter: (params: { name: string; value: number }) => {
            const value = Number.isFinite(params.value) ? params.value : 0
            const pct = total > 0 ? ((value / total) * 100).toFixed(1) : "0.0"
            return `${label(params.name)}<br/>${value.toLocaleString("zh-CN")} 次 · ${pct}%`
          },
        },
        visualMap: {
          min: 0,
          max: max || 1,
          left: "left",
          bottom: 8,
          text: ["多", "少"],
          calculable: true,
          inRange: { color: [empty, ...colors] },
          textStyle: { color: resolvedTheme === "dark" ? "#94a3b8" : "#64748b" },
        },
        series: [
          {
            type: "map",
            map: source.name,
            nameProperty: source.key,
            boundingCoords: source.boundingCoords,
            roam: false,
            emphasis: { label: { show: false } },
            itemStyle: { borderColor: border, borderWidth: 0.5 },
            data: data.map((item) => ({ name: item.key, value: item.count })),
          },
        ],
      },
      // 换底图时序列的 map/数据整体替换，不合并旧配置，否则残留上一张图的区域。
      { replaceMerge: ["series"] },
    )

    return undefined
  }, [readyMap, source, data, total, max, label, resolvedTheme])

  // 容器尺寸变化时重排。
  React.useEffect(() => {
    if (!containerRef.current) return
    const observer = new ResizeObserver(() => chartRef.current?.resize())
    observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [])

  // 卸载时释放。
  React.useEffect(() => {
    return () => {
      chartRef.current?.dispose()
      chartRef.current = null
    }
  }, [])

  if (error) {
    return (
      <div className="flex h-[320px] items-center justify-center text-sm text-slate-500 dark:text-slate-400">
        {error}
      </div>
    )
  }

  if (!loading && data.length === 0) {
    return (
      <div className="flex h-[320px] items-center justify-center text-sm text-slate-500 dark:text-slate-400">
        {emptyText}
      </div>
    )
  }

  return <div ref={containerRef} className="h-[320px] w-full" aria-label={ariaLabel} />
}
