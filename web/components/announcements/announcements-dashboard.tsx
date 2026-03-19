"use client"

import * as React from "react"
import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  Loader2,
  PencilLine,
  Pin,
  Plus,
  RefreshCcw,
  Trash2,
} from "lucide-react"

import { Button } from "@workspace/ui/components/button"

import {
  createAnnouncement,
  deleteAnnouncement,
  listAnnouncements,
  updateAnnouncement,
  type AnnouncementItem,
  type AnnouncementMutationInput,
} from "@/lib/announcements-api"
import { ApiError, isAuthError } from "@/lib/api-client"
import { listProjects, loginAdmin, type ProjectItem } from "@/lib/projects-api"

const TOKEN_STORAGE_KEY = "verhub-admin-token"
const PROJECT_PAGE_SIZE = 100
const PAGE_SIZE = 10

type AnnouncementFormState = {
  title: string
  content: string
  is_pinned: boolean
}

const emptyForm: AnnouncementFormState = {
  title: "",
  content: "",
  is_pinned: false,
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

function toMutationInput(form: AnnouncementFormState): AnnouncementMutationInput {
  return {
    title: form.title.trim(),
    content: form.content.trim(),
    is_pinned: form.is_pinned,
  }
}

export function AnnouncementsDashboard() {
  const [token, setToken] = React.useState("")
  const [tempToken, setTempToken] = React.useState("")
  const [username, setUsername] = React.useState("")
  const [password, setPassword] = React.useState("")
  const [authLoading, setAuthLoading] = React.useState(false)
  const [authError, setAuthError] = React.useState<string | null>(null)

  const [projects, setProjects] = React.useState<ProjectItem[]>([])
  const [projectsLoading, setProjectsLoading] = React.useState(false)
  const [selectedProjectId, setSelectedProjectId] = React.useState("")

  const [announcements, setAnnouncements] = React.useState<AnnouncementItem[]>([])
  const [total, setTotal] = React.useState(0)
  const [offset, setOffset] = React.useState(0)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const [form, setForm] = React.useState<AnnouncementFormState>(emptyForm)
  const [editingId, setEditingId] = React.useState<string | null>(null)
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

  const loadAnnouncements = React.useCallback(
    async (nextOffset: number, signal?: AbortSignal) => {
      if (!token || !selectedProjectId) {
        setAnnouncements([])
        setTotal(0)
        return
      }

      setLoading(true)
      setError(null)

      try {
        const response = await listAnnouncements(
          token,
          selectedProjectId,
          { limit: PAGE_SIZE, offset: nextOffset },
          signal,
        )
        setAnnouncements(response.data)
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
        setAnnouncements([])
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
    void loadAnnouncements(offset, controller.signal)

    return () => {
      controller.abort()
    }
  }, [loadAnnouncements, offset])

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
    setAnnouncements([])
    setTotal(0)
  }

  function beginEdit(item: AnnouncementItem) {
    setEditingId(item.id)
    setForm({
      title: item.title,
      content: item.content,
      is_pinned: item.is_pinned,
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

    const payload = toMutationInput(form)
    if (!payload.title || !payload.content) {
      setSubmitMessage("title 与 content 为必填项。")
      return
    }

    setSubmitLoading(true)
    setSubmitMessage(null)

    try {
      if (editingId) {
        await updateAnnouncement(token, selectedProjectId, editingId, payload)
        setSubmitMessage("公告已更新。")
      } else {
        await createAnnouncement(token, selectedProjectId, payload)
        setSubmitMessage("公告已发布。")
      }

      resetForm()
      setOffset(0)
      await loadAnnouncements(0)
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

    const confirmed = window.confirm("确认删除这个公告吗？该操作不可撤销。")
    if (!confirmed) {
      return
    }

    try {
      await deleteAnnouncement(token, selectedProjectId, id)
      const nextOffset = announcements.length === 1 && offset > 0 ? Math.max(0, offset - PAGE_SIZE) : offset
      setOffset(nextOffset)
      await loadAnnouncements(nextOffset)
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
    <main className="min-h-svh bg-[linear-gradient(145deg,#0b1324_0%,#111827_45%,#1f2937_100%)] text-slate-100">
      <div className="mx-auto w-full max-w-7xl space-y-6 px-4 py-8 sm:px-8 sm:py-10">
        <section className="rounded-3xl border border-amber-200/20 bg-white/8 p-6 shadow-2xl backdrop-blur-md">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-2">
              <p className="inline-flex items-center gap-2 rounded-full border border-amber-200/25 bg-amber-200/10 px-3 py-1 text-xs tracking-[0.16em] text-amber-100 uppercase">
                <Bell className="size-3.5" />
                Verhub Announcements
              </p>
              <h1 className="text-2xl font-semibold sm:text-3xl">公告管理工作台</h1>
              <p className="max-w-3xl text-sm text-slate-200/90 sm:text-base">按项目管理公告列表，支持发布、编辑、删除与置顶能力。</p>
            </div>
            <Button
              type="button"
              variant="outline"
              className="border-white/30 bg-white/10 hover:bg-white/20"
              onClick={() => {
                void loadProjects()
                void loadAnnouncements(offset)
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
                className="w-full rounded-xl border border-white/20 bg-white/5 px-3 py-2 text-sm outline-none ring-amber-300 transition focus:ring-2"
                required
              />
              <input
                type="password"
                placeholder="密码"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="w-full rounded-xl border border-white/20 bg-white/5 px-3 py-2 text-sm outline-none ring-amber-300 transition focus:ring-2"
                required
              />
              <Button type="submit" className="w-full bg-amber-200 text-slate-900 hover:bg-amber-100" disabled={authLoading}>
                {authLoading ? <Loader2 className="size-4 animate-spin" /> : null}
                获取访问令牌
              </Button>
            </form>

            <div className="space-y-2">
              <label className="text-sm text-slate-300" htmlFor="announcement-token-input">
                JWT Token
              </label>
              <textarea
                id="announcement-token-input"
                value={tempToken}
                onChange={(event) => setTempToken(event.target.value)}
                rows={5}
                className="w-full rounded-xl border border-white/20 bg-white/5 px-3 py-2 text-xs outline-none ring-amber-300 transition focus:ring-2"
                placeholder="Bearer 后面的 token"
              />
              <Button type="button" variant="secondary" className="w-full" onClick={saveToken}>
                保存并应用 Token
              </Button>
            </div>

            <div className="space-y-2">
              <label className="text-sm text-slate-300" htmlFor="announcement-project-select">
                目标项目
              </label>
              <select
                id="announcement-project-select"
                className="w-full rounded-xl border border-white/20 bg-white/8 px-3 py-2 text-sm outline-none ring-amber-300 transition focus:ring-2"
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
              <h2 className="text-lg font-semibold">发布或编辑公告</h2>
              <p className="text-sm text-slate-200/90">title 与 content 为必填，支持置顶标记。</p>
            </div>

            <form className="grid gap-3" onSubmit={handleSubmit}>
              <input
                type="text"
                placeholder="公告标题"
                value={form.title}
                onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
                className="rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-sm outline-none ring-amber-300 transition focus:ring-2"
                required
                maxLength={128}
              />
              <textarea
                placeholder="公告内容"
                value={form.content}
                onChange={(event) => setForm((prev) => ({ ...prev, content: event.target.value }))}
                rows={6}
                className="rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-sm outline-none ring-amber-300 transition focus:ring-2"
                required
                maxLength={4096}
              />

              <label className="inline-flex items-center gap-2 text-sm text-slate-200">
                <input
                  type="checkbox"
                  checked={form.is_pinned}
                  onChange={(event) => setForm((prev) => ({ ...prev, is_pinned: event.target.checked }))}
                  className="size-4 rounded border-white/30 bg-white/10"
                />
                置顶公告
              </label>

              <div className="flex flex-wrap gap-2">
                <Button type="submit" className="bg-emerald-300 text-emerald-950 hover:bg-emerald-200" disabled={submitLoading || !selectedProjectId}>
                  {submitLoading ? <Loader2 className="size-4 animate-spin" /> : editingId ? <PencilLine className="size-4" /> : <Plus className="size-4" />}
                  {editingId ? "保存修改" : "发布公告"}
                </Button>
                <Button type="button" variant="outline" className="border-white/25 bg-white/5" onClick={resetForm}>
                  清空表单
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
            <h2 className="text-lg font-semibold">公告列表</h2>
            <p className="text-sm text-slate-300">
              共 {total} 条，当前第 {page}/{totalPages} 页
            </p>
          </div>

          {!hasToken ? (
            <div className="rounded-2xl border border-dashed border-amber-200/30 bg-amber-100/5 p-6 text-sm text-amber-100">请先登录或填入 JWT Token 后查看公告数据。</div>
          ) : null}

          {hasToken && !selectedProjectId ? (
            <div className="rounded-2xl border border-dashed border-white/20 bg-white/5 p-6 text-sm text-slate-300">暂无项目，请先去项目管理页创建项目。</div>
          ) : null}

          {hasToken && selectedProjectId && loading ? (
            <div className="flex items-center gap-2 rounded-2xl border border-white/15 bg-white/5 p-6 text-sm text-slate-200">
              <Loader2 className="size-4 animate-spin" />
              正在加载公告列表...
            </div>
          ) : null}

          {hasToken && selectedProjectId && !loading && error ? (
            <div className="rounded-2xl border border-rose-300/30 bg-rose-300/10 p-6 text-sm text-rose-200">{error}</div>
          ) : null}

          {hasToken && selectedProjectId && !loading && !error && announcements.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/20 bg-white/5 p-6 text-sm text-slate-300">暂无公告，使用上方表单发布第一条公告。</div>
          ) : null}

          {hasToken && selectedProjectId && !loading && !error && announcements.length > 0 ? (
            <div className="space-y-3">
              {announcements.map((item) => (
                <article key={item.id} className="rounded-2xl border border-white/15 bg-white/8 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1">
                      <p className="text-base font-medium">{item.title}</p>
                      <p className="text-xs text-slate-300">创建于 {new Date(item.created_at).toLocaleString("zh-CN")}</p>
                      <p className="text-xs text-slate-300">更新于 {new Date(item.updated_at).toLocaleString("zh-CN")}</p>
                      {item.is_pinned ? (
                        <p className="inline-flex items-center gap-1 rounded-full border border-amber-300/35 bg-amber-300/12 px-2 py-0.5 text-xs text-amber-200">
                          <Pin className="size-3" />
                          置顶
                        </p>
                      ) : null}
                      <p className="text-sm leading-relaxed text-slate-200/90">{item.content}</p>
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
