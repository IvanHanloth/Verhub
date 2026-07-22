"use client"

import * as React from "react"
import { BarChart3, ChartPie, Loader2 } from "lucide-react"

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
  return (
    <AdminCard className={cn("flex min-w-0 flex-col gap-4", className)}>
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <div className="min-w-0">
          <h2 className="text-base font-semibold sm:text-lg">{title}</h2>
          {subtitle ? (
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{subtitle}</p>
          ) : null}
        </div>
        {actions || Icon ? (
          <div className="flex shrink-0 items-center gap-2">
            {actions}
            {Icon ? <Icon className="size-4 text-slate-400" /> : null}
          </div>
        ) : null}
      </div>

      <div className={cn("min-w-0 flex-1", bodyClassName)}>{children}</div>
    </AdminCard>
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
  const options: Array<{ view: ChartView; icon: typeof BarChart3; title: string }> = [
    { view: "bar", icon: BarChart3, title: "柱状图" },
    { view: "donut", icon: ChartPie, title: "环形图" },
  ]

  return (
    <div
      role="group"
      aria-label={`${label}视图切换`}
      className="flex rounded-full border border-slate-900/15 p-0.5 dark:border-white/20"
    >
      {options.map((option) => {
        const Icon = option.icon
        const active = value === option.view
        return (
          <button
            key={option.view}
            type="button"
            title={option.title}
            aria-label={option.title}
            aria-pressed={active}
            onClick={() => onChange(option.view)}
            className={`rounded-full px-2.5 py-1 transition ${
              active
                ? "bg-sky-500/20 text-sky-900 dark:text-sky-100"
                : "text-slate-500 hover:bg-slate-900/5 dark:text-slate-400 dark:hover:bg-white/10"
            }`}
          >
            <Icon className="size-3.5" />
          </button>
        )
      })}
    </div>
  )
}
