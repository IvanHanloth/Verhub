"use client"

import * as React from "react"
import { AlertTriangle, Clock3, Loader2, RefreshCcw, ShieldAlert } from "lucide-react"

import { Button } from "@workspace/ui/components/button"

import { ApiError, isAuthError } from "@/lib/api-client"
import { listLogs, type LogItem, type LogLevel } from "@/lib/logs-api"
import { listProjects, loginAdmin, type ProjectItem } from "@/lib/projects-api"

const TOKEN_STORAGE_KEY = "verhub-admin-token"
const PROJECT_PAGE_SIZE = 100
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

function getErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return `${error.message} (HTTP ${error.status})`
  }

  if (error instanceof Error) {
    return error.message
  }

  return "请求失败，请稍后重试。"
}

function toEpochMs(value: string): number | undefined {
  const trimmed = value.trim()
  if (!trimmed) {
    return undefined
  }

  const time = Date.parse(trimmed)
  if (Number.isNaN(time)) {
    return undefined
  }

  return time
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

function formatDateTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
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
  const [token, setToken] = React.useState("")
  const [tempToken, setTempToken] = React.useState("")
  const [username, setUsername] = React.useState("")
  const [password, setPassword] = React.useState("")
  const [authLoading, setAuthLoading] = React.useState(false)
  const [authError, setAuthError] = React.useState<string | null>(null)

  const [projects, setProjects] = React.useState<ProjectItem[]>([])
  const [projectsLoading, setProjectsLoading] = React.useState(false)
  const [selectedProjectId, setSelectedProjectId] = React.useState("")

  const [logs, setLogs] = React.useState<LogItem[]>([])
  const [total, setTotal] = React.useState(0)
  const [offset, setOffset] = React.useState(0)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const [draftFilters, setDraftFilters] = React.useState<FilterState>(emptyFilters)
  const [appliedFilters, setAppliedFilters] = React.useState<FilterState>(emptyFilters)

  const hasToken = token.trim().length > 0
  const page = Math.floor(offset / PAGE_SIZE) + 1
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const loadProjects = React.useCallback(async () => {
    if (!token) {
      setProjects([])
      setSelectedProjectId("")
      return
    }

    setProjectsLoading(true)
    try {
      const response = await listProjects(token, { limit: PROJECT_PAGE_SIZE, offset: 0 })
      setProjects(response.data)
      const firstProject = response.data[0]
      if (firstProject) {
        setSelectedProjectId((current) => current || firstProject.id)
      } else {
        setSelectedProjectId("")
      }
    } catch (loadError) {
      if (isAuthError(loadError)) {
        setToken("")
        setTempToken("")
        window.localStorage.removeItem(TOKEN_STORAGE_KEY)
        setAuthError("登录状态已过期，请重新登录。")
      }
      setAuthError(getErrorMessage(loadError))
      setProjects([])
      setSelectedProjectId("")
    } finally {
      setProjectsLoading(false)
    }
  }, [token])

  const loadLogs = React.useCallback(
    async (nextOffset: number, signal?: AbortSignal) => {
      if (!token || !selectedProjectId) {
        setLogs([])
        setTotal(0)
        return
      }

      const startTime = toEpochMs(appliedFilters.startTime)
      const endTime = toEpochMs(appliedFilters.endTime)

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
          selectedProjectId,
          {
            limit: PAGE_SIZE,
            offset: nextOffset,
            level: appliedFilters.level ? Number(appliedFilters.level) as LogLevel : undefined,
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
          setTempToken("")
          window.localStorage.removeItem(TOKEN_STORAGE_KEY)
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
    [appliedFilters, selectedProjectId, token],
  )

  React.useEffect(() => {
    const savedToken = window.localStorage.getItem(TOKEN_STORAGE_KEY) ?? ""
    if (savedToken) {
      setToken(savedToken)
      setTempToken(savedToken)
    }
  }, [])

  React.useEffect(() => {
    void loadProjects()
  }, [loadProjects])

  React.useEffect(() => {
    const controller = new AbortController()
    void loadLogs(offset, controller.signal)

    return () => {
      controller.abort()
    }
  }, [loadLogs, offset])

  React.useEffect(() => {
    setOffset(0)
  }, [selectedProjectId])

  async function handleLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setAuthLoading(true)
    setAuthError(null)

    try {
      const response = await loginAdmin(username.trim(), password)
      setToken(response.access_token)
      setTempToken(response.access_token)
      window.localStorage.setItem(TOKEN_STORAGE_KEY, response.access_token)
      setPassword("")
      setOffset(0)
    } catch (loginError) {
      setAuthError(getErrorMessage(loginError))
    } finally {
      setAuthLoading(false)
    }
  }

  function saveToken() {
    const nextToken = tempToken.trim()
    setToken(nextToken)
    setOffset(0)

    if (nextToken) {
      window.localStorage.setItem(TOKEN_STORAGE_KEY, nextToken)
      setAuthError(null)
      return
    }

    window.localStorage.removeItem(TOKEN_STORAGE_KEY)
    setProjects([])
    setSelectedProjectId("")
    setLogs([])
    setTotal(0)
  }

  function applyFilters(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setAppliedFilters(draftFilters)
    setOffset(0)
  }

  function resetFilters() {
    setDraftFilters(emptyFilters)
    setAppliedFilters(emptyFilters)
    setOffset(0)
  }

  return (
    <main className="min-h-svh bg-[linear-gradient(140deg,#041312_0%,#12323f_40%,#161724_100%)] text-slate-100">
      <div className="mx-auto w-full max-w-7xl space-y-6 px-4 py-8 sm:px-8 sm:py-10">
        <section className="rounded-3xl border border-teal-200/20 bg-white/8 p-6 shadow-2xl backdrop-blur-md">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-2">
              <p className="inline-flex items-center gap-2 rounded-full border border-teal-200/25 bg-teal-200/10 px-3 py-1 text-xs tracking-[0.16em] text-teal-100 uppercase">
                <ShieldAlert className="size-3.5" />
                Verhub Logs
              </p>
              <h1 className="text-2xl font-semibold sm:text-3xl">日志审计工作台</h1>
              <p className="max-w-3xl text-sm text-slate-200/90 sm:text-base">支持按项目、日志级别和时间区间筛选，并进行分页浏览，便于排障与审计回溯。</p>
            </div>
            <Button
              type="button"
              variant="outline"
              className="border-white/30 bg-white/10 hover:bg-white/20"
              onClick={() => {
                void loadProjects()
                void loadLogs(offset)
              }}
              disabled={!hasToken || loading || projectsLoading}
            >
              {loading || projectsLoading ? <Loader2 className="size-4 animate-spin" /> : <RefreshCcw className="size-4" />}
              刷新
            </Button>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.05fr_1.95fr]">
          <article className="space-y-6 rounded-3xl border border-white/15 bg-black/25 p-5 shadow-xl">
            <div className="space-y-2">
              <h2 className="text-lg font-semibold">管理员认证</h2>
              <p className="text-sm text-slate-300">可通过账号密码登录获取 JWT，也可直接粘贴令牌。</p>
            </div>

            <form className="space-y-3" onSubmit={handleLogin}>
              <input
                type="text"
                placeholder="用户名"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                className="w-full rounded-xl border border-white/20 bg-white/5 px-3 py-2 text-sm outline-none ring-teal-300 transition focus:ring-2"
                required
              />
              <input
                type="password"
                placeholder="密码"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="w-full rounded-xl border border-white/20 bg-white/5 px-3 py-2 text-sm outline-none ring-teal-300 transition focus:ring-2"
                required
              />
              <Button type="submit" className="w-full bg-teal-200 text-slate-900 hover:bg-teal-100" disabled={authLoading}>
                {authLoading ? <Loader2 className="size-4 animate-spin" /> : null}
                获取访问令牌
              </Button>
            </form>

            <div className="space-y-2">
              <label className="text-sm text-slate-300" htmlFor="logs-token-input">
                JWT Token
              </label>
              <textarea
                id="logs-token-input"
                value={tempToken}
                onChange={(event) => setTempToken(event.target.value)}
                rows={5}
                className="w-full rounded-xl border border-white/20 bg-white/5 px-3 py-2 text-xs outline-none ring-teal-300 transition focus:ring-2"
                placeholder="Bearer 后面的 token"
              />
              <Button type="button" variant="secondary" className="w-full" onClick={saveToken}>
                保存并应用 Token
              </Button>
            </div>

            <div className="space-y-2">
              <label className="text-sm text-slate-300" htmlFor="logs-project-select">
                目标项目
              </label>
              <select
                id="logs-project-select"
                className="w-full rounded-xl border border-white/20 bg-white/8 px-3 py-2 text-sm outline-none ring-teal-300 transition focus:ring-2"
                value={selectedProjectId}
                onChange={(event) => setSelectedProjectId(event.target.value)}
                disabled={!hasToken || projectsLoading || projects.length === 0}
              >
                {projects.length === 0 ? <option value="">暂无可选项目</option> : null}
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name} ({project.project_key})
                  </option>
                ))}
              </select>
            </div>

            {authError ? (
              <p className="inline-flex items-center gap-2 text-sm text-rose-300">
                <AlertTriangle className="size-4" />
                {authError}
              </p>
            ) : null}
          </article>

          <article className="space-y-5 rounded-3xl border border-white/15 bg-black/25 p-5 shadow-xl">
            <form className="grid gap-3 rounded-2xl border border-white/15 bg-white/5 p-4 md:grid-cols-2" onSubmit={applyFilters}>
              <div className="space-y-2">
                <label className="text-xs tracking-wide text-slate-300 uppercase" htmlFor="logs-level">
                  日志级别
                </label>
                <select
                  id="logs-level"
                  className="w-full rounded-xl border border-white/20 bg-white/8 px-3 py-2 text-sm outline-none ring-teal-300 transition focus:ring-2"
                  value={draftFilters.level}
                  onChange={(event) => setDraftFilters((current) => ({ ...current, level: event.target.value as FilterState["level"] }))}
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
                <label className="text-xs tracking-wide text-slate-300 uppercase" htmlFor="logs-start-time">
                  开始时间
                </label>
                <input
                  id="logs-start-time"
                  type="datetime-local"
                  className="w-full rounded-xl border border-white/20 bg-white/8 px-3 py-2 text-sm outline-none ring-teal-300 transition focus:ring-2"
                  value={draftFilters.startTime}
                  onChange={(event) => setDraftFilters((current) => ({ ...current, startTime: event.target.value }))}
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs tracking-wide text-slate-300 uppercase" htmlFor="logs-end-time">
                  结束时间
                </label>
                <input
                  id="logs-end-time"
                  type="datetime-local"
                  className="w-full rounded-xl border border-white/20 bg-white/8 px-3 py-2 text-sm outline-none ring-teal-300 transition focus:ring-2"
                  value={draftFilters.endTime}
                  onChange={(event) => setDraftFilters((current) => ({ ...current, endTime: event.target.value }))}
                />
              </div>

              <div className="flex items-end gap-2">
                <Button type="submit" className="flex-1 bg-teal-200 text-slate-900 hover:bg-teal-100" disabled={!hasToken || loading}>
                  应用筛选
                </Button>
                <Button type="button" variant="outline" className="border-white/30 bg-white/10 hover:bg-white/20" onClick={resetFilters}>
                  重置
                </Button>
              </div>
            </form>

            <div className="overflow-hidden rounded-2xl border border-white/15">
              <div className="flex items-center justify-between border-b border-white/10 bg-white/8 px-4 py-3">
                <p className="text-sm text-slate-200">共 {total} 条日志</p>
                <p className="text-xs text-slate-300">第 {page} / {totalPages} 页</p>
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
                    <article key={item.id} className="space-y-3 bg-black/20 p-4">
                      <header className="flex flex-wrap items-center justify-between gap-2">
                        <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${levelBadgeClass(item.level)}`}>
                          {levelLabel(item.level)}
                        </span>
                        <span className="text-xs text-slate-400">{formatDateTime(item.created_at)}</span>
                      </header>

                      <p className="text-sm leading-relaxed text-slate-100">{item.content}</p>

                      <div className="grid gap-3 text-xs text-slate-300 md:grid-cols-2">
                        <div className="space-y-1 rounded-xl border border-white/10 bg-white/5 p-3">
                          <p className="font-medium text-slate-200">device_info</p>
                          <pre className="max-h-32 overflow-auto whitespace-pre-wrap break-all text-[11px]">
                            {JSON.stringify(item.device_info ?? {}, null, 2)}
                          </pre>
                        </div>
                        <div className="space-y-1 rounded-xl border border-white/10 bg-white/5 p-3">
                          <p className="font-medium text-slate-200">custom_data</p>
                          <pre className="max-h-32 overflow-auto whitespace-pre-wrap break-all text-[11px]">
                            {JSON.stringify(item.custom_data ?? {}, null, 2)}
                          </pre>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/15 bg-white/5 px-4 py-3">
              <p className="text-xs text-slate-300">
                当前偏移量 {offset}，每页 {PAGE_SIZE} 条
              </p>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="border-white/30 bg-white/10 hover:bg-white/20"
                  disabled={offset === 0 || loading}
                  onClick={() => setOffset((current) => Math.max(0, current - PAGE_SIZE))}
                >
                  上一页
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="border-white/30 bg-white/10 hover:bg-white/20"
                  disabled={loading || offset + PAGE_SIZE >= total}
                  onClick={() => setOffset((current) => current + PAGE_SIZE)}
                >
                  下一页
                </Button>
              </div>
            </div>
          </article>
        </section>
      </div>
    </main>
  )
}
