"use client"

import * as React from "react"
import { Loader2, Plus, Save, X } from "lucide-react"

import { Button } from "@workspace/ui/components/button"

import { AdminCard } from "@/components/admin/admin-card"
import { getErrorMessage } from "@/lib/error-utils"
import {
  formatNumber,
  seriesColor,
  type DistributionItem,
} from "@/components/analytics/chart-utils"
import { DistributionChart, ShareTable } from "@/components/analytics/distribution-chart"
import { StackedTrendChart, TrendLineChart } from "@/components/analytics/trend-chart"
import {
  EVENT_MEASURE_LABELS,
  createDashboardCard,
  runEventQuery,
  type DslEvent,
  type EventFilter,
  type EventMeasure,
  type EventQuery,
  type EventQueryResponse,
  type EventRange,
  type Granularity,
} from "@/lib/events-api"

import { EventPicker, FilterEditor, fieldClass, useEventDefinitions } from "./event-controls"
import { EmptyHint, EventsShell, ErrorBanner, NoEventsHint } from "./events-shell"

/** 别名取单个大写字母，与后端 DSL 的约定一致；上限 6 个。 */
const ALIASES = ["A", "B", "C", "D", "E", "F"] as const

const QUERY_TYPES: Array<{ value: EventQuery["type"]; label: string; hint: string }> = [
  { value: "timeseries", label: "趋势", hint: "随时间变化的曲线" },
  { value: "breakdown", label: "分布", hint: "按维度拆开的占比" },
  { value: "value", label: "单值", hint: "一个数字，适合放 KPI 卡片" },
]

const GROUP_BY_KINDS = [
  { value: "event", label: "事件" },
  { value: "platform", label: "平台" },
  { value: "region", label: "地区" },
  { value: "property", label: "自定义属性" },
] as const

/**
 * 查询构建器。
 *
 * 产出的就是指标 DSL——同一份结构既能直接执行，也能存成看板卡片，不必维护
 * 两套形状。公式在服务端由一个只认「别名、数字、+ - * / ( )」的解析器求值。
 */
export function QueryBuilder() {
  return (
    <EventsShell
      title="查询构建器"
      description="自由组合事件、属性条件与度量，可写跨事件公式（如 A / B * 100）。满意的结果可以直接存成看板卡片。"
      defaultRangeIndex={2}
    >
      {({ projectKey, range, granularity, reloadToken }) => (
        <BuilderBody
          projectKey={projectKey}
          range={range}
          granularity={granularity}
          reloadToken={reloadToken}
        />
      )}
    </EventsShell>
  )
}

type EventDraft = { name: string; measure: EventMeasure; filters: EventFilter[] }

function BuilderBody({
  projectKey,
  range,
  granularity,
  reloadToken,
}: {
  projectKey: string
  range: EventRange
  granularity: Granularity
  reloadToken: number
}) {
  const { definitions, loading: definitionsLoading } = useEventDefinitions(
    projectKey,
    range,
    reloadToken,
  )

  const [type, setType] = React.useState<EventQuery["type"]>("timeseries")
  const [events, setEvents] = React.useState<EventDraft[]>([])
  const [globalFilters, setGlobalFilters] = React.useState<EventFilter[]>([])
  const [formula, setFormula] = React.useState("")
  const [groupByKind, setGroupByKind] =
    React.useState<(typeof GROUP_BY_KINDS)[number]["value"]>("event")
  const [groupByKey, setGroupByKey] = React.useState("")
  const [result, setResult] = React.useState<EventQueryResponse | null>(null)
  const [running, setRunning] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [notice, setNotice] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (events.length === 0 && definitions.length > 0) {
      setEvents([{ name: definitions[0]!.name, measure: "count", filters: [] }])
    }
  }, [definitions, events.length])

  const buildQuery = (): EventQuery => ({
    ...range,
    type,
    granularity,
    events: events
      .filter((event) => event.name)
      .map<DslEvent>((event, index) => ({
        name: event.name,
        alias: ALIASES[index]!,
        measure: event.measure,
        ...(event.filters.some((f) => f.property)
          ? { filters: event.filters.filter((f) => f.property) }
          : {}),
      })),
    ...(globalFilters.some((f) => f.property)
      ? { filters: globalFilters.filter((f) => f.property) }
      : {}),
    ...(formula.trim() ? { formula: formula.trim() } : {}),
    ...(type === "breakdown"
      ? {
          group_by: {
            kind: groupByKind,
            ...(groupByKind === "property" ? { key: groupByKey } : {}),
          },
        }
      : {}),
  })

  const run = async () => {
    setRunning(true)
    setError(null)
    setNotice(null)
    try {
      setResult(await runEventQuery(projectKey, buildQuery()))
    } catch (cause: unknown) {
      setError(getErrorMessage(cause, "查询执行失败"))
    } finally {
      setRunning(false)
    }
  }

  const saveAsCard = async () => {
    const title = window.prompt("卡片标题")
    if (!title?.trim()) return

    setSaving(true)
    setError(null)
    try {
      await createDashboardCard(projectKey, { title: title.trim(), query: buildQuery() })
      setNotice(`已保存卡片「${title.trim()}」，可在「看板」页查看。`)
    } catch (cause: unknown) {
      setError(getErrorMessage(cause, "保存卡片失败"))
    } finally {
      setSaving(false)
    }
  }

  if (!definitionsLoading && definitions.length === 0) {
    return <NoEventsHint />
  }

  const updateEvent = (index: number, patch: Partial<EventDraft>) => {
    setEvents(events.map((event, i) => (i === index ? { ...event, ...patch } : event)))
  }

  return (
    <div className="space-y-4">
      {error ? <ErrorBanner message={error} /> : null}
      {notice ? (
        <AdminCard className="border-emerald-300/30 bg-emerald-300/10 p-4 text-sm text-emerald-100">
          {notice}
        </AdminCard>
      ) : null}

      <AdminCard className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {QUERY_TYPES.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setType(option.value)}
              title={option.hint}
              className={`rounded-lg border px-3 py-1.5 text-sm transition ${
                type === option.value
                  ? "border-cyan-300/40 bg-cyan-300/15 text-cyan-100"
                  : "border-white/10 text-slate-300 hover:border-cyan-200/30"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        <div className="space-y-3">
          {events.map((event, index) => (
            <div key={index} className="space-y-2 rounded-xl border border-white/10 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-cyan-300/20 font-mono text-xs text-cyan-100">
                  {ALIASES[index]}
                </span>
                <EventPicker
                  definitions={definitions}
                  value={event.name}
                  onChange={(name) => updateEvent(index, { name })}
                  aria-label={`事件 ${ALIASES[index]}`}
                />
                <select
                  value={event.measure}
                  onChange={(e) => updateEvent(index, { measure: e.target.value as EventMeasure })}
                  aria-label="度量方式"
                  className={fieldClass}
                >
                  {(Object.keys(EVENT_MEASURE_LABELS) as EventMeasure[]).map((measure) => (
                    <option key={measure} value={measure}>
                      {EVENT_MEASURE_LABELS[measure]}
                    </option>
                  ))}
                </select>
                {events.length > 1 ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`删除事件 ${ALIASES[index]}`}
                    onClick={() => setEvents(events.filter((_, i) => i !== index))}
                  >
                    <X className="size-3.5" />
                  </Button>
                ) : null}
              </div>
              <FilterEditor
                filters={event.filters}
                onChange={(filters) => updateEvent(index, { filters })}
                label={`事件 ${ALIASES[index]} 的条件`}
              />
            </div>
          ))}
        </div>

        {events.length < ALIASES.length ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              setEvents([
                ...events,
                { name: definitions[0]?.name ?? "", measure: "count", filters: [] },
              ])
            }
          >
            <Plus className="size-3.5" />
            添加事件
          </Button>
        ) : null}

        <FilterEditor
          filters={globalFilters}
          onChange={setGlobalFilters}
          label="全局条件（与各事件自己的条件取交集）"
        />

        {type === "breakdown" ? (
          <div className="flex flex-wrap items-end gap-3">
            <label className="space-y-1">
              <span className="block text-xs text-slate-500 dark:text-slate-400">分组维度</span>
              <select
                value={groupByKind}
                onChange={(event) =>
                  setGroupByKind(event.target.value as (typeof GROUP_BY_KINDS)[number]["value"])
                }
                className={fieldClass}
              >
                {GROUP_BY_KINDS.map((kind) => (
                  <option key={kind.value} value={kind.value}>
                    {kind.label}
                  </option>
                ))}
              </select>
            </label>
            {groupByKind === "property" ? (
              <label className="space-y-1">
                <span className="block text-xs text-slate-500 dark:text-slate-400">属性名</span>
                <input
                  value={groupByKey}
                  onChange={(event) => setGroupByKey(event.target.value)}
                  placeholder="如 plan"
                  className={`${fieldClass} w-40`}
                />
              </label>
            ) : null}
          </div>
        ) : null}

        <label className="block space-y-1">
          <span className="text-xs text-slate-500 dark:text-slate-400">
            公式（可选）—— 只认别名、数字与 + - * / ( )，例如 A / B * 100
          </span>
          <input
            value={formula}
            onChange={(event) => setFormula(event.target.value)}
            placeholder="留空则各事件分别成一条序列"
            className={`${fieldClass} w-full font-mono`}
          />
        </label>

        <div className="flex flex-wrap gap-2">
          <Button onClick={() => void run()} disabled={running}>
            {running ? <Loader2 className="size-4 animate-spin" /> : null}
            执行查询
          </Button>
          <Button variant="outline" onClick={() => void saveAsCard()} disabled={saving || !result}>
            <Save className="size-4" />
            保存为卡片
          </Button>
        </div>
      </AdminCard>

      {result ? (
        <AdminCard className="space-y-3">
          <h2 className="text-sm font-medium">查询结果</h2>
          <QueryResultView result={result} granularity={granularity} />
        </AdminCard>
      ) : (
        <EmptyHint>配置好之后点「执行查询」。</EmptyHint>
      )}
    </div>
  )
}

/** 结果的形状随 type 变化，渲染分支集中在这里，供构建器与看板卡片共用。 */
export function QueryResultView({
  result,
  granularity,
}: {
  result: EventQueryResponse
  granularity: Granularity
}) {
  if (result.type === "value") {
    return (
      <div className="space-y-2">
        <p className="font-mono text-3xl font-semibold tabular-nums">
          {result.result === undefined ? "—" : formatNumber(Math.round(result.result * 100) / 100)}
        </p>
        {result.values ? (
          <ul className="flex flex-wrap gap-3 text-xs text-slate-500">
            {Object.entries(result.values).map(([alias, value]) => (
              <li key={alias}>
                <span className="font-mono">{alias}</span> ={" "}
                {formatNumber(Math.round(value * 100) / 100)}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    )
  }

  if (result.type === "breakdown") {
    const items: DistributionItem[] = (result.buckets ?? []).map((bucket, index) => ({
      key: bucket.key,
      label: bucket.label,
      count: bucket.count,
      fill: seriesColor(index),
    }))
    if (items.length === 0) {
      return <p className="py-6 text-center text-sm text-slate-400">区间内没有数据。</p>
    }
    return (
      <div className="space-y-4">
        <DistributionChart items={items} view="bar" measureLabel="数值" labelMaxChars={16} />
        <ShareTable
          items={items}
          total={result.total ?? 0}
          categoryHeader="分组"
          measureHeader="数值"
        />
      </div>
    )
  }

  const series = result.series ?? []
  if (series.length === 0) {
    return <p className="py-6 text-center text-sm text-slate-400">区间内没有数据。</p>
  }
  if (series.length === 1) {
    return (
      <TrendLineChart
        points={series[0]!.data}
        granularity={granularity}
        measureLabel={series[0]!.key === "formula" ? "公式结果" : series[0]!.key}
      />
    )
  }
  return <StackedTrendChart series={series} granularity={granularity} naming="raw" />
}
