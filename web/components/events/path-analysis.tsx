"use client"

import * as React from "react"
import { Loader2 } from "lucide-react"

import { Button } from "@workspace/ui/components/button"

import { AdminCard } from "@/components/admin/admin-card"
import { getErrorMessage } from "@/lib/error-utils"
import { formatNumber, percent, seriesColor } from "@/components/analytics/chart-utils"
import { getPaths, type EventRange, type PathEdge, type PathsResponse } from "@/lib/events-api"

import { EventPicker, fieldClass, useEventDefinitions } from "./event-controls"
import { EmptyHint, EventsShell, ErrorBanner, NoEventsHint } from "./events-shell"

/**
 * 路径分析。
 *
 * 用分层的转移列表而不是桑基图：真实的事件空间是自由命名的，节点名长短不一，
 * 桑基图在窄屏上会挤成一团糊；分层列表能读出每一层的具体去向与占比，也照顾了
 * 无障碍——连线的颜色不承担信息。
 */
export function PathAnalysis() {
  return (
    <EventsShell
      title="路径分析"
      description="看用户做完一个动作后接着做了什么。默认按会话串联——跨会话会把「昨天看了详情页、今天下了单」连成一条边，那是用户从没连续做过的序列。"
      defaultRangeIndex={2}
    >
      {({ projectKey, range, reloadToken }) => (
        <PathsBody projectKey={projectKey} range={range} reloadToken={reloadToken} />
      )}
    </EventsShell>
  )
}

function PathsBody({
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
  const [depth, setDepth] = React.useState(4)
  const [branchLimit, setBranchLimit] = React.useState(5)
  const [scope, setScope] = React.useState<"session" | "user">("session")
  const [result, setResult] = React.useState<PathsResponse | null>(null)
  const [running, setRunning] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const run = async () => {
    setRunning(true)
    setError(null)
    try {
      setResult(
        await getPaths(projectKey, {
          ...range,
          ...(startEvent ? { start_event: startEvent } : {}),
          depth,
          branch_limit: branchLimit,
          scope,
        }),
      )
    } catch (cause: unknown) {
      setError(getErrorMessage(cause, "路径计算失败"))
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
          <span className="block text-xs text-slate-500 dark:text-slate-400">起点事件</span>
          <EventPicker
            definitions={definitions}
            value={startEvent}
            onChange={setStartEvent}
            allowEmpty
            emptyLabel="从序列开头"
            aria-label="起点事件"
          />
        </label>

        <label className="space-y-1">
          <span className="block text-xs text-slate-500 dark:text-slate-400">串联方式</span>
          <select
            value={scope}
            onChange={(event) => setScope(event.target.value as "session" | "user")}
            className={fieldClass}
          >
            <option value="session">按会话</option>
            <option value="user">按用户</option>
          </select>
        </label>

        <label className="space-y-1">
          <span className="block text-xs text-slate-500 dark:text-slate-400">层数</span>
          <input
            type="number"
            min={2}
            max={6}
            value={depth}
            onChange={(event) => setDepth(Number(event.target.value))}
            className={`${fieldClass} w-20`}
          />
        </label>

        <label className="space-y-1">
          <span className="block text-xs text-slate-500 dark:text-slate-400">每层分支数</span>
          <input
            type="number"
            min={1}
            max={20}
            value={branchLimit}
            onChange={(event) => setBranchLimit(Number(event.target.value))}
            className={`${fieldClass} w-20`}
          />
        </label>

        <Button onClick={() => void run()} disabled={running}>
          {running ? <Loader2 className="size-4 animate-spin" /> : null}
          计算路径
        </Button>
      </AdminCard>

      {result ? <PathLayers result={result} /> : <EmptyHint>点「计算路径」开始。</EmptyHint>}
    </div>
  )
}

function PathLayers({ result }: { result: PathsResponse }) {
  const byStep = React.useMemo(() => {
    const map = new Map<number, PathEdge[]>()
    for (const edge of result.data) {
      map.set(edge.step, [...(map.get(edge.step) ?? []), edge])
    }
    return [...map.entries()].sort((a, b) => a[0] - b[0])
  }, [result.data])

  if (byStep.length === 0) {
    return <EmptyHint>区间内没有可串联的事件序列。</EmptyHint>
  }

  return (
    <div className="space-y-4">
      {result.truncated ? (
        <p className="text-xs text-amber-200/80">
          部分分支已并入「（其他）」，此处显示的不是全部路径。可调高「每层分支数」。
        </p>
      ) : null}

      {byStep.map(([step, edges]) => {
        const total = edges.reduce((sum, edge) => sum + edge.count, 0)
        return (
          <AdminCard key={step} className="space-y-2">
            <h2 className="text-sm font-medium">
              第 {step} 步之后
              <span className="ml-2 text-xs font-normal text-slate-500">
                共 {formatNumber(total)} 次转移
              </span>
            </h2>
            <ul className="space-y-1.5">
              {edges.map((edge, index) => (
                <li key={`${edge.from_event}->${edge.to_event}`} className="space-y-1">
                  <div className="flex items-baseline justify-between gap-2 text-xs">
                    <span
                      className="truncate font-mono"
                      title={`${edge.from_event} → ${edge.to_event}`}
                    >
                      <span className="text-slate-400">{edge.from_event}</span>
                      <span className="mx-1.5 text-slate-600">→</span>
                      <span>{edge.to_event}</span>
                    </span>
                    <span className="shrink-0 font-mono tabular-nums">
                      {formatNumber(edge.count)}
                      <span className="ml-2 text-slate-500">{percent(edge.count, total)}</span>
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-white/8">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${total === 0 ? 0 : (edge.count / total) * 100}%`,
                        background: seriesColor(index),
                      }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </AdminCard>
        )
      })}
    </div>
  )
}
