"use client"

import * as React from "react"
import { AlertTriangle, CheckCircle2, Loader2, PencilLine, Pin, Plus, Trash2 } from "lucide-react"

import { Button } from "@workspace/ui/components/button"

import { AdminCard, AdminItemCard } from "@/components/admin/admin-card"
import { AdminListHeader, AdminPagination } from "@/components/admin/admin-list"
import {
  createAnnouncement,
  deleteAnnouncement,
  listAnnouncements,
  updateAnnouncement,
  type AnnouncementItem,
  type AnnouncementMutationInput,
} from "@/lib/announcements-api"
import { ApiError, isAuthError } from "@/lib/api-client"
import { getSessionToken } from "@/lib/auth-session"
import { AdminPageHeader } from "@/components/admin/admin-page-header"
import { useSharedProjectSelection } from "@/hooks/use-shared-project-selection"
import { listProjects, type ProjectItem } from "@/lib/projects-api"

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
  const [token, setToken] = React.useState(() => getSessionToken().trim())
  const [authError, setAuthError] = React.useState<string | null>(null)

  const [projects, setProjects] = React.useState<ProjectItem[]>([])
  const [projectsLoading, setProjectsLoading] = React.useState(false)
  const { selectedProjectId, setSelectedProjectId } = useSharedProjectSelection()

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
      const hasCurrent = response.data.some((project) => project.id === selectedProjectId)
      if (hasCurrent) {
        return
      }

      const firstProject = response.data[0]
      if (firstProject) {
        setSelectedProjectId(firstProject.id)
      } else {
        setSelectedProjectId("")
      }
    } catch (loadError) {
      if (isAuthError(loadError)) {
        setToken("")
        setAuthError("登录状态已过期，请重新登录。")
      }
      setAuthError(getErrorMessage(loadError))
      setProjects([])
      setSelectedProjectId("")
    } finally {
      setProjectsLoading(false)
    }
  }, [selectedProjectId, setSelectedProjectId, token])

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
      setSubmitMessage("请先登录后再操作。")
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
      const nextOffset =
        announcements.length === 1 && offset > 0 ? Math.max(0, offset - PAGE_SIZE) : offset
      setOffset(nextOffset)
      await loadAnnouncements(nextOffset)
    } catch (deleteError) {
      if (isAuthError(deleteError)) {
        setToken("")
        setAuthError("登录状态已过期，请重新登录。")
      }
      setError(getErrorMessage(deleteError))
    }
  }

  return (
    <section className="space-y-6">
      <AdminPageHeader
        title="公告发布中心"
        description="维护项目公告、置顶状态与历史记录，确保版本更新和运营通知及时触达。"
        badge="Verhub Announcements"
      />

      <section className="grid gap-6 lg:grid-cols-[1.1fr_1.9fr]">
        <AdminCard className="space-y-6">
          <div className="space-y-2">
            <h2 className="text-lg font-semibold">项目选择</h2>
          </div>

          <div className="space-y-2">
            <label className="text-sm text-slate-300" htmlFor="announcement-project-select">
              目标项目
            </label>
            <select
              id="announcement-project-select"
              className="w-full rounded-xl border border-white/20 bg-white/8 px-3 py-2 text-sm ring-amber-300 transition outline-none focus:ring-2"
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
        </AdminCard>

        <AdminCard className="space-y-6">
          <div className="space-y-2">
            <h2 className="text-lg font-semibold">发布或编辑公告</h2>
            <p className="text-sm text-slate-200/90">title 与 content 为必填，支持置顶标记。</p>
          </div>

          <form className="grid gap-3" onSubmit={handleSubmit}>
            <label className="space-y-1 text-sm">
              <span className="text-slate-700 dark:text-slate-300">公告标题</span>
              <input
                type="text"
                placeholder="输入简短且明确的标题"
                value={form.title}
                onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
                className="w-full rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-sm ring-amber-300 transition outline-none focus:ring-2"
                required
                maxLength={128}
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-slate-700 dark:text-slate-300">公告内容</span>
              <textarea
                placeholder="说明影响范围、动作和截止时间"
                value={form.content}
                onChange={(event) => setForm((prev) => ({ ...prev, content: event.target.value }))}
                rows={6}
                className="w-full rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-sm ring-amber-300 transition outline-none focus:ring-2"
                required
                maxLength={4096}
              />
            </label>

            <label className="inline-flex items-center gap-2 text-sm text-slate-200">
              <input
                type="checkbox"
                checked={form.is_pinned}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, is_pinned: event.target.checked }))
                }
                className="size-4 rounded border-white/30 bg-white/10"
              />
              置顶公告
            </label>

            <div className="flex flex-wrap gap-2">
              <Button
                type="submit"
                className="bg-emerald-300 text-emerald-950 hover:bg-emerald-200"
                disabled={submitLoading || !selectedProjectId}
              >
                {submitLoading ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : editingId ? (
                  <PencilLine className="size-4" />
                ) : (
                  <Plus className="size-4" />
                )}
                {editingId ? "保存修改" : "发布公告"}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="border-white/25 bg-white/5"
                onClick={resetForm}
              >
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
        </AdminCard>
      </section>

      <AdminCard as="section">
        <AdminListHeader title="公告列表" total={total} page={page} totalPages={totalPages} />

        {!hasToken ? (
          <div className="rounded-2xl border border-dashed border-amber-200/30 bg-amber-100/5 p-6 text-sm text-amber-100">
            请先在登录页完成登录后查看公告数据。
          </div>
        ) : null}

        {hasToken && !selectedProjectId ? (
          <div className="rounded-2xl border border-dashed border-white/20 bg-white/5 p-6 text-sm text-slate-300">
            暂无项目，请先去项目管理页创建项目。
          </div>
        ) : null}

        {hasToken && selectedProjectId && loading ? (
          <div className="flex items-center gap-2 rounded-2xl border border-white/15 bg-white/5 p-6 text-sm text-slate-200">
            <Loader2 className="size-4 animate-spin" />
            正在加载公告列表...
          </div>
        ) : null}

        {hasToken && selectedProjectId && !loading && error ? (
          <div className="rounded-2xl border border-rose-300/30 bg-rose-300/10 p-6 text-sm text-rose-200">
            {error}
          </div>
        ) : null}

        {hasToken && selectedProjectId && !loading && !error && announcements.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/20 bg-white/5 p-6 text-sm text-slate-300">
            暂无公告，使用上方表单发布第一条公告。
          </div>
        ) : null}

        {hasToken && selectedProjectId && !loading && !error && announcements.length > 0 ? (
          <div className="space-y-3">
            {announcements.map((item) => (
              <AdminItemCard key={item.id} className="border-white/15 bg-white/8">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <p className="text-base font-medium">{item.title}</p>
                    <p className="text-xs text-slate-300">
                      创建于 {new Date(item.created_at).toLocaleString("zh-CN")}
                    </p>
                    <p className="text-xs text-slate-300">
                      更新于 {new Date(item.updated_at).toLocaleString("zh-CN")}
                    </p>
                    {item.is_pinned ? (
                      <p className="inline-flex items-center gap-1 rounded-full border border-amber-300/35 bg-amber-300/12 px-2 py-0.5 text-xs text-amber-200">
                        <Pin className="size-3" />
                        置顶
                      </p>
                    ) : null}
                    <p className="text-sm leading-relaxed text-slate-200/90">{item.content}</p>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="border-white/20 bg-white/5"
                      onClick={() => beginEdit(item)}
                    >
                      <PencilLine className="size-4" />
                      编辑
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      onClick={() => void handleDelete(item.id)}
                    >
                      <Trash2 className="size-4" />
                      删除
                    </Button>
                  </div>
                </div>
              </AdminItemCard>
            ))}

            <AdminPagination
              hasPrev={offset > 0}
              hasNext={offset + PAGE_SIZE < total}
              onPrev={() => setOffset((prev) => Math.max(0, prev - PAGE_SIZE))}
              onNext={() => setOffset((prev) => prev + PAGE_SIZE)}
            />
          </div>
        ) : null}
      </AdminCard>
    </section>
  )
}
