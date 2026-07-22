"use client"

import * as React from "react"
import { BarChart3, ChartPie, Loader2, Maximize2, Minimize2 } from "lucide-react"

import { cn } from "@workspace/ui/lib/utils"

import { AdminCard } from "@/components/admin/admin-card"

/**
 * 统计大屏所有卡片的统一外壳。
 *
 * 抽出来的理由不只是省重复：bento 布局里卡片宽高各不相同，标题行、图标位置和
 * 空状态高度必须由一处决定，否则并排的两张卡片标题不在同一条基线上，格子感立刻
 * 就散了。
 */

type ChartCardProps = {
  title: string
  subtitle?: React.ReactNode
  icon?: React.ComponentType<{ className?: string }>
  /** 右上角操作区，通常是视图切换。图标会排在它后面。 */
  actions?: React.ReactNode
  /** 栅格跨度等布局类名由调用方给，卡片自身不预设宽度。 */
  className?: string
  /** 正文区最小高度，让同一行的卡片高度对齐。 */
  bodyClassName?: string
  children: React.ReactNode
}

export function ChartCard({
  title,
  subtitle,
  icon: Icon,
  actions,
  className,
  bodyClassName,
  children,
}: ChartCardProps) {
  const [fullscreen, setFullscreen] = React.useState(false)

  // 全屏时接管 Esc 退出并锁滚动，退出时精确还原原值（可能本就非空）。
  React.useEffect(() => {
    if (!fullscreen) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFullscreen(false)
    }
    document.addEventListener("keydown", onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.removeEventListener("keydown", onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [fullscreen])

  const card = (
    <AdminCard
      className={cn(
        "flex min-w-0 flex-col gap-4",
        // 全屏时卡片自身撑满遮罩，正文 flex-1 才能把图表拉高；标了 data-chart-fill 的
        // 图表容器随之填满（!h-full 压过其固有高度/宽高比）。
        fullscreen ? "h-full w-full" : className,
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <div className="min-w-0">
          <h2 className="text-base font-semibold sm:text-lg">{title}</h2>
          {subtitle ? (
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{subtitle}</p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {actions}
          <button
            type="button"
            onClick={() => setFullscreen((value) => !value)}
            title={fullscreen ? "退出全屏" : "全屏"}
            aria-label={fullscreen ? "退出全屏" : "全屏"}
            aria-pressed={fullscreen}
            className="rounded-md p-1 text-slate-400 transition hover:bg-slate-900/5 hover:text-slate-600 dark:hover:bg-white/10 dark:hover:text-slate-200"
          >
            {fullscreen ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
          </button>
          {Icon ? <Icon className="size-4 text-slate-400" /> : null}
        </div>
      </div>

      <div
        className={cn(
          "min-w-0 flex-1",
          // 全屏正文只允许纵向滚动：图表都按宽度自适应、不需要横向滚动，放开 overflow-x 反而会
          // 因 canvas 亚像素/滚动条占位触发「纵向条挤窄内容→横向条」的连锁，冒出多余横向滚动条。
          // 真正需要横滚的地方（如分布表）自带内层 overflow-x-auto，不受这里影响。
          fullscreen &&
            "flex min-h-0 flex-col overflow-x-hidden overflow-y-auto [&>[data-chart-fill]]:h-full! [&>[data-chart-fill]]:min-h-0 [&>[data-chart-fill]]:flex-1",
          bodyClassName,
        )}
      >
        {children}
      </div>
    </AdminCard>
  )

  if (!fullscreen) return card

  return (
    <div className="bg-background/95 fixed inset-0 z-50 flex p-4 backdrop-blur-sm sm:p-6">
      {card}
    </div>
  )
}

/**
 * 加载与空状态。
 *
 * 加载态画的是骨架条而不是一行「加载中…」：卡片高度在两个状态之间不跳变，
 * 整屏十几张卡同时刷新时才不会像抽搐一样重排。
 */
export function ChartPlaceholder({
  loading,
  emptyText = "所选范围内暂无请求记录。",
  className,
}: {
  loading: boolean
  emptyText?: string
  className?: string
}) {
  if (loading) {
    return (
      <div
        className={cn("flex h-40 w-full flex-col justify-end gap-2", className)}
        role="status"
        aria-label="加载中"
      >
        {[0.45, 0.7, 0.35, 0.85, 0.55].map((height, index) => (
          <div
            key={index}
            className="animate-pulse rounded bg-slate-900/8 dark:bg-white/10"
            style={{ height: 12, width: `${height * 100}%` }}
          />
        ))}
      </div>
    )
  }

  return (
    <div
      className={cn(
        "flex h-40 items-center justify-center text-center text-sm text-slate-500 dark:text-slate-400",
        className,
      )}
    >
      {emptyText}
    </div>
  )
}

/** 内联的小号加载指示，用于卡片头部副标题旁。 */
export function InlineSpinner() {
  return <Loader2 className="size-3.5 animate-spin text-slate-400" />
}

/**
 * 卡片右上角的分段切换。
 *
 * 有图标就只画图标（标题挂在 title/aria-label 上），否则画文字；两种形态共用一套
 * 胶囊样式，卡片头部才不会因为切换器的种类不同而高低不齐。
 */
export function SegmentedToggle<T extends string>({
  value,
  onChange,
  label,
  options,
}: {
  value: T
  onChange: (next: T) => void
  label: string
  options: Array<{ value: T; title: string; icon?: React.ComponentType<{ className?: string }> }>
}) {
  return (
    <div
      role="group"
      aria-label={`${label}视图切换`}
      className="flex rounded-full border border-slate-900/15 p-0.5 dark:border-white/20"
    >
      {options.map((option) => {
        const Icon = option.icon
        const active = value === option.value
        return (
          <button
            key={option.value}
            type="button"
            title={option.title}
            aria-label={option.title}
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={cn(
              "rounded-full transition",
              Icon ? "px-2.5 py-1" : "px-2.5 py-0.5 text-xs",
              active
                ? "bg-sky-500/20 text-sky-900 dark:text-sky-100"
                : "text-slate-500 hover:bg-slate-900/5 dark:text-slate-400 dark:hover:bg-white/10",
            )}
          >
            {Icon ? <Icon className="size-3.5" /> : option.title}
          </button>
        )
      })}
    </div>
  )
}

export type ChartView = "bar" | "donut"

/**
 * Bar/donut switch for a single card.
 *
 * Bar is the default because it ranks reliably at any category count; the donut
 * is there for the "what share of the fleet" reading, which a bar chart makes
 * you compute yourself.
 */
export function ChartViewToggle({
  value,
  onChange,
  label,
}: {
  value: ChartView
  onChange: (next: ChartView) => void
  label: string
}) {
  return (
    <SegmentedToggle
      value={value}
      onChange={onChange}
      label={label}
      options={[
        { value: "bar", title: "柱状图", icon: BarChart3 },
        { value: "donut", title: "环形图", icon: ChartPie },
      ]}
    />
  )
}
