"use client"

import * as React from "react"
import { AlertTriangle, Clock3, Loader2 } from "lucide-react"

import { Button } from "@workspace/ui/components/button"

import { isAuthError } from "@/lib/api-client"
import { getErrorMessage } from "@/lib/error-utils"
import { usePagination } from "@/hooks/use-pagination"
import { getSessionToken } from "@/lib/auth-session"
import { AdminCard, AdminItemCard } from "@/components/admin/admin-card"
import { AdminListHeader, AdminPagination } from "@/components/admin/admin-list"
import { AdminPageHeader } from "@/components/admin/admin-page-header"
import { ApiReferenceDrawer } from "@/components/docs/api-reference-drawer"
import { useAdminProjects } from "@/hooks/use-admin-projects"
import { listLogs, type LogItem, type LogLevel } from "@/lib/logs-api"

const PAGE_SIZE = 10

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

function levelBadgeClass(level: LogLevel): string {
  const mapping: Record<LogLevel, string> = {
    0: "border-cyan-200/40 bg-cyan-200/15 text-cyan-50",
    1: "border-emerald-200/40 bg-emerald-200/15 text-emerald-50",
    2: "border-amber-200/40 bg-amber-200/15 text-amber-50",
    3: "border-rose-200/40 bg-rose-200/15 text-rose-50",
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
          className="grid gap-3 rounded-2xl border border-white/15 bg-white/5 p-4"
          onSubmit={applyFilters}
        >
          <div className="space-y-2">
            <label className="text-xs tracking-wide text-slate-300 uppercase" htmlFor="logs-level">
              日志级别
            </label>
            <select
              id="logs-level"
              className="w-full rounded-xl border border-white/20 bg-white/8 px-3 py-2 text-sm ring-teal-300 transition outline-none focus:ring-2"
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
            <label
              className="text-xs tracking-wide text-slate-300 uppercase"
              htmlFor="logs-start-time"
            >
              开始时间
            </label>
            <input
              id="logs-start-time"
              type="datetime-local"
              className="w-full rounded-xl border border-white/20 bg-white/8 px-3 py-2 text-sm ring-teal-300 transition outline-none focus:ring-2"
              value={draftFilters.startTime}
              onChange={(event) =>
                setDraftFilters((current) => ({ ...current, startTime: event.target.value }))
              }
            />
          </div>

          <div className="space-y-2">
            <label
              className="text-xs tracking-wide text-slate-300 uppercase"
              htmlFor="logs-end-time"
            >
              结束时间
            </label>
            <input
              id="logs-end-time"
              type="datetime-local"
              className="w-full rounded-xl border border-white/20 bg-white/8 px-3 py-2 text-sm ring-teal-300 transition outline-none focus:ring-2"
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
              className="border-white/30 bg-white/10 hover:bg-white/20"
              onClick={resetFilters}
            >
              重置
            </Button>
          </div>
        </form>

        <div className="overflow-hidden rounded-2xl border border-white/15">
          <div className="border-b border-white/10 bg-white/8 px-4 py-3">
            <AdminListHeader title="日志列表" total={total} page={page} totalPages={totalPages} />
          </div>

          {loading ? (
            <div className="flex min-h-56 items-center justify-center gap-2 text-sm text-slate-300">
              <Loader2 className="size-4 animate-spin" />
              正在加载日志...
            </div>
          ) : null}

          {!loading && error ? (
            <div className="flex min-h-56 items-center justify-center px-4 text-center text-sm text-rose-300">
              {error}
            </div>
          ) : null}

          {!loading && !error && logs.length === 0 ? (
            <div className="flex min-h-56 flex-col items-center justify-center gap-2 px-4 text-center text-sm text-slate-300">
              <Clock3 className="size-5 text-slate-400" />
              当前筛选条件下暂无日志。
            </div>
          ) : null}

          {!loading && !error && logs.length > 0 ? (
            <div className="divide-y divide-white/10">
              {logs.map((item) => (
                <AdminItemCard
                  key={item.id}
                  className="space-y-3 rounded-none border-0 bg-black/20 p-4"
                >
                  <header className="flex flex-wrap items-center justify-between gap-2">
                    <span
                      className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${levelBadgeClass(item.level)}`}
                    >
                      {levelLabel(item.level)}
                    </span>
                    <span className="text-xs text-slate-400">
                      {formatDateTime(item.created_at)}
                    </span>
                  </header>

                  <p className="text-sm leading-relaxed text-slate-100">{item.content}</p>

                  <div className="grid gap-3 text-xs text-slate-300">
                    <div className="space-y-1 rounded-xl border border-white/10 bg-white/5 p-3">
                      <p className="font-medium text-slate-200">device_info</p>
                      <pre className="max-h-32 overflow-auto text-[11px] break-all whitespace-pre-wrap">
                        {JSON.stringify(item.device_info ?? {}, null, 2)}
                      </pre>
                    </div>
                    <div className="space-y-1 rounded-xl border border-white/10 bg-white/5 p-3">
                      <p className="font-medium text-slate-200">custom_data</p>
                      <pre className="max-h-32 overflow-auto text-[11px] break-all whitespace-pre-wrap">
                        {JSON.stringify(item.custom_data ?? {}, null, 2)}
                      </pre>
                    </div>
                  </div>
                </AdminItemCard>
              ))}
            </div>
          ) : null}
        </div>

        <div className="rounded-2xl border border-white/15 bg-white/5 px-4 py-3">
          <p className="text-xs text-slate-300">
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
