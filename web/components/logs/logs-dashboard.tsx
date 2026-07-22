"use client"

import * as React from "react"
import { AlertTriangle, ChevronRight, Clock3, Loader2 } from "lucide-react"

import { Button } from "@workspace/ui/components/button"

import { isAuthError } from "@/lib/api-client"
import { getErrorMessage } from "@/lib/error-utils"
import { usePagination } from "@/hooks/use-pagination"
import { getSessionToken } from "@/lib/auth-session"
import { AdminCard } from "@/components/admin/admin-card"
import { AdminListHeader, AdminPagination } from "@/components/admin/admin-list"
import { AdminPageHeader } from "@/components/admin/admin-page-header"
import { ClientOriginBadges } from "@/components/common/client-origin-badges"
import { JsonField } from "@/components/common/json-viewer"
import { ApiReferenceDrawer } from "@/components/docs/api-reference-drawer"
import { useAdminProjects } from "@/hooks/use-admin-projects"
import { listLogs, type LogItem, type LogLevel } from "@/lib/logs-api"

const PAGE_SIZE = 10

/**
 * Lines of the message shown while collapsed. Enough for a one-line error plus
 * its first wrap, which is where the useful part of a stack trace usually is.
 */
const COLLAPSED_LINE_CLAMP = 2

const levelOptions: Array<{ label: string; value: LogLevel }> = [
  { label: "Debug", value: 0 },
  { label: "Info", value: 1 },
  { label: "Warn", value: 2 },
  { label: "Error", value: 3 },
]

type FilterState = {
  level: "" | `${LogLevel}`
  startTime: string
  endTime: string
}

const emptyFilters: FilterState = {
  level: "",
  startTime: "",
  endTime: "",
}

/**
 * Shared classes for the filter inputs.
 *
 * Spelled for both themes: the previous white/x-only values were legible on the
 * dark shell and washed out on the light one, where the whole filter bar read as
 * disabled.
 */
const FIELD_CLASS =
  "w-full rounded-xl border border-slate-900/15 bg-white/70 px-3 py-2 text-sm ring-teal-400 transition outline-none focus:ring-2 dark:border-white/20 dark:bg-white/8"

const FIELD_LABEL_CLASS = "text-xs tracking-wide text-slate-500 uppercase dark:text-slate-300"

function toEpochSeconds(value: string): number | undefined {
  const trimmed = value.trim()
  if (!trimmed) {
    return undefined
  }

  const time = Date.parse(trimmed)
  if (Number.isNaN(time)) {
    return undefined
  }

  return Math.floor(time / 1000)
}

function levelLabel(level: LogLevel): string {
  const mapping: Record<LogLevel, string> = {
    0: "Debug",
    1: "Info",
    2: "Warn",
    3: "Error",
  }

  return mapping[level]
}

/**
 * Level badge colors.
 *
 * Both themes are spelled out: the previous single set was tuned for the dark
 * admin shell and rendered near-white text on a pale tint in light mode, which
 * made the level — the first thing you scan for — effectively invisible.
 */
function levelBadgeClass(level: LogLevel): string {
  const mapping: Record<LogLevel, string> = {
    0: "border-cyan-500/30 bg-cyan-500/10 text-cyan-700 dark:border-cyan-300/30 dark:bg-cyan-300/15 dark:text-cyan-200",
    1: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:border-emerald-300/30 dark:bg-emerald-300/15 dark:text-emerald-200",
    2: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:border-amber-300/30 dark:bg-amber-300/15 dark:text-amber-200",
    3: "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:border-rose-300/30 dark:bg-rose-300/15 dark:text-rose-200",
  }

  return mapping[level]
}

function formatDateTime(value: number): string {
  const date = new Date(value * 1000)
  if (Number.isNaN(date.getTime())) {
    return String(value)
  }

  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date)
}

/**
 * One log row: header always visible, everything else behind a disclosure.
 *
 * Collapsed by default because triage is a scanning task — you read levels and
 * timestamps down the page, then open the one entry that matters. The previous
 * layout rendered both JSON blobs inline for every row, which made ten entries
 * several screens tall.
 */
function LogEntry({ log }: { log: LogItem }) {
  const [expanded, setExpanded] = React.useState(false)

  const hasDetails =
    Boolean(log.ip) ||
    Boolean(log.user_agent) ||
    Boolean(log.country_code) ||
    Boolean(log.platform) ||
    log.device_info !== null ||
    log.custom_data !== null

  return (
    <article className="px-4 py-3">
      <button
        type="button"
        onClick={() => setExpanded((current) => !current)}
        aria-expanded={expanded}
        className="flex w-full items-start gap-2 text-left"
      >
        <ChevronRight
          className={`mt-1 size-4 shrink-0 text-slate-400 transition-transform ${
            expanded ? "rotate-90" : ""
          }`}
          aria-hidden
        />

        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium ${levelBadgeClass(log.level)}`}
            >
              {levelLabel(log.level)}
            </span>
            <span className="text-xs text-slate-500 tabular-nums dark:text-slate-400">
              {formatDateTime(log.created_at)}
            </span>
          </div>

          <p
            className={`text-sm leading-relaxed break-words whitespace-pre-wrap ${
              expanded ? "" : "line-clamp-2"
            }`}
            style={expanded ? undefined : { WebkitLineClamp: COLLAPSED_LINE_CLAMP }}
          >
            {log.content}
          </p>
        </div>
      </button>

      {expanded ? (
        <div className="mt-3 space-y-3 pl-6">
          <ClientOriginBadges origin={log} />
          <div className="grid gap-2 sm:grid-cols-2">
            <JsonField label="device_info" value={log.device_info} />
            <JsonField label="custom_data" value={log.custom_data} />
          </div>
          {!hasDetails ? (
            <p className="text-xs text-slate-400 dark:text-slate-500">该日志没有附加信息。</p>
          ) : null}
        </div>
      ) : null}
    </article>
  )
}

export function LogsDashboard() {
  const [token, setToken] = React.useState(() => getSessionToken().trim())
  const [authError, setAuthError] = React.useState<string | null>(null)

  const { selectedProject, selectedProjectKey, error: projectsError } = useAdminProjects()

  const [logs, setLogs] = React.useState<LogItem[]>([])
  const {
    offset,
    total,
    setTotal,
    page,
    totalPages,
    hasPrev,
    hasNext,
    onPrev,
    onNext,
    resetOffset,
  } = usePagination({ pageSize: PAGE_SIZE })
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const [draftFilters, setDraftFilters] = React.useState<FilterState>(emptyFilters)
  const [appliedFilters, setAppliedFilters] = React.useState<FilterState>(emptyFilters)

  const hasToken = token.trim().length > 0

  const loadLogs = React.useCallback(
    async (nextOffset: number, signal?: AbortSignal) => {
      if (!token || !selectedProjectKey) {
        setLogs([])
        setTotal(0)
        return
      }

      const startTime = toEpochSeconds(appliedFilters.startTime)
      const endTime = toEpochSeconds(appliedFilters.endTime)

      if (startTime !== undefined && endTime !== undefined && startTime > endTime) {
        setError("开始时间不能晚于结束时间。")
        setLogs([])
        setTotal(0)
        return
      }

      setLoading(true)
      setError(null)

      try {
        const response = await listLogs(
          token,
          selectedProjectKey,
          {
            limit: PAGE_SIZE,
            offset: nextOffset,
            level: appliedFilters.level ? (Number(appliedFilters.level) as LogLevel) : undefined,
            start_time: startTime,
            end_time: endTime,
          },
          signal,
        )

        setLogs(response.data)
        setTotal(response.total)
      } catch (loadError) {
        if (signal?.aborted) {
          return
        }

        if (isAuthError(loadError)) {
          setToken("")
          setAuthError("登录状态已过期，请重新登录。")
        }

        setError(getErrorMessage(loadError))
        setLogs([])
        setTotal(0)
      } finally {
        if (!signal?.aborted) {
          setLoading(false)
        }
      }
    },
    [appliedFilters, selectedProjectKey, token, setTotal],
  )

  React.useEffect(() => {
    const controller = new AbortController()
    void loadLogs(offset, controller.signal)

    return () => {
      controller.abort()
    }
  }, [loadLogs, offset])

  React.useEffect(() => {
    resetOffset()
  }, [selectedProjectKey, resetOffset])

  function applyFilters(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setAppliedFilters(draftFilters)
    resetOffset()
  }

  function resetFilters() {
    setDraftFilters(emptyFilters)
    setAppliedFilters(emptyFilters)
    resetOffset()
  }

  return (
    <section className="space-y-6">
      <AdminPageHeader
        title="日志审计中心"
        description="按项目、级别和时间范围筛选日志，定位运行问题。"
        badge="Verhub Logs"
        actions={
          <ApiReferenceDrawer
            tag="Logs"
            title="日志接口文档"
            projectKey={selectedProject?.project_key}
          />
        }
      />

      {authError || projectsError ? (
        <AdminCard className="flex items-center gap-2 text-sm text-rose-500 dark:text-rose-300">
          <AlertTriangle className="size-4" />
          {authError ?? projectsError}
        </AdminCard>
      ) : null}

      <AdminCard className="space-y-5">
        <form
          className="grid gap-3 rounded-2xl border border-slate-900/10 bg-slate-900/[0.02] p-4 sm:grid-cols-2 xl:grid-cols-4 dark:border-white/15 dark:bg-white/5"
          onSubmit={applyFilters}
        >
          <div className="space-y-2">
            <label className={FIELD_LABEL_CLASS} htmlFor="logs-level">
              日志级别
            </label>
            <select
              id="logs-level"
              className={FIELD_CLASS}
              value={draftFilters.level}
              onChange={(event) =>
                setDraftFilters((current) => ({
                  ...current,
                  level: event.target.value as FilterState["level"],
                }))
              }
            >
              <option value="">全部</option>
              {levelOptions.map((option) => (
                <option key={option.value} value={String(option.value)}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className={FIELD_LABEL_CLASS} htmlFor="logs-start-time">
              开始时间
            </label>
            <input
              id="logs-start-time"
              type="datetime-local"
              className={FIELD_CLASS}
              value={draftFilters.startTime}
              onChange={(event) =>
                setDraftFilters((current) => ({ ...current, startTime: event.target.value }))
              }
            />
          </div>

          <div className="space-y-2">
            <label className={FIELD_LABEL_CLASS} htmlFor="logs-end-time">
              结束时间
            </label>
            <input
              id="logs-end-time"
              type="datetime-local"
              className={FIELD_CLASS}
              value={draftFilters.endTime}
              onChange={(event) =>
                setDraftFilters((current) => ({ ...current, endTime: event.target.value }))
              }
            />
          </div>

          <div className="flex items-end gap-2">
            <Button
              type="submit"
              className="flex-1 bg-teal-200 text-slate-900 hover:bg-teal-100"
              disabled={!hasToken || loading}
            >
              应用筛选
            </Button>
            <Button
              type="button"
              variant="outline"
              className="border-slate-900/20 hover:bg-slate-900/5 dark:border-white/30 dark:bg-white/10 dark:hover:bg-white/20"
              onClick={resetFilters}
            >
              重置
            </Button>
          </div>
        </form>

        <div className="overflow-hidden rounded-2xl border border-slate-900/10 dark:border-white/15">
          <div className="border-b border-slate-900/10 bg-slate-900/[0.02] px-4 py-3 dark:border-white/10 dark:bg-white/8">
            <AdminListHeader title="日志列表" total={total} page={page} totalPages={totalPages} />
          </div>

          {loading ? (
            <div className="flex min-h-56 items-center justify-center gap-2 text-sm text-slate-500 dark:text-slate-300">
              <Loader2 className="size-4 animate-spin" />
              正在加载日志...
            </div>
          ) : null}

          {!loading && error ? (
            <div className="flex min-h-56 items-center justify-center px-4 text-center text-sm text-rose-600 dark:text-rose-300">
              {error}
            </div>
          ) : null}

          {!loading && !error && logs.length === 0 ? (
            <div className="flex min-h-56 flex-col items-center justify-center gap-2 px-4 text-center text-sm text-slate-500 dark:text-slate-300">
              <Clock3 className="size-5 text-slate-400" />
              当前筛选条件下暂无日志。
            </div>
          ) : null}

          {!loading && !error && logs.length > 0 ? (
            <div className="divide-y divide-slate-900/10 dark:divide-white/10">
              {logs.map((item) => (
                <LogEntry key={item.id} log={item} />
              ))}
            </div>
          ) : null}
        </div>

        <div className="rounded-2xl border border-slate-900/10 bg-slate-900/[0.02] px-4 py-3 dark:border-white/15 dark:bg-white/5">
          <p className="text-xs text-slate-500 dark:text-slate-300">
            当前偏移量 {offset}，每页 {PAGE_SIZE} 条
          </p>
          <AdminPagination
            hasPrev={hasPrev && !loading}
            hasNext={hasNext && !loading}
            onPrev={onPrev}
            onNext={onNext}
          />
        </div>
      </AdminCard>
    </section>
  )
}
