"use client"

import * as React from "react"
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  Loader2,
  PencilLine,
  Pin,
  Plus,
  Trash2,
} from "lucide-react"

import { Button } from "@workspace/ui/components/button"

import { AdminCard } from "@/components/admin/admin-card"
import { AdminListHeader, AdminPagination } from "@/components/admin/admin-list"
import { ManagementListItem } from "@/components/admin/management-list-item"
import { ProjectApiOverview } from "@/components/admin/project-api-overview"
import { ProjectSelectorCard } from "@/components/admin/project-selector-card"
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
  author: string
  published_at: string
}

const emptyForm: AnnouncementFormState = {
  title: "",
  content: "",
  is_pinned: false,
  author: "",
  published_at: "",
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
    author: form.author.trim() || undefined,
    published_at: form.published_at ? toTimestamp(form.published_at) : undefined,
  }
}

function toDateTimeLocal(value: number): string {
  const date = new Date(value * 1000)
  if (Number.isNaN(date.getTime())) {
    return ""
  }

  const offset = date.getTimezoneOffset()
  const localDate = new Date(date.getTime() - offset * 60_000)
  return localDate.toISOString().slice(0, 16)
}

function toTimestamp(value: string): number | undefined {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return undefined
  }

  return Math.floor(date.getTime() / 1000)
}

export function AnnouncementsDashboard() {
  const [token, setToken] = React.useState(() => getSessionToken().trim())
  const [authError, setAuthError] = React.useState<string | null>(null)

  const [projects, setProjects] = React.useState<ProjectItem[]>([])
  const [projectsLoading, setProjectsLoading] = React.useState(false)
  const { selectedProjectKey, setSelectedProjectKey } = useSharedProjectSelection()

  const [announcements, setAnnouncements] = React.useState<AnnouncementItem[]>([])
  const [total, setTotal] = React.useState(0)
  const [offset, setOffset] = React.useState(0)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const [form, setForm] = React.useState<AnnouncementFormState>(emptyForm)
  const [editingId, setEditingId] = React.useState<string | null>(null)
  const [submitLoading, setSubmitLoading] = React.useState(false)
  const [submitMessage, setSubmitMessage] = React.useState<string | null>(null)

  const selectedProject = React.useMemo(
    () => projects.find((project) => project.id === selectedProjectKey) ?? null,
    [projects, selectedProjectKey],
  )

  const hasToken = token.trim().length > 0
  const page = Math.floor(offset / PAGE_SIZE) + 1
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const loadProjects = React.useCallback(async () => {
    if (!token) {
      setProjects([])
      setSelectedProjectKey("")
      return
    }

    setProjectsLoading(true)
    try {
      const response = await listProjects(token, { limit: PROJECT_PAGE_SIZE, offset: 0 })
      setProjects(response.data)
      const hasCurrent = response.data.some((project) => project.id === selectedProjectKey)
      if (hasCurrent) {
        return
      }

      const firstProject = response.data[0]
      if (firstProject) {
        setSelectedProjectKey(firstProject.id)
      } else {
        setSelectedProjectKey("")
      }
    } catch (loadError) {
      if (isAuthError(loadError)) {
        setToken("")
        setAuthError("登录状态已过期，请重新登录。")
      }
      setAuthError(getErrorMessage(loadError))
      setProjects([])
      setSelectedProjectKey("")
    } finally {
      setProjectsLoading(false)
    }
  }, [selectedProjectKey, setSelectedProjectKey, token])

  const loadAnnouncements = React.useCallback(
    async (nextOffset: number, signal?: AbortSignal) => {
      if (!token || !selectedProjectKey) {
        setAnnouncements([])
        setTotal(0)
        return
      }

      setLoading(true)
      setError(null)

      try {
        const response = await listAnnouncements(
          token,
          selectedProjectKey,
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
    [selectedProjectKey, token],
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
  }, [selectedProjectKey])

  function beginEdit(item: AnnouncementItem) {
    setEditingId(item.id)
    setForm({
      title: item.title,
      content: item.content,
      is_pinned: item.is_pinned,
      author: item.author ?? "",
      published_at: toDateTimeLocal(item.published_at),
    })
    setSubmitMessage(null)
  }

  function copyFromAnnouncement(item: AnnouncementItem) {
    setEditingId(null)
    setForm({
      title: item.title,
      content: item.content,
      is_pinned: item.is_pinned,
      author: item.author ?? "",
      published_at: toDateTimeLocal(item.published_at),
    })
    setSubmitMessage("已复制配置到表单，可直接发布新公告。")
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

    if (!selectedProjectKey) {
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
        await updateAnnouncement(token, selectedProjectKey, editingId, payload)
        setSubmitMessage("公告已更新。")
      } else {
        await createAnnouncement(token, selectedProjectKey, payload)
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
    if (!token || !selectedProjectKey) {
      setError("请先登录并选择项目。")
      return
    }

    const confirmed = window.confirm("确认删除这个公告吗？该操作不可撤销。")
    if (!confirmed) {
      return
    }

    try {
      await deleteAnnouncement(token, selectedProjectKey, id)
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
        <div className="space-y-6">
          <ProjectSelectorCard
            selectId="announcement-project-select"
            selectedProjectKey={selectedProjectKey}
            projects={projects}
            disabled={!hasToken || projectsLoading || projects.length === 0}
            ringClassName="ring-amber-300"
            onChange={setSelectedProjectKey}
            warning={
              authError ? (
                <span className="inline-flex items-center gap-2">
                  <AlertTriangle className="size-4" />
                  {authError}
                </span>
              ) : undefined
            }
          />

          <ProjectApiOverview
            title="API Demo · 公告"
            projectKey={selectedProject?.project_key}
            groups={[
              {
                label: "公开接口",
                endpoints: [
                  {
                    method: "GET",
                    path: "/api/v1/public/{projectKey}/announcements",
                    description: "获取公告列表",
                    auth: { tokenRequired: false },
                  },
                  {
                    method: "GET",
                    path: "/api/v1/public/{projectKey}/announcements/latest",
                    description: "获取最新公告",
                    auth: { tokenRequired: false },
                  },
                ],
              },
              {
                label: "管理接口",
                endpoints: [
                  {
                    method: "GET",
                    path: "/api/v1/admin/projects/{projectKey}/announcements",
                    description: "分页获取公告列表",
                    auth: { tokenRequired: true, tokenType: "管理员 JWT" },
                  },
                  {
                    method: "POST",
                    path: "/api/v1/admin/projects/{projectKey}/announcements",
                    description: "创建公告",
                    auth: { tokenRequired: true, tokenType: "管理员 JWT" },
                    requestBody: {
                      title: "系统维护通知",
                      content: "3 月 25 日晚 22:00-23:00 进行维护",
                      is_pinned: false,
                      author: "ops-bot",
                      published_at: 1774476000000,
                    },
                  },
                  {
                    method: "PATCH",
                    path: "/api/v1/admin/projects/{projectKey}/announcements/{id}",
                    description: "更新公告",
                    auth: { tokenRequired: true, tokenType: "管理员 JWT" },
                    requestBody: {
                      title: "系统维护通知（延期）",
                      content: "维护窗口改为 23:00-24:00",
                    },
                  },
                  {
                    method: "DELETE",
                    path: "/api/v1/admin/projects/{projectKey}/announcements/{id}",
                    description: "删除公告",
                    auth: { tokenRequired: true, tokenType: "管理员 JWT" },
                  },
                ],
              },
            ]}
          />
        </div>

        <AdminCard className="space-y-6">
          <div className="space-y-2">
            <h2 className="text-lg font-semibold">发布或编辑公告</h2>
            <p className="text-sm text-slate-200/90">
              title 与 content 为必填，支持作者与发布时间配置。
            </p>
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

            <label className="space-y-1 text-sm">
              <span className="text-slate-700 dark:text-slate-300">发布时间</span>
              <input
                type="datetime-local"
                value={form.published_at}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, published_at: event.target.value }))
                }
                className="w-full rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-sm ring-amber-300 transition outline-none focus:ring-2"
              />
            </label>

            <label className="space-y-1 text-sm">
              <span className="text-slate-700 dark:text-slate-300">作者</span>
              <input
                type="text"
                placeholder="例如：运营团队"
                value={form.author}
                onChange={(event) => setForm((prev) => ({ ...prev, author: event.target.value }))}
                className="w-full rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-sm ring-amber-300 transition outline-none focus:ring-2"
                maxLength={64}
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
                disabled={submitLoading || !selectedProjectKey}
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

        {hasToken && !selectedProjectKey ? (
          <div className="rounded-2xl border border-dashed border-white/20 bg-white/5 p-6 text-sm text-slate-300">
            暂无项目，请先去项目管理页创建项目。
          </div>
        ) : null}

        {hasToken && selectedProjectKey && loading ? (
          <div className="flex items-center gap-2 rounded-2xl border border-white/15 bg-white/5 p-6 text-sm text-slate-200">
            <Loader2 className="size-4 animate-spin" />
            正在加载公告列表...
          </div>
        ) : null}

        {hasToken && selectedProjectKey && !loading && error ? (
          <div className="rounded-2xl border border-rose-300/30 bg-rose-300/10 p-6 text-sm text-rose-200">
            {error}
          </div>
        ) : null}

        {hasToken && selectedProjectKey && !loading && !error && announcements.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/20 bg-white/5 p-6 text-sm text-slate-300">
            暂无公告，使用上方表单发布第一条公告。
          </div>
        ) : null}

        {hasToken && selectedProjectKey && !loading && !error && announcements.length > 0 ? (
          <div className="space-y-3">
            {announcements.map((item) => (
              <ManagementListItem
                key={item.id}
                title={item.title}
                meta={
                  <>
                    <p>发布时间 {new Date(item.published_at * 1000).toLocaleString("zh-CN")}</p>
                    <p>创建于 {new Date(item.created_at * 1000).toLocaleString("zh-CN")}</p>
                    <p>更新于 {new Date(item.updated_at * 1000).toLocaleString("zh-CN")}</p>
                    <p>作者：{item.author ?? "未填写"}</p>
                  </>
                }
                content={
                  <>
                    {item.is_pinned ? (
                      <span className="mb-2 inline-flex items-center gap-1 rounded-full border border-amber-300/35 bg-amber-300/12 px-2 py-0.5 text-xs text-amber-200">
                        <Pin className="size-3" />
                        置顶
                      </span>
                    ) : null}
                    <p className="leading-relaxed">{item.content}</p>
                  </>
                }
                actions={
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      className="border-white/20 bg-white/5"
                      onClick={() => copyFromAnnouncement(item)}
                    >
                      <Copy className="size-4" />
                      复制配置
                    </Button>
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
                  </>
                }
              />
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
