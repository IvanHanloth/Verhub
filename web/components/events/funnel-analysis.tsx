"use client"

import * as React from "react"
import { ArrowDown, Filter, Loader2, Plus, X } from "lucide-react"

import { Button } from "@workspace/ui/components/button"

import { getErrorMessage } from "@/lib/error-utils"
import { formatNumber } from "@/components/analytics/chart-utils"
import { AdminCard } from "@/components/admin/admin-card"
import {
  getFunnel,
  type EventFilter,
  type EventRange,
  type FunnelResponse,
  type FunnelStep,
} from "@/lib/events-api"

import { EventPicker, FilterEditor, fieldClass, useEventDefinitions } from "./event-controls"
import { EmptyHint, EventsShell, ErrorBanner, NoEventsHint } from "./events-shell"

/** 与后端 MAX_FUNNEL_STEPS 保持一致。 */
const MAX_STEPS = 8

const WINDOW_OPTIONS = [
  { label: "1 小时", seconds: 3600 },
  { label: "1 天", seconds: 86400 },
  { label: "7 天", seconds: 7 * 86400 },
  { label: "30 天", seconds: 30 * 86400 },
]

type StepDraft = { event_name: string; filters: EventFilter[] }

/**
 * 漏斗分析。
 *
 * 这是「单条行为记录没有意义、必须组合才能判断」最直接的那个场景：把几个事件按
 * 顺序串起来，看每一步掉了多少人。
 */
export function FunnelAnalysis() {
  return (
    <EventsShell
      title="漏斗分析"
      description="按顺序统计同一个用户依次完成各步骤的比例。转化窗口从第一步算起——业务上说的「7 天内下单」算的是进入漏斗后的总时长。"
      defaultRangeIndex={2}
    >
      {({ projectKey, range, reloadToken }) => (
        <FunnelBody projectKey={projectKey} range={range} reloadToken={reloadToken} />
      )}
    </EventsShell>
  )
}

function FunnelBody({
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
  const [steps, setSteps] = React.useState<StepDraft[]>([])
  const [windowSeconds, setWindowSeconds] = React.useState(7 * 86400)
  const [result, setResult] = React.useState<FunnelResponse | null>(null)
  const [running, setRunning] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  // 首次拿到事件清单时预填两步，让页面一进来就是一个可以直接跑的漏斗，
  // 而不是一张需要先读懂才知道怎么填的空表单。
  React.useEffect(() => {
    if (steps.length > 0 || definitions.length < 2) return
    setSteps([
      { event_name: definitions[0]!.name, filters: [] },
      { event_name: definitions[1]!.name, filters: [] },
    ])
  }, [definitions, steps.length])

  const run = async () => {
    const usable = steps.filter((step) => step.event_name)
    if (usable.length < 2) {
      setError("漏斗至少需要两个步骤。")
      return
    }

    setRunning(true)
    setError(null)
    try {
      const payload: FunnelStep[] = usable.map((step) => ({
        event_name: step.event_name,
        ...(step.filters.length ? { filters: step.filters.filter((f) => f.property) } : {}),
      }))
      setResult(
        await getFunnel(projectKey, { ...range, steps: payload, window_seconds: windowSeconds }),
      )
    } catch (cause: unknown) {
      setError(getErrorMessage(cause, "漏斗计算失败"))
    } finally {
      setRunning(false)
    }
  }

  if (!definitionsLoading && definitions.length === 0) {
    return <NoEventsHint />
  }

  const updateStep = (index: number, patch: Partial<StepDraft>) => {
    setSteps(steps.map((step, i) => (i === index ? { ...step, ...patch } : step)))
  }

  return (
    <div className="space-y-4">
      {error ? <ErrorBanner message={error} /> : null}

      <AdminCard className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium">步骤</h2>
          <span className="text-xs text-slate-500">最多 {MAX_STEPS} 步</span>
        </div>

        <div className="space-y-3">
          {steps.map((step, index) => (
            <div key={index} className="space-y-2 rounded-xl border border-white/10 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-cyan-300/20 text-xs text-cyan-100">
                  {index + 1}
                </span>
                <EventPicker
                  definitions={definitions}
                  value={step.event_name}
                  onChange={(name) => updateStep(index, { event_name: name })}
                  aria-label={`第 ${index + 1} 步的事件`}
                />
                {steps.length > 2 ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`删除第 ${index + 1} 步`}
                    onClick={() => setSteps(steps.filter((_, i) => i !== index))}
                  >
                    <X className="size-3.5" />
                  </Button>
                ) : null}
              </div>
              <FilterEditor
                filters={step.filters}
                onChange={(filters) => updateStep(index, { filters })}
                label="该步骤的属性条件"
              />
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {steps.length < MAX_STEPS ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setSteps([...steps, { event_name: definitions[0]?.name ?? "", filters: [] }])
              }
            >
              <Plus className="size-3.5" />
              添加步骤
            </Button>
          ) : null}

          <label className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <Filter className="size-3.5" />
            转化窗口
            <select
              value={windowSeconds}
              onChange={(event) => setWindowSeconds(Number(event.target.value))}
              className={fieldClass}
            >
              {WINDOW_OPTIONS.map((option) => (
                <option key={option.seconds} value={option.seconds}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <Button onClick={() => void run()} disabled={running || steps.length < 2}>
            {running ? <Loader2 className="size-4 animate-spin" /> : null}
            计算漏斗
          </Button>
        </div>
      </AdminCard>

      {result ? (
        <FunnelResult result={result} />
      ) : (
        <EmptyHint>配置好步骤后点「计算漏斗」。</EmptyHint>
      )}
    </div>
  )
}

function FunnelResult({ result }: { result: FunnelResponse }) {
  const first = result.data[0]?.users ?? 0

  return (
    <AdminCard className="space-y-3">
      <h2 className="text-sm font-medium">转化结果</h2>

      {first === 0 ? (
        <p className="py-6 text-center text-sm text-slate-400">
          区间内没有用户完成第一步，无法计算转化。
        </p>
      ) : (
        <ol className="space-y-2">
          {result.data.map((step, index) => {
            // 条宽按第一步归一，一眼就能看出漏斗的收窄形状。
            const width = first === 0 ? 0 : (step.users / first) * 100
            return (
              <li key={step.step} className="space-y-1">
                {index > 0 ? (
                  <div className="flex items-center gap-1.5 pl-1 text-xs text-slate-500">
                    <ArrowDown className="size-3" />
                    <span>
                      本步转化 {(step.conversion_rate * 100).toFixed(1)}%，流失{" "}
                      {formatNumber(step.dropped)} 人
                    </span>
                  </div>
                ) : null}
                <div className="rounded-lg border border-white/10 p-3">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate font-mono text-sm" title={step.event_name}>
                      {step.step}. {step.event_name}
                    </span>
                    <span className="shrink-0 font-mono text-sm tabular-nums">
                      {formatNumber(step.users)}
                      <span className="ml-2 text-xs text-slate-500">
                        累计 {(step.total_conversion_rate * 100).toFixed(1)}%
                      </span>
                    </span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/8">
                    <div
                      className="h-full rounded-full bg-cyan-400/70"
                      style={{ width: `${width}%` }}
                    />
                  </div>
                </div>
              </li>
            )
          })}
        </ol>
      )}
    </AdminCard>
  )
}
