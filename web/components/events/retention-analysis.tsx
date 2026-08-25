"use client"

import * as React from "react"
import { Loader2 } from "lucide-react"

import { Button } from "@workspace/ui/components/button"

import { AdminCard } from "@/components/admin/admin-card"
import { getErrorMessage } from "@/lib/error-utils"
import { formatNumber } from "@/components/analytics/chart-utils"
import { heatColor } from "@/components/analytics/heat-scale"
import { getRetention, type EventRange, type RetentionResponse } from "@/lib/events-api"

import { EventPicker, fieldClass, useEventDefinitions } from "./event-controls"
import { EmptyHint, EventsShell, ErrorBanner, NoEventsHint } from "./events-shell"

/**
 * 留存分析。
 *
 * 队列按「首次命中起始事件」的当地周期划分。**尚未走完的周期显示为空格而不是
 * 0%**——把还没发生的时间画成 0% 留存是不诚实的，会让人以为产品在那天掉光了用户。
 */
export function RetentionAnalysis() {
  return (
    <EventsShell
      title="留存分析"
      description="按首次触发起始事件的日期把用户分组，看其后各周期还有多少人回来。空格表示该周期尚未走完，不是 0%。"
      defaultRangeIndex={2}
    >
      {({ projectKey, range, reloadToken }) => (
        <RetentionBody projectKey={projectKey} range={range} reloadToken={reloadToken} />
      )}
    </EventsShell>
  )
}

function RetentionBody({
  projectKey,
  range,
  reloadToken,
}: {
  projectKey: string
  range: EventRange
  reloadToken: number
}) {
  const { definitions, loading: definitionsLoading } = useEventDefinitions(
    projectKey,
    range,
    reloadToken,
  )
  const [startEvent, setStartEvent] = React.useState("")
  const [returnEvent, setReturnEvent] = React.useState("")
  const [period, setPeriod] = React.useState<"day" | "week">("day")
  const [periods, setPeriods] = React.useState(14)
  const [result, setResult] = React.useState<RetentionResponse | null>(null)
  const [running, setRunning] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!startEvent && definitions.length > 0) {
      setStartEvent(definitions[0]!.name)
    }
  }, [definitions, startEvent])

  const run = async () => {
    if (!startEvent) {
      setError("请先选择起始事件。")
      return
    }
    setRunning(true)
    setError(null)
    try {
      setResult(
        await getRetention(projectKey, {
          ...range,
          start_event: startEvent,
          ...(returnEvent ? { return_event: returnEvent } : {}),
          period,
          periods,
        }),
      )
    } catch (cause: unknown) {
      setError(getErrorMessage(cause, "留存计算失败"))
    } finally {
      setRunning(false)
    }
  }

  if (!definitionsLoading && definitions.length === 0) {
    return <NoEventsHint />
  }

  return (
    <div className="space-y-4">
      {error ? <ErrorBanner message={error} /> : null}

      <AdminCard className="flex flex-wrap items-end gap-4">
        <label className="space-y-1">
          <span className="block text-xs text-slate-500 dark:text-slate-400">起始事件</span>
          <EventPicker
            definitions={definitions}
            value={startEvent}
            onChange={setStartEvent}
            aria-label="起始事件"
          />
        </label>

        <label className="space-y-1">
          <span className="block text-xs text-slate-500 dark:text-slate-400">回访事件</span>
          <EventPicker
            definitions={definitions}
            value={returnEvent}
            onChange={setReturnEvent}
            allowEmpty
            emptyLabel="任意事件"
            aria-label="回访事件"
          />
        </label>

        <label className="space-y-1">
          <span className="block text-xs text-slate-500 dark:text-slate-400">周期</span>
          <select
            value={period}
            onChange={(event) => setPeriod(event.target.value as "day" | "week")}
            className={fieldClass}
          >
            <option value="day">按天</option>
            <option value="week">按周</option>
          </select>
        </label>

        <label className="space-y-1">
          <span className="block text-xs text-slate-500 dark:text-slate-400">周期数</span>
          <input
            type="number"
            min={2}
            max={30}
            value={periods}
            onChange={(event) => setPeriods(Number(event.target.value))}
            className={`${fieldClass} w-20`}
          />
        </label>

        <Button onClick={() => void run()} disabled={running}>
          {running ? <Loader2 className="size-4 animate-spin" /> : null}
          计算留存
        </Button>
      </AdminCard>

      {result ? (
        <RetentionMatrix result={result} />
      ) : (
        <EmptyHint>选好事件后点「计算留存」。</EmptyHint>
      )}
    </div>
  )
}

function RetentionMatrix({ result }: { result: RetentionResponse }) {
  const unit = result.period === "week" ? "周" : "天"
  // 只画有人进入的队列；空队列行铺满屏幕会把有数据的那几行挤到看不见。
  const cohorts = result.cohorts.filter((cohort) => cohort.size > 0)

  if (cohorts.length === 0) {
    return <EmptyHint>区间内没有用户触发过起始事件。</EmptyHint>
  }

  return (
    <AdminCard className="space-y-3">
      <h2 className="text-sm font-medium">留存矩阵</h2>
      <div className="-mx-1 overflow-x-auto px-1">
        <table className="w-full min-w-[40rem] border-separate border-spacing-0.5 text-xs">
          <thead>
            <tr className="text-slate-500 dark:text-slate-400">
              <th className="px-2 py-1 text-left font-medium">队列</th>
              <th className="px-2 py-1 text-right font-medium">人数</th>
              {Array.from({ length: result.periods }, (_, index) => (
                <th key={index} className="px-2 py-1 text-center font-medium">
                  第 {index} {unit}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {cohorts.map((cohort) => (
              <tr key={cohort.cohort}>
                <td className="px-2 py-1 whitespace-nowrap text-slate-600 dark:text-slate-300">
                  {formatCohort(cohort.cohort, result.period)}
                </td>
                <td className="px-2 py-1 text-right font-mono tabular-nums">
                  {formatNumber(cohort.size)}
                </td>
                {cohort.cells.map((cell, index) =>
                  cell === null ? (
                    // 尚未走完的周期：空格，不是 0%。
                    <td
                      key={index}
                      className="px-2 py-1 text-center text-slate-600"
                      title="该周期尚未走完"
                    >
                      ·
                    </td>
                  ) : (
                    <td
                      key={index}
                      className="rounded px-2 py-1 text-center font-mono tabular-nums"
                      style={{ background: heatColor(Math.round(cell.rate * 100), 100) }}
                      title={`${formatNumber(cell.users)} 人`}
                    >
                      {(cell.rate * 100).toFixed(0)}%
                    </td>
                  ),
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AdminCard>
  )
}

function formatCohort(seconds: number, period: "day" | "week"): string {
  const date = new Date(seconds * 1000)
  const label = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`
  return period === "week" ? `${label} 起` : label
}
