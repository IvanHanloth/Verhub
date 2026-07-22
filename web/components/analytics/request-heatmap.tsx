"use client"

import * as React from "react"

import { HEAT_STEP_VARS, heatColor } from "./heat-scale"

type Cell = { weekday: number; hour: number; count: number }

const WEEKDAY_LABELS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"]

function formatCount(value: number): string {
  return value.toLocaleString("zh-CN")
}

/**
 * Weekday × hour request density.
 *
 * Cells arrive already folded in each request's *source* timezone (the backend
 * shifts by the caller's country), so "18:00" means six in the evening where
 * the user is — which is the only reading that answers "when are my users
 * active in their own local time".
 */
export function RequestHeatmap({ cells, loading }: { cells: Cell[]; loading: boolean }) {
  const [hovered, setHovered] = React.useState<Cell | null>(null)

  const max = cells.reduce((peak, cell) => Math.max(peak, cell.count), 0)
  const byWeekday = React.useMemo(() => {
    const grid: Cell[][] = Array.from({ length: 7 }, () => [])
    for (const cell of cells) {
      grid[cell.weekday]?.push(cell)
    }
    return grid.map((row) => row.sort((a, b) => a.hour - b.hour))
  }, [cells])

  if (cells.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-slate-500 dark:text-slate-400">
        {loading ? "加载中…" : "所选范围内暂无请求记录。"}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        {/* relative 不能去掉，理由同活跃度日历：static 时格子的溢出会越过
            overflow-x-auto 撑宽整个文档。 */}
        <div className="relative min-w-[560px] space-y-1">
          <div className="flex gap-1 pl-10">
            {Array.from({ length: 24 }, (_, hour) => (
              <div
                key={hour}
                className="w-full min-w-3 text-center text-[10px] text-slate-400 tabular-nums"
              >
                {hour % 3 === 0 ? hour : ""}
              </div>
            ))}
          </div>

          {byWeekday.map((row, weekday) => (
            <div key={weekday} className="flex items-center gap-1">
              <div className="w-10 shrink-0 text-[11px] text-slate-500 dark:text-slate-400">
                {WEEKDAY_LABELS[weekday]}
              </div>
              {row.map((cell) => (
                <button
                  key={cell.hour}
                  type="button"
                  // 2px surface gap between fills comes from the flex gap; the
                  // ring is the hover affordance, not a permanent border.
                  className="h-6 w-full min-w-3 rounded-[3px] ring-slate-900/40 transition hover:ring-2 dark:ring-white/50"
                  style={{ backgroundColor: heatColor(cell.count, max) }}
                  title={`${WEEKDAY_LABELS[weekday]} ${String(cell.hour).padStart(2, "0")}:00 · ${formatCount(cell.count)} 次`}
                  onMouseEnter={() => setHovered(cell)}
                  onFocus={() => setHovered(cell)}
                  onMouseLeave={() => setHovered(null)}
                  onBlur={() => setHovered(null)}
                >
                  <span className="sr-only">
                    {`${WEEKDAY_LABELS[weekday]} ${cell.hour} 时 ${cell.count} 次`}
                  </span>
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500 dark:text-slate-400">
        <span className="tabular-nums">
          {hovered
            ? `${WEEKDAY_LABELS[hovered.weekday]} ${String(hovered.hour).padStart(2, "0")}:00 · ${formatCount(hovered.count)} 次`
            : `峰值 ${formatCount(max)} 次 · 按来源当地时区`}
        </span>
        <span className="flex items-center gap-1.5">
          少
          {HEAT_STEP_VARS.map((step) => (
            <span
              key={step}
              className="size-3 rounded-[3px]"
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
