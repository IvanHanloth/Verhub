"use client"

import * as React from "react"

import { HEAT_STEP_VARS, heatColor } from "./heat-scale"

const WEEKDAY_LABELS = ["日", "一", "二", "三", "四", "五", "六"]
const MONTH_LABELS = [
  "1月",
  "2月",
  "3月",
  "4月",
  "5月",
  "6月",
  "7月",
  "8月",
  "9月",
  "10月",
  "11月",
  "12月",
]

type DayPoint = { bucket: number; count: number }
type CalendarDay = DayPoint & { date: Date }

function formatCount(value: number): string {
  return value.toLocaleString("zh-CN")
}

/**
 * Local-time getters throughout this file, not the UTC ones.
 *
 * The backend buckets daily counts at the viewer's midnight (it is sent the
 * browser's UTC offset), so each `bucket` is already the instant a local day
 * began — reading it back in UTC would shift the whole calendar by a day for
 * anyone far enough from Greenwich.
 */
function formatDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`
}

/**
 * GitHub-style year calendar, one column per week.
 *
 * The series is padded to whole weeks so every column has seven rows — a ragged
 * first or last column reads as missing data rather than as the year's edge.
 */
function toWeeks(points: DayPoint[]): (CalendarDay | null)[][] {
  if (points.length === 0) {
    return []
  }

  const days: CalendarDay[] = points.map((point) => ({
    ...point,
    date: new Date(point.bucket * 1000),
  }))

  const weeks: (CalendarDay | null)[][] = []
  let current: (CalendarDay | null)[] = Array.from({ length: days[0]!.date.getDay() }, () => null)

  for (const day of days) {
    current.push(day)
    if (current.length === 7) {
      weeks.push(current)
      current = []
    }
  }

  if (current.length > 0) {
    while (current.length < 7) {
      current.push(null)
    }
    weeks.push(current)
  }

  return weeks
}

export function ActivityCalendar({ points, loading }: { points: DayPoint[]; loading: boolean }) {
  const [hovered, setHovered] = React.useState<CalendarDay | null>(null)

  const weeks = React.useMemo(() => toWeeks(points), [points])
  const max = points.reduce((peak, point) => Math.max(peak, point.count), 0)
  const total = points.reduce((sum, point) => sum + point.count, 0)
  const activeDays = points.filter((point) => point.count > 0).length

  if (points.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-slate-500 dark:text-slate-400">
        {loading ? "加载中…" : "暂无历史请求记录。"}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto pb-1">
        {/* relative 不能去掉：这一层若是 static，周格的溢出会穿过上面的
            overflow-x-auto 传给祖先，把整个文档撑出横向滚动条——而背景是 fixed 的，
            滚出去就是一片空白。验证方式：看外层 article.admin-card 的
            scrollWidth 是否大于 clientWidth。 */}
        <div className="relative flex gap-1">
          <div className="flex w-6 shrink-0 flex-col gap-1 pt-4">
            {WEEKDAY_LABELS.map((label, index) => (
              <div
                key={label}
                className="h-3 text-[10px] leading-3 text-slate-400 dark:text-slate-500"
              >
                {index % 2 === 1 ? label : ""}
              </div>
            ))}
          </div>

          <div className="flex gap-1">
            {weeks.map((week, weekIndex) => {
              const firstReal = week.find((day): day is CalendarDay => day !== null)
              const previous = weeks[weekIndex - 1]?.find((day): day is CalendarDay => day !== null)
              // Label a column only where the month actually turns over.
              const showMonth =
                firstReal !== undefined &&
                (previous === undefined || previous.date.getMonth() !== firstReal.date.getMonth())

              return (
                <div key={weekIndex} className="flex flex-col gap-1">
                  <div className="h-3 w-3 text-[10px] leading-3 whitespace-nowrap text-slate-400 dark:text-slate-500">
                    {showMonth ? MONTH_LABELS[firstReal.date.getMonth()] : ""}
                  </div>
                  {week.map((day, dayIndex) =>
                    day ? (
                      <button
                        key={day.bucket}
                        type="button"
                        className="size-3 rounded-[2px] ring-slate-900/40 transition hover:ring-2 dark:ring-white/50"
                        style={{ backgroundColor: heatColor(day.count, max) }}
                        title={`${formatDate(day.date)} · ${formatCount(day.count)} 次`}
                        onMouseEnter={() => setHovered(day)}
                        onFocus={() => setHovered(day)}
                        onMouseLeave={() => setHovered(null)}
                        onBlur={() => setHovered(null)}
                      >
                        <span className="sr-only">{`${formatDate(day.date)} ${day.count} 次`}</span>
                      </button>
                    ) : (
                      <div key={`pad-${dayIndex}`} className="size-3" aria-hidden />
                    ),
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500 dark:text-slate-400">
        <span className="tabular-nums">
          {hovered
            ? `${formatDate(hovered.date)} · ${formatCount(hovered.count)} 次`
            : `近一年共 ${formatCount(total)} 次请求 · ${activeDays} 天有流量 · 单日峰值 ${formatCount(max)}`}
        </span>
        <span className="flex items-center gap-1.5">
          少
          {HEAT_STEP_VARS.map((step) => (
            <span
              key={step}
              className="size-3 rounded-[2px]"
              style={{ backgroundColor: step }}
              aria-hidden
            />
          ))}
          多
        </span>
      </div>
    </div>
  )
}
