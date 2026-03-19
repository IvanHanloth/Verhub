"use client"

import * as React from "react"
import { AlertTriangle, CheckCircle2, ListTree, Loader2, Plus, RefreshCcw } from "lucide-react"

import { Button } from "@workspace/ui/components/button"

import { ApiError, isAuthError } from "@/lib/api-client"
import { listProjects, loginAdmin, type ProjectItem } from "@/lib/projects-api"
import { createVersion, listVersions, type ClientPlatform, type CreateVersionInput, type VersionItem } from "@/lib/versions-api"

const TOKEN_STORAGE_KEY = "verhub-admin-token"
const PROJECT_PAGE_SIZE = 100
const VERSION_PAGE_SIZE = 10

const platformOptions: Array<{ label: string; value: ClientPlatform }> = [
  { label: "iOS", value: "ios" },
  { label: "Android", value: "android" },
  { label: "Windows", value: "windows" },
  { label: "macOS", value: "mac" },
  { label: "Web", value: "web" },
]

type VersionFormState = {
  version: string
  title: string
  content: string
  download_url: string
  forced: boolean
  platform: "" | ClientPlatform
  custom_data: string
}

const emptyVersionForm: VersionFormState = {
  version: "",
  title: "",
  content: "",
  download_url: "",
  forced: false,
  platform: "",
  custom_data: "",
}

function getErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return `${error.message} (HTTP ${error.status})`
  }

  if (error instanceof Error) {
    return error.message
  }

  return "请求失败，请稍后再试。"
}

function parseJsonInput(value: string): Record<string, unknown> | undefined {
  const trimmed = value.trim()
  if (!trimmed) {
    return undefined
  }

  const parsed = JSON.parse(trimmed) as unknown
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("custom_data 必须是 JSON 对象。")
  }

  return parsed as Record<string, unknown>
}

function toCreateInput(form: VersionFormState): CreateVersionInput {
  return {
    version: form.version.trim(),
    title: form.title.trim() || undefined,
    content: form.content.trim() || undefined,
    download_url: form.download_url.trim(),
    forced: form.forced,
    platform: form.platform || undefined,
    custom_data: parseJsonInput(form.custom_data),
  }
}

export function VersionsDashboard() {
  const [token, setToken] = React.useState("")
  const [tempToken, setTempToken] = React.useState("")
  const [username, setUsername] = React.useState("")
  const [password, setPassword] = React.useState("")
  const [authLoading, setAuthLoading] = React.useState(false)
  const [authError, setAuthError] = React.useState<string | null>(null)

  const [projects, setProjects] = React.useState<ProjectItem[]>([])
  const [projectsLoading, setProjectsLoading] = React.useState(false)
  const [selectedProjectId, setSelectedProjectId] = React.useState("")

  const [versions, setVersions] = React.useState<VersionItem[]>([])
  const [totalVersions, setTotalVersions] = React.useState(0)
  const [offset, setOffset] = React.useState(0)
  const [versionsLoading, setVersionsLoading] = React.useState(false)
  const [versionsError, setVersionsError] = React.useState<string | null>(null)

  const [form, setForm] = React.useState<VersionFormState>(emptyVersionForm)
  const [submitLoading, setSubmitLoading] = React.useState(false)
  const [submitMessage, setSubmitMessage] = React.useState<string | null>(null)

  const hasToken = token.trim().length > 0
  const page = Math.floor(offset / VERSION_PAGE_SIZE) + 1
  const totalPages = Math.max(1, Math.ceil(totalVersions / VERSION_PAGE_SIZE))

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
    } catch (error) {
      if (isAuthError(error)) {
        setToken("")
        setTempToken("")
        window.localStorage.removeItem(TOKEN_STORAGE_KEY)
        setAuthError("登录状态已过期，请重新登录。")
      }
      setAuthError(getErrorMessage(error))
      setProjects([])
      setSelectedProjectId("")
    } finally {
      setProjectsLoading(false)
    }
  }, [token])

  const loadVersions = React.useCallback(
    async (nextOffset: number, signal?: AbortSignal) => {
      if (!token || !selectedProjectId) {
        setVersions([])
        setTotalVersions(0)
        return
      }

      setVersionsLoading(true)
      setVersionsError(null)

      try {
        const response = await listVersions(token, selectedProjectId, { limit: VERSION_PAGE_SIZE, offset: nextOffset }, signal)
        setVersions(response.data)
        setTotalVersions(response.total)
      } catch (error) {
        if (signal?.aborted) {
          return
        }
        if (isAuthError(error)) {
          setToken("")
          setTempToken("")
          window.localStorage.removeItem(TOKEN_STORAGE_KEY)
          setAuthError("登录状态已过期，请重新登录。")
        }
        setVersionsError(getErrorMessage(error))
        setVersions([])
        setTotalVersions(0)
      } finally {
        if (!signal?.aborted) {
          setVersionsLoading(false)
        }
      }
    },
    [selectedProjectId, token],
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
    void loadVersions(offset, controller.signal)

    return () => {
      controller.abort()
    }
  }, [loadVersions, offset])

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
    } catch (error) {
      setAuthError(getErrorMessage(error))
    } finally {
      setAuthLoading(false)
    }
  }

  function handleSaveToken() {
    const nextToken = tempToken.trim()
    setToken(nextToken)
    setOffset(0)

    if (!nextToken) {
      window.localStorage.removeItem(TOKEN_STORAGE_KEY)
      setProjects([])
      setSelectedProjectId("")
      return
    }

    setAuthError(null)
    window.localStorage.setItem(TOKEN_STORAGE_KEY, nextToken)
  }

  async function handleCreateVersion(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!token) {
      setSubmitMessage("请先登录或提供有效 JWT。")
      return
    }

    if (!selectedProjectId) {
      setSubmitMessage("请先选择一个项目。")
      return
    }

    setSubmitLoading(true)
    setSubmitMessage(null)

    try {
      const payload = toCreateInput(form)
      if (!payload.version || !payload.download_url) {
        setSubmitMessage("version 与 download_url 为必填项。")
        return
      }

      await createVersion(token, selectedProjectId, payload)
      setSubmitMessage("版本已发布。")
      setForm(emptyVersionForm)
      setOffset(0)
      await loadVersions(0)
    } catch (error) {
      if (isAuthError(error)) {
        setToken("")
        setTempToken("")
        window.localStorage.removeItem(TOKEN_STORAGE_KEY)
        setAuthError("登录状态已过期，请重新登录。")
      }
      setSubmitMessage(getErrorMessage(error))
    } finally {
      setSubmitLoading(false)
    }
  }

  return (
    <main className="min-h-svh bg-[linear-gradient(140deg,#0f172a_0%,#1e293b_50%,#0b1224_100%)] text-slate-100">
      <div className="mx-auto w-full max-w-7xl space-y-6 px-4 py-8 sm:px-8 sm:py-10">
        <section className="rounded-3xl border border-cyan-200/20 bg-white/8 p-6 shadow-2xl backdrop-blur-md">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-2">
              <p className="inline-flex items-center gap-2 rounded-full border border-cyan-200/25 bg-cyan-200/10 px-3 py-1 text-xs tracking-[0.16em] text-cyan-100 uppercase">
                <ListTree className="size-3.5" />
                Verhub Versions
              </p>
              <h1 className="text-2xl font-semibold sm:text-3xl">版本发布工作台</h1>
              <p className="max-w-3xl text-sm text-slate-200/90 sm:text-base">选择项目后可分页查看历史版本，并发布新版本（支持平台、强更与扩展 JSON 元数据）。</p>
            </div>
            <Button
              type="button"
              variant="outline"
              className="border-white/30 bg-white/10 hover:bg-white/20"
              onClick={() => {
                void loadProjects()
                void loadVersions(offset)
              }}
              disabled={!hasToken || versionsLoading || projectsLoading}
            >
              {versionsLoading || projectsLoading ? <Loader2 className="size-4 animate-spin" /> : <RefreshCcw className="size-4" />}
              刷新
            </Button>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.1fr_1.9fr]">
          <article className="space-y-6 rounded-3xl border border-white/15 bg-black/25 p-5 shadow-xl">
            <div className="space-y-2">
              <h2 className="text-lg font-semibold">管理员登录</h2>
              <p className="text-sm text-slate-300">支持账号密码换取 JWT，也可粘贴已有 token。</p>
            </div>

            <form className="space-y-3" onSubmit={handleLogin}>
              <input
                type="text"
                placeholder="用户名"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                className="w-full rounded-xl border border-white/20 bg-white/5 px-3 py-2 text-sm outline-none ring-cyan-300 transition focus:ring-2"
                required
              />
              <input
                type="password"
                placeholder="密码"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="w-full rounded-xl border border-white/20 bg-white/5 px-3 py-2 text-sm outline-none ring-cyan-300 transition focus:ring-2"
                required
              />
              <Button type="submit" className="w-full bg-cyan-200 text-slate-900 hover:bg-cyan-100" disabled={authLoading}>
                {authLoading ? <Loader2 className="size-4 animate-spin" /> : null}
                获取访问令牌
              </Button>
            </form>

            <div className="space-y-2">
              <label className="text-sm text-slate-300" htmlFor="version-token-input">
                JWT Token
              </label>
              <textarea
                id="version-token-input"
                value={tempToken}
                onChange={(event) => setTempToken(event.target.value)}
                rows={5}
                className="w-full rounded-xl border border-white/20 bg-white/5 px-3 py-2 text-xs outline-none ring-cyan-300 transition focus:ring-2"
                placeholder="Bearer 后面的 token"
              />
              <Button type="button" variant="secondary" className="w-full" onClick={handleSaveToken}>
                保存并应用 Token
              </Button>
            </div>

            <div className="space-y-2">
              <label className="text-sm text-slate-300" htmlFor="project-select">
                目标项目
              </label>
              <select
                id="project-select"
                className="w-full rounded-xl border border-white/20 bg-white/8 px-3 py-2 text-sm outline-none ring-cyan-300 transition focus:ring-2"
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

          <article className="space-y-6 rounded-3xl border border-white/15 bg-white/8 p-5 shadow-xl backdrop-blur">
            <div className="space-y-2">
              <h2 className="text-lg font-semibold">发布新版本</h2>
              <p className="text-sm text-slate-200/90">与后端 CreateVersionDto 对齐：version 与 download_url 必填，custom_data 需为 JSON 对象。</p>
            </div>

            <form className="grid gap-3" onSubmit={handleCreateVersion}>
              <input
                type="text"
                placeholder="版本号（例如 2.3.0）"
                value={form.version}
                onChange={(event) => setForm((prev) => ({ ...prev, version: event.target.value }))}
                className="rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-sm outline-none ring-cyan-300 transition focus:ring-2"
                required
                maxLength={64}
              />
              <input
                type="url"
                placeholder="下载地址"
                value={form.download_url}
                onChange={(event) => setForm((prev) => ({ ...prev, download_url: event.target.value }))}
                className="rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-sm outline-none ring-cyan-300 transition focus:ring-2"
                required
                maxLength={2048}
              />
              <input
                type="text"
                placeholder="标题（可选）"
                value={form.title}
                onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
                className="rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-sm outline-none ring-cyan-300 transition focus:ring-2"
                maxLength={128}
              />
              <textarea
                placeholder="更新内容（可选）"
                value={form.content}
                onChange={(event) => setForm((prev) => ({ ...prev, content: event.target.value }))}
                rows={4}
                className="rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-sm outline-none ring-cyan-300 transition focus:ring-2"
                maxLength={4096}
              />

              <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
                <select
                  aria-label="版本平台"
                  value={form.platform}
                  onChange={(event) => setForm((prev) => ({ ...prev, platform: event.target.value as "" | ClientPlatform }))}
                  className="rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-sm outline-none ring-cyan-300 transition focus:ring-2"
                >
                  <option value="">全部平台（默认）</option>
                  {platformOptions.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
                <label className="inline-flex items-center gap-2 text-sm text-slate-200">
                  <input
                    type="checkbox"
                    checked={form.forced}
                    onChange={(event) => setForm((prev) => ({ ...prev, forced: event.target.checked }))}
                    className="size-4 rounded border-white/30 bg-white/10"
                  />
                  强制更新
                </label>
              </div>

              <textarea
                placeholder='custom_data（可选 JSON 对象，例如 {"channel":"beta"}）'
                value={form.custom_data}
                onChange={(event) => setForm((prev) => ({ ...prev, custom_data: event.target.value }))}
                rows={4}
                className="rounded-xl border border-white/20 bg-white/10 px-3 py-2 font-mono text-xs outline-none ring-cyan-300 transition focus:ring-2"
              />

              <Button type="submit" className="bg-emerald-300 text-emerald-950 hover:bg-emerald-200" disabled={submitLoading || !selectedProjectId}>
                {submitLoading ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
                发布版本
              </Button>

              {submitMessage ? (
                <p className="inline-flex items-center gap-2 text-sm text-slate-100">
                  <CheckCircle2 className="size-4 text-emerald-300" />
                  {submitMessage}
                </p>
              ) : null}
            </form>
          </article>
        </section>

        <section className="rounded-3xl border border-white/15 bg-black/25 p-5 shadow-xl">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">版本列表</h2>
            <p className="text-sm text-slate-300">
              共 {totalVersions} 条，当前第 {page}/{totalPages} 页
            </p>
          </div>

          {!hasToken ? <div className="rounded-2xl border border-dashed border-cyan-200/30 bg-cyan-100/5 p-6 text-sm text-cyan-100">请先登录或填入 JWT Token 后查看版本数据。</div> : null}

          {hasToken && !selectedProjectId ? (
            <div className="rounded-2xl border border-dashed border-white/20 bg-white/5 p-6 text-sm text-slate-300">暂无项目，请先去项目管理页创建项目。</div>
          ) : null}

          {hasToken && selectedProjectId && versionsLoading ? (
            <div className="flex items-center gap-2 rounded-2xl border border-white/15 bg-white/5 p-6 text-sm text-slate-200">
              <Loader2 className="size-4 animate-spin" />
              正在加载版本列表...
            </div>
          ) : null}

          {hasToken && selectedProjectId && !versionsLoading && versionsError ? (
            <div className="rounded-2xl border border-rose-300/30 bg-rose-300/10 p-6 text-sm text-rose-200">{versionsError}</div>
          ) : null}

          {hasToken && selectedProjectId && !versionsLoading && !versionsError && versions.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/20 bg-white/5 p-6 text-sm text-slate-300">暂无版本，使用上方表单发布第一条版本记录。</div>
          ) : null}

          {hasToken && selectedProjectId && !versionsLoading && !versionsError && versions.length > 0 ? (
            <div className="space-y-3">
              {versions.map((version) => (
                <article key={version.id} className="rounded-2xl border border-white/15 bg-white/8 p-4">
                  <div className="space-y-1">
                    <p className="text-base font-medium">{version.version}</p>
                    <p className="text-xs text-slate-300">创建于 {new Date(version.created_at).toLocaleString("zh-CN")}</p>
                    <p className="text-sm text-slate-200/90">{version.title ?? "无标题"}</p>
                    {version.content ? <p className="text-sm text-slate-300">{version.content}</p> : null}
                    <a className="text-sm text-cyan-200 underline-offset-2 hover:underline" href={version.download_url} target="_blank" rel="noreferrer">
                      {version.download_url}
                    </a>
                    <p className="text-xs text-slate-300">
                      平台：{version.platform ?? "全部"} | 强更：{version.forced ? "是" : "否"}
                    </p>
                  </div>
                </article>
              ))}

              <div className="flex flex-wrap justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  className="border-white/20 bg-white/5"
                  disabled={offset === 0}
                  onClick={() => setOffset((prev) => Math.max(0, prev - VERSION_PAGE_SIZE))}
                >
                  上一页
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="border-white/20 bg-white/5"
                  disabled={offset + VERSION_PAGE_SIZE >= totalVersions}
                  onClick={() => setOffset((prev) => prev + VERSION_PAGE_SIZE)}
                >
                  下一页
                </Button>
              </div>
            </div>
          ) : null}
        </section>
      </div>
    </main>
  )
}
