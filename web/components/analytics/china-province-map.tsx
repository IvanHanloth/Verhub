"use client"

import * as React from "react"
import { useTheme } from "next-themes"
import * as echarts from "echarts/core"
import { MapChart } from "echarts/charts"
import { TooltipComponent, VisualMapComponent } from "echarts/components"
import { CanvasRenderer } from "echarts/renderers"

// 按需注册用到的模块，避免打进 echarts 全量包。
echarts.use([MapChart, TooltipComponent, VisualMapComponent, CanvasRenderer])

/** 中国省级 GeoJSON 已注册到 echarts 的地图名。 */
const CHINA_MAP = "china"

type Province = { code: string; name: string; count: number }

// 模块级 guard：GeoJSON 只需注册一次，多个图表实例共用。null=未开始，Promise=进行中/完成。
let mapRegistration: Promise<void> | null = null

/**
 * 拉取并注册中国省级地图（含九段线/南海诸岛的官方边界，见 public/geo）。
 * 失败时抛出，交由组件展示错误态——地图拿不到边界就没有渲染意义。
 */
function ensureChinaMap(): Promise<void> {
  if (!mapRegistration) {
    mapRegistration = fetch("/geo/china-provinces.json")
      .then((res) => {
        if (!res.ok) throw new Error(`地图数据加载失败：${res.status}`)
        return res.json()
      })
      .then((geo) => {
        echarts.registerMap(CHINA_MAP, geo)
      })
      .catch((error) => {
        // 注册失败要清掉缓存，否则后续实例永远拿到这个失败的 Promise。
        mapRegistration = null
        throw error
      })
  }
  return mapRegistration
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
 * 中国省级请求量热力地图。按省份请求数着色，hover 显示省名、请求数与占比。
 *
 * 数据只含有流量的省份（后端 `by_province`）；地图 feature 按省名匹配，无数据的
 * 省份自动落到 visualMap 的最小档（近乎无色），因此无需补零。canvas 渲染，明暗
 * 主题通过读取 CSS 变量色值切换。
 */
export function ChinaProvinceMap({ data, loading }: { data: Province[]; loading: boolean }) {
  const { resolvedTheme } = useTheme()
  const containerRef = React.useRef<HTMLDivElement | null>(null)
  const chartRef = React.useRef<echarts.ECharts | null>(null)
  const [mapReady, setMapReady] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const total = React.useMemo(() => data.reduce((sum, item) => sum + item.count, 0), [data])
  const max = React.useMemo(
    () => data.reduce((peak, item) => Math.max(peak, item.count), 0),
    [data],
  )

  // 注册地图（一次），完成后允许初始化图表。
  React.useEffect(() => {
    let alive = true
    ensureChinaMap().then(
      () => alive && setMapReady(true),
      (err: unknown) => alive && setError(err instanceof Error ? err.message : String(err)),
    )
    return () => {
      alive = false
    }
  }, [])

  // 初始化 / 更新图表。依赖数据、主题、就绪态；容器尺寸变化用 ResizeObserver 兜住。
  React.useEffect(() => {
    if (!mapReady || !containerRef.current) return

    const chart = chartRef.current ?? echarts.init(containerRef.current)
    chartRef.current = chart

    const colors = readHeatColors()
    const empty = readCssVar("--heat-0")
    const border = resolvedTheme === "dark" ? "#334155" : "#cbd5e1"

    chart.setOption({
      tooltip: {
        trigger: "item",
        formatter: (params: { name: string; value: number }) => {
          const value = Number.isFinite(params.value) ? params.value : 0
          const pct = total > 0 ? ((value / total) * 100).toFixed(1) : "0.0"
          return `${params.name}<br/>${value.toLocaleString("zh-CN")} 次 · ${pct}%`
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
          map: CHINA_MAP,
          // GeoJSON feature 的 properties.name，与后端省名表一致。
          nameProperty: "name",
          roam: false,
          emphasis: { label: { show: false } },
          itemStyle: { borderColor: border, borderWidth: 0.5 },
          data: data.map((item) => ({ name: item.name, value: item.count })),
        },
      ],
    })

    return undefined
  }, [mapReady, data, total, max, resolvedTheme])

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
        所选范围内暂无国内来源。
      </div>
    )
  }

  return <div ref={containerRef} className="h-[320px] w-full" aria-label="中国省级请求量热力地图" />
}
