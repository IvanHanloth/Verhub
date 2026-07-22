"use client"

import * as React from "react"
import { Minus, TrendingDown, TrendingUp } from "lucide-react"
import { Area, AreaChart, ResponsiveContainer } from "recharts"

import { AdminCard } from "@/components/admin/admin-card"

/**
 * KPI 磁贴：数值 + 环比 + 迷你趋势线。
 *
 * 环比与 sparkline 一起给：单看「+38%」不知道是稳步涨还是被一根尖峰拉起来的，
 * 单看曲线又读不出幅度。两者都在一张卡里，才是一眼能下判断的信息。
 */

type StatTileProps = {
  label: string
  value: string
  hint: string
  /** 迷你趋势线的取值序列，通常是当前区间的时间桶。少于两点则不画。 */
  spark?: number[]
  /** 与上一个等长区间相比的变化率，如 0.38 表示 +38%。null 表示无从比较。 */
  delta?: number | null
  /** 该指标变大是好事吗。错误数这类指标要反过来上色。 */
  higherIsBetter?: boolean
  className?: string
}

export function StatTile({
  label,
  value,
  hint,
  spark,
  delta,
  higherIsBetter = true,
  className,
}: StatTileProps) {
  const points = React.useMemo(
    () => (spark ?? []).map((count, index) => ({ index, count })),
    [spark],
  )
  // 渐变的 id 必须全局唯一：两张磁贴若共用一个 id，后挂载的那份定义会赢，
  // 先渲染的那条线就被涂成别人的颜色。
  const gradientId = `spark-gradient-${React.useId().replace(/:/g, "")}`

  return (
    <AdminCard className={className}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs tracking-wide text-slate-500 uppercase dark:text-slate-400">
          {label}
        </p>
        <DeltaBadge delta={delta} higherIsBetter={higherIsBetter} />
      </div>

      <p className="mt-1 truncate font-mono text-2xl font-semibold tabular-nums" title={value}>
        {value}
      </p>
      <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{hint}</p>

      {points.length > 1 ? (
        // aria-hidden：数值与环比已经把这条线要说的都说了，读屏再念一遍坐标没有意义。
        <div className="mt-3 h-9 w-full" aria-hidden>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={points} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--series-1)" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="var(--series-1)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area
                dataKey="count"
                type="monotone"
                stroke="var(--series-1)"
                strokeWidth={1.5}
                fill={`url(#${gradientId})`}
                isAnimationActive={false}
                dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : null}
    </AdminCard>
  )
}

/**
 * 环比徽标。
 *
 * 上一区间为 0 时不显示百分比而显示「新增」：0 做分母的涨幅是无穷大，写成
 * "+∞%" 或随便截一个数都是在编造精度。
 */
function DeltaBadge({ delta, higherIsBetter }: { delta?: number | null; higherIsBetter: boolean }) {
  if (delta === undefined || delta === null) {
    return null
  }

  if (!Number.isFinite(delta)) {
    return (
      <span className="rounded-full bg-slate-900/5 px-1.5 py-0.5 text-[11px] text-slate-500 dark:bg-white/10 dark:text-slate-400">
        新增
      </span>
    )
  }

  const flat = Math.abs(delta) < 0.005
  const good = higherIsBetter ? delta > 0 : delta < 0
  const Icon = flat ? Minus : delta > 0 ? TrendingUp : TrendingDown

  const tone = flat
    ? "text-slate-500 dark:text-slate-400"
    : good
      ? "text-emerald-600 dark:text-emerald-400"
      : "text-rose-600 dark:text-rose-400"

  return (
    <span className={`inline-flex items-center gap-0.5 text-[11px] tabular-nums ${tone}`}>
      <Icon className="size-3" aria-hidden />
      {flat ? "持平" : `${delta > 0 ? "+" : ""}${(delta * 100).toFixed(0)}%`}
    </span>
  )
}

/**
 * 环比变化率。上一区间为 0 且本区间有量时返回 Infinity，交由徽标显示「新增」；
 * 两边都是 0 时返回 null，不显示徽标——「没有变化」和「没有数据」不是一回事。
 */
export function computeDelta(current: number, previous: number): number | null {
  if (previous === 0) {
    return current === 0 ? null : Number.POSITIVE_INFINITY
  }
  return (current - previous) / previous
}
