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

// zrender（echarts 的 canvas 渲染层）只认 hex/rgb/hsl，遇到 oklch / lab 会解析失败并回退成
// 黑色——热力地图整块发黑的根因。这里在 JS 里把它们直接算成 sRGB，不依赖浏览器代解析。
// 两种形态都要认：--heat-* 源码写成 oklch，dev（turbopack 不降级）读到的就是 oklch；生产构建
// 里 Lightning CSS 按 browserslist 把 oklch 降级成 lab()，getComputedStyle 读到的是 lab()。
// 少认一种，对应环境就整块发黑。

/** linear sRGB 三通道 → gamma 编码并夹到 0–255 的 rgb() 字符串。 */
function encodeSrgb(linear: number[]): string {
  const ch = linear.map((x) => {
    const c = x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055
    return Math.max(0, Math.min(255, Math.round(c * 255)))
  })
  return `rgb(${ch[0]}, ${ch[1]}, ${ch[2]})`
}

/** oklab(L∈0–1, a, b) → linear sRGB 三通道（Ottosson 公式，中间量为已取立方的 LMS 锥响应）。 */
function oklabToLinear(L: number, a: number, b: number): number[] {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ]
}

/** CIE Lab(D50, L∈0–100, a, b) → linear sRGB 三通道，矩阵已含 D50→D65 Bradford 适配。 */
function labToLinear(L: number, a: number, b: number): number[] {
  const fy = (L + 16) / 116
  const fx = fy + a / 500
  const fz = fy - b / 200
  const eps = 216 / 24389
  const kappa = 24389 / 27
  const xr = fx ** 3 > eps ? fx ** 3 : (116 * fx - 16) / kappa
  const yr = L > kappa * eps ? fy ** 3 : L / kappa
  const zr = fz ** 3 > eps ? fz ** 3 : (116 * fz - 16) / kappa
  // D50 白点缩放到 XYZ。
  const X = xr * 0.9642956764
  const Y = yr
  const Z = zr * 0.8251046025
  return [
    3.1341359569958707 * X - 1.6173863321612538 * Y - 0.4906619460083532 * Z,
    -0.978795502912089 * X + 1.916254789530814 * Y + 0.03344273116131949 * Z,
    0.07195537988411677 * X - 0.2289768548158685 * Y + 1.405386790200787 * Z,
  ]
}

function toRgb(cssColor: string): string {
  const value = cssColor.trim()

  // oklch(L C H)：源码/dev 形态。L 源码写成 0–1 小数，个别降级会落成百分比（88.5%），
  // 命中百分号就归一回 0–1，否则 L 会被当成 88.5 塞进公式、算出近黑。
  const okl = /^oklch\(\s*([-+]?[\d.]+)(%?)\s+([-+]?[\d.]+)\s+([-+]?[\d.]+)/i.exec(value)
  if (okl) {
    const L = parseFloat(okl[1]!) / (okl[2] ? 100 : 1)
    const C = parseFloat(okl[3]!)
    const hRad = (parseFloat(okl[4]!) * Math.PI) / 180
    return encodeSrgb(oklabToLinear(L, C * Math.cos(hRad), C * Math.sin(hRad)))
  }

  // lab(L a b)：生产构建里 Lightning CSS 把 oklch 降级成的形态。L 带不带 % 值域都是 0–100。
  const lab = /^lab\(\s*([-+]?[\d.]+)%?\s+([-+]?[\d.]+)\s+([-+]?[\d.]+)/i.exec(value)
  if (lab) {
    return encodeSrgb(labToLinear(parseFloat(lab[1]!), parseFloat(lab[2]!), parseFloat(lab[3]!)))
  }

  // hex / rgb / hsl 等 zrender 本就认识的形态原样返回。
  return value
}

/** 从 --heat-* 变量取一条渐变色阶并归一成 rgb，deps 传 resolvedTheme 以在切主题时重取。 */
function readHeatColors(): string[] {
  return [1, 2, 3, 4].map((step) => toRgb(readCssVar(`--heat-${step}`)))
}

// 流量地理分布极度长尾（境内一国常比其余各国之和还大），线性映射会把除头部外的所有
// 区域压到色带最低档、看不出差异。对计数取平方根压缩量级差，让中低流量区域也能着上色；
// tooltip 仍显示真实计数。
function toScale(count: number): number {
  return Math.sqrt(Math.max(count, 0))
}

/**
 * 区域请求量热力地图。按区域请求数着色，hover 显示区域名、请求数与占比。
 *
 * 数据只含有流量的区域；无数据区域由 series.itemStyle.areaColor 统一着空档色，
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
    const empty = toRgb(readCssVar("--heat-0"))
    const border = resolvedTheme === "dark" ? "#334155" : "#cbd5e1"

    chart.setOption(
      {
        tooltip: {
          trigger: "item",
          formatter: (params: { name: string; data?: { rawCount?: number } }) => {
            const value = params.data?.rawCount ?? 0
            const pct = total > 0 ? ((value / total) * 100).toFixed(1) : "0.0"
            return `${label(params.name)}<br/>${value.toLocaleString("zh-CN")} 次 · ${pct}%`
          },
        },
        visualMap: {
          min: 0,
          max: toScale(max) || 1,
          left: "left",
          bottom: 8,
          text: ["多", "少"],
          // 展示用色带，不做交互筛选；且刻度是 sqrt 压缩后的内部值，露出数字只会误导，
          // 故关掉可拖拽手柄，只留「多/少」。
          calculable: false,
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
            // left/right/top/bottom 铺满整个容器，再由 preserveAspect 做等比 contain 适配：
            // 填满约束边、另一维居中，既撑到最大又不变形。不能用 layoutSize:"100%"——它相对
            // 容器短边(此处即高度)取值，宽容器里会把地图困成一个高度大小的小方块，全球图和全屏下
            // 更明显。aspectScale 逐图给：省级图走 echarts 默认 0.75(按纬度压经度才不显宽)，
            // 世界图用 1 取标准等距投影。
            left: 0,
            right: 0,
            top: 0,
            bottom: 0,
            aspectScale: source.aspectScale ?? 0.75,
            preserveAspect: true,
            emphasis: { label: { show: false } },
            // areaColor 兜住「无数据」区域：它们不经 visualMap，不显式给色就会落到 echarts
            // 默认的浅灰，深色模式下格外扎眼。统一取空档色，与色带最低端一致。
            itemStyle: { areaColor: empty, borderColor: border, borderWidth: 0.5 },
            data: data.map((item) => ({
              name: item.key,
              value: toScale(item.count),
              rawCount: item.count,
            })),
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
      <div
        data-chart-fill
        className={`flex ${source.aspectClass} items-center justify-center text-sm text-slate-500 dark:text-slate-400`}
      >
        {error}
      </div>
    )
  }

  if (!loading && data.length === 0) {
    return (
      <div
        data-chart-fill
        className={`flex ${source.aspectClass} items-center justify-center text-sm text-slate-500 dark:text-slate-400`}
      >
        {emptyText}
      </div>
    )
  }

  return (
    <div ref={containerRef} data-chart-fill className={source.aspectClass} aria-label={ariaLabel} />
  )
}
