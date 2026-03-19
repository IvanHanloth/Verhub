"use client"

import * as React from "react"
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  MessageSquare,
  PencilLine,
  RefreshCcw,
  Save,
  Trash2,
} from "lucide-react"

import { Button } from "@workspace/ui/components/button"

import { ApiError, isAuthError } from "@/lib/api-client"
import {
  deleteFeedback,
  listFeedbacks,
  updateFeedback,
  type ClientPlatform,
  type FeedbackItem,
  type FeedbackMutationInput,
} from "@/lib/feedbacks-api"
import { listProjects, loginAdmin, type ProjectItem } from "@/lib/projects-api"

const TOKEN_STORAGE_KEY = "verhub-admin-token"
const PROJECT_PAGE_SIZE = 100
const PAGE_SIZE = 10

const platformOptions: Array<{ label: string; value: ClientPlatform }> = [
  { label: "iOS", value: "ios" },
  { label: "Android", value: "android" },
  { label: "Windows", value: "windows" },
  { label: "macOS", value: "mac" },
  { label: "Web", value: "web" },
]

type FeedbackFormState = {
  user_id: string
  rating: string
  content: string
  platform: "" | ClientPlatform
  custom_data: string
}

const emptyForm: FeedbackFormState = {
  user_id: "",
  rating: "",
  content: "",
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

function parseJsonObject(value: string): Record<string, unknown> | undefined {
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

function toMutationInput(form: FeedbackFormState): FeedbackMutationInput {
  const payload: FeedbackMutationInput = {
    content: form.content.trim(),
    user_id: form.user_id.trim() || undefined,
    platform: form.platform || undefined,
    custom_data: parseJsonObject(form.custom_data),
  }

  const ratingValue = form.rating.trim()
  if (ratingValue) {
    payload.rating = Number(ratingValue)
  }

  return payload
}

function toPrettyJson(value: unknown): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return ""
  }

  return JSON.stringify(value, null, 2)
}

export function FeedbacksDashboard() {
  const [token, setToken] = React.useState("")
  const [tempToken, setTempToken] = React.useState("")
  const [username, setUsername] = React.useState("")
  const [password, setPassword] = React.useState("")
  const [authLoading, setAuthLoading] = React.useState(false)
  const [authError, setAuthError] = React.useState<string | null>(null)

  const [projects, setProjects] = React.useState<ProjectItem[]>([])
  const [projectsLoading, setProjectsLoading] = React.useState(false)
  const [selectedProjectId, setSelectedProjectId] = React.useState("")

  const [feedbacks, setFeedbacks] = React.useState<FeedbackItem[]>([])
  const [total, setTotal] = React.useState(0)
  const [offset, setOffset] = React.useState(0)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const [editingId, setEditingId] = React.useState<string | null>(null)
  const [form, setForm] = React.useState<FeedbackFormState>(emptyForm)
  const [submitLoading, setSubmitLoading] = React.useState(false)
  const [submitMessage, setSubmitMessage] = React.useState<string | null>(null)

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

  const loadFeedbacks = React.useCallback(
    async (nextOffset: number, signal?: AbortSignal) => {
      if (!token || !selectedProjectId) {
        setFeedbacks([])
        setTotal(0)
        return
      }

      setLoading(true)
      setError(null)

      try {
        const response = await listFeedbacks(
          token,
          selectedProjectId,
          { limit: PAGE_SIZE, offset: nextOffset },
          signal,
        )
        setFeedbacks(response.data)
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
        setFeedbacks([])
        setTotal(0)
      } finally {
        if (!signal?.aborted) {
          setLoading(false)
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
    void loadFeedbacks(offset, controller.signal)

    return () => {
      controller.abort()
    }
  }, [loadFeedbacks, offset])

  React.useEffect(() => {
    setOffset(0)
    setEditingId(null)
    setForm(emptyForm)
    setSubmitMessage(null)
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
    setFeedbacks([])
    setTotal(0)
  }

  function beginEdit(item: FeedbackItem) {
    setEditingId(item.id)
    setForm({
      user_id: item.user_id ?? "",
      rating: item.rating ? String(item.rating) : "",
      content: item.content,
      platform: item.platform ?? "",
      custom_data: toPrettyJson(item.custom_data),
    })
    setSubmitMessage(null)
  }

  function resetForm() {
    setEditingId(null)
    setForm(emptyForm)
    setSubmitMessage(null)
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!token) {
      setSubmitMessage("请先登录或填写有效 JWT。")
      return
    }

    if (!selectedProjectId) {
      setSubmitMessage("请先选择项目。")
      return
    }

    if (!editingId) {
      setSubmitMessage("请先从列表中选择要编辑的反馈。")
      return
    }

    setSubmitLoading(true)
    setSubmitMessage(null)

    try {
      const payload = toMutationInput(form)
      const ratingValue = payload.rating
      if (ratingValue !== undefined && (!Number.isInteger(ratingValue) || ratingValue < 1 || ratingValue > 5)) {
        setSubmitMessage("rating 需为 1-5 的整数。")
        return
      }

      if (!payload.content) {
        setSubmitMessage("content 不能为空。")
        return
      }

      await updateFeedback(token, selectedProjectId, editingId, payload)
      setSubmitMessage("反馈已更新。")
      await loadFeedbacks(offset)
    } catch (submitError) {
      if (isAuthError(submitError)) {
        setToken("")
        setTempToken("")
        window.localStorage.removeItem(TOKEN_STORAGE_KEY)
        setAuthError("登录状态已过期，请重新登录。")
      }
      setSubmitMessage(getErrorMessage(submitError))
    } finally {
      setSubmitLoading(false)
    }
  }

  async function handleDelete(id: string) {
    if (!token || !selectedProjectId) {
      setError("请先登录并选择项目。")
      return
    }

    const confirmed = window.confirm("确认删除这条反馈吗？该操作不可撤销。")
    if (!confirmed) {
      return
    }

    try {
      await deleteFeedback(token, selectedProjectId, id)
      const nextOffset = feedbacks.length === 1 && offset > 0 ? Math.max(0, offset - PAGE_SIZE) : offset
      setOffset(nextOffset)
      await loadFeedbacks(nextOffset)
      if (editingId === id) {
        resetForm()
      }
    } catch (deleteError) {
      if (isAuthError(deleteError)) {
        setToken("")
        setTempToken("")
        window.localStorage.removeItem(TOKEN_STORAGE_KEY)
        setAuthError("登录状态已过期，请重新登录。")
      }
      setError(getErrorMessage(deleteError))
    }
  }

  return (
    <main className="min-h-svh bg-[linear-gradient(145deg,#1a1026_0%,#111827_45%,#0b1021_100%)] text-slate-100">
      <div className="mx-auto w-full max-w-7xl space-y-6 px-4 py-8 sm:px-8 sm:py-10">
        <section className="rounded-3xl border border-rose-200/20 bg-white/8 p-6 shadow-2xl backdrop-blur-md">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-2">
              <p className="inline-flex items-center gap-2 rounded-full border border-rose-200/25 bg-rose-200/10 px-3 py-1 text-xs tracking-[0.16em] text-rose-100 uppercase">
                <MessageSquare className="size-3.5" />
                Verhub Feedbacks
              </p>
              <h1 className="text-2xl font-semibold sm:text-3xl">反馈管理工作台</h1>
              <p className="max-w-3xl text-sm text-slate-200/90 sm:text-base">按项目查看用户反馈，支持编辑修订与删除清理。</p>
            </div>
            <Button
              type="button"
              variant="outline"
              className="border-white/30 bg-white/10 hover:bg-white/20"
              onClick={() => {
                void loadProjects()
                void loadFeedbacks(offset)
              }}
              disabled={!hasToken || loading || projectsLoading}
            >
              {loading || projectsLoading ? <Loader2 className="size-4 animate-spin" /> : <RefreshCcw className="size-4" />}
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
                className="w-full rounded-xl border border-white/20 bg-white/5 px-3 py-2 text-sm outline-none ring-rose-300 transition focus:ring-2"
                required
              />
              <input
                type="password"
                placeholder="密码"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="w-full rounded-xl border border-white/20 bg-white/5 px-3 py-2 text-sm outline-none ring-rose-300 transition focus:ring-2"
                required
              />
              <Button type="submit" className="w-full bg-rose-200 text-slate-900 hover:bg-rose-100" disabled={authLoading}>
                {authLoading ? <Loader2 className="size-4 animate-spin" /> : null}
                获取访问令牌
              </Button>
            </form>

            <div className="space-y-2">
              <label className="text-sm text-slate-300" htmlFor="feedback-token-input">
                JWT Token
              </label>
              <textarea
                id="feedback-token-input"
                value={tempToken}
                onChange={(event) => setTempToken(event.target.value)}
                rows={5}
                className="w-full rounded-xl border border-white/20 bg-white/5 px-3 py-2 text-xs outline-none ring-rose-300 transition focus:ring-2"
                placeholder="Bearer 后面的 token"
              />
              <Button type="button" variant="secondary" className="w-full" onClick={saveToken}>
                保存并应用 Token
              </Button>
            </div>

            <div className="space-y-2">
              <label className="text-sm text-slate-300" htmlFor="feedback-project-select">
                目标项目
              </label>
              <select
                id="feedback-project-select"
                className="w-full rounded-xl border border-white/20 bg-white/8 px-3 py-2 text-sm outline-none ring-rose-300 transition focus:ring-2"
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
              <h2 className="text-lg font-semibold">编辑反馈</h2>
              <p className="text-sm text-slate-200/90">先从列表选择一条反馈，再在此修改并保存。</p>
            </div>

            <form className="grid gap-3" onSubmit={handleSubmit}>
              <input
                type="text"
                placeholder="用户 ID（可选）"
                value={form.user_id}
                onChange={(event) => setForm((prev) => ({ ...prev, user_id: event.target.value }))}
                className="rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-sm outline-none ring-rose-300 transition focus:ring-2"
                maxLength={64}
                disabled={!editingId}
              />
              <input
                type="number"
                min={1}
                max={5}
                placeholder="评分 1-5（可选）"
                value={form.rating}
                onChange={(event) => setForm((prev) => ({ ...prev, rating: event.target.value }))}
                className="rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-sm outline-none ring-rose-300 transition focus:ring-2"
                disabled={!editingId}
              />
              <select
                aria-label="反馈平台"
                value={form.platform}
                onChange={(event) => setForm((prev) => ({ ...prev, platform: event.target.value as "" | ClientPlatform }))}
                className="rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-sm outline-none ring-rose-300 transition focus:ring-2"
                disabled={!editingId}
              >
                <option value="">未指定平台</option>
                {platformOptions.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
              <textarea
                placeholder="反馈内容"
                value={form.content}
                onChange={(event) => setForm((prev) => ({ ...prev, content: event.target.value }))}
                rows={5}
                className="rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-sm outline-none ring-rose-300 transition focus:ring-2"
                maxLength={4096}
                disabled={!editingId}
              />
              <textarea
                placeholder='custom_data（可选 JSON 对象，例如 {"channel":"beta"}）'
                value={form.custom_data}
                onChange={(event) => setForm((prev) => ({ ...prev, custom_data: event.target.value }))}
                rows={4}
                className="rounded-xl border border-white/20 bg-white/10 px-3 py-2 font-mono text-xs outline-none ring-rose-300 transition focus:ring-2"
                disabled={!editingId}
              />

              <div className="flex flex-wrap gap-2">
                <Button type="submit" className="bg-emerald-300 text-emerald-950 hover:bg-emerald-200" disabled={submitLoading || !editingId}>
                  {submitLoading ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                  保存反馈
                </Button>
                <Button type="button" variant="outline" className="border-white/25 bg-white/5" onClick={resetForm}>
                  取消编辑
                </Button>
              </div>

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
            <h2 className="text-lg font-semibold">反馈列表</h2>
            <p className="text-sm text-slate-300">
              共 {total} 条，当前第 {page}/{totalPages} 页
            </p>
          </div>

          {!hasToken ? (
            <div className="rounded-2xl border border-dashed border-rose-200/30 bg-rose-100/5 p-6 text-sm text-rose-100">请先登录或填入 JWT Token 后查看反馈数据。</div>
          ) : null}

          {hasToken && !selectedProjectId ? (
            <div className="rounded-2xl border border-dashed border-white/20 bg-white/5 p-6 text-sm text-slate-300">暂无项目，请先去项目管理页创建项目。</div>
          ) : null}

          {hasToken && selectedProjectId && loading ? (
            <div className="flex items-center gap-2 rounded-2xl border border-white/15 bg-white/5 p-6 text-sm text-slate-200">
              <Loader2 className="size-4 animate-spin" />
              正在加载反馈列表...
            </div>
          ) : null}

          {hasToken && selectedProjectId && !loading && error ? (
            <div className="rounded-2xl border border-rose-300/30 bg-rose-300/10 p-6 text-sm text-rose-200">{error}</div>
          ) : null}

          {hasToken && selectedProjectId && !loading && !error && feedbacks.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/20 bg-white/5 p-6 text-sm text-slate-300">暂无反馈，等待客户端上报后在此管理。</div>
          ) : null}

          {hasToken && selectedProjectId && !loading && !error && feedbacks.length > 0 ? (
            <div className="space-y-3">
              {feedbacks.map((item) => (
                <article key={item.id} className="rounded-2xl border border-white/15 bg-white/8 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1">
                      <p className="text-base font-medium">{item.content}</p>
                      <p className="text-xs text-slate-300">创建于 {new Date(item.created_at).toLocaleString("zh-CN")}</p>
                      <p className="text-xs text-slate-300">用户：{item.user_id ?? "匿名"}</p>
                      <p className="text-xs text-slate-300">评分：{item.rating ?? "未评分"}</p>
                      <p className="text-xs text-slate-300">平台：{item.platform ?? "未指定"}</p>
                    </div>

                    <div className="flex gap-2">
                      <Button type="button" variant="outline" className="border-white/20 bg-white/5" onClick={() => beginEdit(item)}>
                        <PencilLine className="size-4" />
                        编辑
                      </Button>
                      <Button type="button" variant="destructive" onClick={() => void handleDelete(item.id)}>
                        <Trash2 className="size-4" />
                        删除
                      </Button>
                    </div>
                  </div>
                </article>
              ))}

              <div className="flex flex-wrap justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  className="border-white/20 bg-white/5"
                  disabled={offset === 0}
                  onClick={() => setOffset((prev) => Math.max(0, prev - PAGE_SIZE))}
                >
                  上一页
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="border-white/20 bg-white/5"
                  disabled={offset + PAGE_SIZE >= total}
                  onClick={() => setOffset((prev) => prev + PAGE_SIZE)}
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
