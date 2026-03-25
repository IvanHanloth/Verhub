"use client"

import * as React from "react"
import { Copy, Loader2, PencilLine, Pin, Plus, Save, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"

import { AdminCard } from "@/components/admin/admin-card"
import { AdminListHeader, AdminPagination } from "@/components/admin/admin-list"
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

const platformOptions: Array<{
  label: string
  value: "ios" | "android" | "windows" | "mac" | "web"
}> = [
  { label: "iOS", value: "ios" },
  { label: "Android", value: "android" },
  { label: "Windows", value: "windows" },
  { label: "macOS", value: "mac" },
  { label: "Web", value: "web" },
]

type AnnouncementFormState = {
  title: string
  content: string
  is_pinned: boolean
  is_hidden: boolean
  platforms: Array<"ios" | "android" | "windows" | "mac" | "web">
  author: string
  published_at: string
}

const emptyForm: AnnouncementFormState = {
  title: "",
  content: "",
  is_pinned: false,
  is_hidden: false,
  platforms: [],
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
    is_hidden: form.is_hidden,
    platforms: form.platforms,
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

function togglePlatform(
  current: Array<"ios" | "android" | "windows" | "mac" | "web">,
  next: "ios" | "android" | "windows" | "mac" | "web",
): Array<"ios" | "android" | "windows" | "mac" | "web"> {
  return current.includes(next) ? current.filter((item) => item !== next) : [...current, next]
}

function AnnouncementFormFields({
  form,
  setForm,
  theme = "dark",
}: {
  form: AnnouncementFormState
  setForm: React.Dispatch<React.SetStateAction<AnnouncementFormState>>
  theme?: "dark" | "light"
}) {
  const inputClassName =
    theme === "light"
      ? "w-full rounded-xl border border-slate-900/20 bg-white/80 px-3 py-2 text-sm dark:border-white/20 dark:bg-white/10"
      : "w-full rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-sm"
  const panelClassName =
    theme === "light"
      ? "rounded-xl border border-slate-900/15 p-3 dark:border-white/15"
      : "rounded-xl border border-white/15 p-3"
  const textClassName = theme === "light" ? "text-slate-700 dark:text-slate-300" : "text-slate-200"

  return (
    <>
      <label className="space-y-1 text-sm">
        <span className="text-slate-700 dark:text-slate-300">公告标题</span>
        <input
          type="text"
          value={form.title}
          onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
          className={inputClassName}
          required
          maxLength={128}
        />
      </label>

      <label className="space-y-1 text-sm">
        <span className="text-slate-700 dark:text-slate-300">公告内容</span>
        <textarea
          value={form.content}
          onChange={(event) => setForm((prev) => ({ ...prev, content: event.target.value }))}
          rows={6}
          className={inputClassName}
          required
          maxLength={4096}
        />
      </label>

      <label className="space-y-1 text-sm">
        <span className="text-slate-700 dark:text-slate-300">发布时间</span>
        <input
          type="datetime-local"
          value={form.published_at}
          onChange={(event) => setForm((prev) => ({ ...prev, published_at: event.target.value }))}
          className={inputClassName}
        />
      </label>

      <label className="space-y-1 text-sm">
        <span className="text-slate-700 dark:text-slate-300">作者</span>
        <input
          type="text"
          value={form.author}
          onChange={(event) => setForm((prev) => ({ ...prev, author: event.target.value }))}
          className={inputClassName}
          maxLength={64}
        />
      </label>

      <div className={panelClassName}>
        <p className={`mb-2 text-sm ${textClassName}`}>平台范围（多选，空表示全部）</p>
        <div className="flex flex-wrap gap-3">
          {platformOptions.map((item) => (
            <label
              key={item.value}
              className={`inline-flex items-center gap-2 text-sm ${textClassName}`}
            >
              <input
                type="checkbox"
                checked={form.platforms.includes(item.value)}
                onChange={() =>
                  setForm((prev) => ({
                    ...prev,
                    platforms: togglePlatform(prev.platforms, item.value),
                  }))
                }
                className="size-4"
              />
              {item.label}
            </label>
          ))}
        </div>
      </div>

      <label className={`inline-flex items-center gap-2 text-sm ${textClassName}`}>
        <input
          type="checkbox"
          checked={form.is_pinned}
          onChange={(event) => setForm((prev) => ({ ...prev, is_pinned: event.target.checked }))}
          className="size-4"
        />
        置顶公告
      </label>

      <label className={`inline-flex items-center gap-2 text-sm ${textClassName}`}>
        <input
          type="checkbox"
          checked={form.is_hidden}
          onChange={(event) => setForm((prev) => ({ ...prev, is_hidden: event.target.checked }))}
          className="size-4"
        />
        隐藏公告（公开 API 不返回）
      </label>
    </>
  )
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
  const [submitLoading, setSubmitLoading] = React.useState(false)

  const [editDialogOpen, setEditDialogOpen] = React.useState(false)
  const [editingId, setEditingId] = React.useState<string | null>(null)
  const [editForm, setEditForm] = React.useState<AnnouncementFormState>(emptyForm)
  const [savingEdit, setSavingEdit] = React.useState(false)

  const selectedProject = React.useMemo(
    () => projects.find((project) => project.project_key === selectedProjectKey) ?? null,
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
      const hasCurrent = response.data.some((project) => project.project_key === selectedProjectKey)
      if (hasCurrent) {
        return
      }

      const firstProject = response.data[0]
      if (firstProject) {
        setSelectedProjectKey(firstProject.project_key)
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
    setForm(emptyForm)
    setEditDialogOpen(false)
    setEditingId(null)
  }, [selectedProjectKey])

  function beginEdit(item: AnnouncementItem) {
    setEditingId(item.id)
    setEditForm({
      title: item.title,
      content: item.content,
      is_pinned: item.is_pinned,
      is_hidden: item.is_hidden,
      platforms: item.platforms,
      author: item.author ?? "",
      published_at: toDateTimeLocal(item.published_at),
    })
    setEditDialogOpen(true)
  }

  function copyFromAnnouncement(item: AnnouncementItem) {
    setForm({
      title: item.title,
      content: item.content,
      is_pinned: item.is_pinned,
      is_hidden: item.is_hidden,
      platforms: item.platforms,
      author: item.author ?? "",
      published_at: toDateTimeLocal(item.published_at),
    })
    toast.success("已复制配置到创建表单")
  }

  async function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!token) {
      toast.error("请先登录后再操作。")
      return
    }

    if (!selectedProjectKey) {
      toast.error("请先选择项目。")
      return
    }

    const payload = toMutationInput(form)
    if (!payload.title || !payload.content) {
      toast.error("title 与 content 为必填项。")
      return
    }

    setSubmitLoading(true)
    try {
      await createAnnouncement(token, selectedProjectKey, payload)
      toast.success("公告已发布。")
      setForm(emptyForm)
      setOffset(0)
      await loadAnnouncements(0)
    } catch (submitError) {
      if (isAuthError(submitError)) {
        setToken("")
        setAuthError("登录状态已过期，请重新登录。")
      }
      toast.error(getErrorMessage(submitError))
    } finally {
      setSubmitLoading(false)
    }
  }

  async function handleSaveEdit() {
    if (!editingId || !token || !selectedProjectKey) {
      return
    }

    const payload = toMutationInput(editForm)
    if (!payload.title || !payload.content) {
      toast.error("title 与 content 为必填项。")
      return
    }

    setSavingEdit(true)
    try {
      await updateAnnouncement(token, selectedProjectKey, editingId, payload)
      toast.success("公告已更新。")
      setEditDialogOpen(false)
      setEditingId(null)
      await loadAnnouncements(offset)
    } catch (submitError) {
      if (isAuthError(submitError)) {
        setToken("")
        setAuthError("登录状态已过期，请重新登录。")
      }
      toast.error(getErrorMessage(submitError))
    } finally {
      setSavingEdit(false)
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
      toast.success("公告已删除。")
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
      toast.error(getErrorMessage(deleteError))
    }
  }

  return (
    <section className="space-y-6">
      <AdminPageHeader
        title="公告发布中心"
        description="维护公告内容、置顶状态、隐藏状态和发布时间。"
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
            warning={authError || undefined}
          />

          <ProjectApiOverview
            title="接口示例 · 公告"
            projectKey={selectedProject?.project_key}
            groups={[
              {
                label: "公开接口",
                endpoints: [
                  {
                    method: "GET",
                    path: "/api/v1/public/{projectKey}/announcements",
                    description: "获取公告列表（自动排除隐藏公告）",
                    auth: { tokenRequired: false },
                  },
                  {
                    method: "GET",
                    path: "/api/v1/public/{projectKey}/announcements/latest",
                    description: "获取最新公告（自动排除隐藏公告）",
                    auth: { tokenRequired: false },
                  },
                ],
              },
              {
                label: "管理接口",
                endpoints: [
                  {
                    method: "POST",
                    path: "/api/v1/admin/projects/{projectKey}/announcements",
                    description: "创建公告",
                    auth: { tokenRequired: true },
                    requestBody: {
                      title: "系统维护通知",
                      content: "3 月 25 日晚 22:00-23:00 进行维护",
                      is_pinned: false,
                      is_hidden: false,
                      platforms: ["ios", "android"],
                      author: "ops-bot",
                      published_at: 1774476000,
                    },
                  },
                  {
                    method: "PATCH",
                    path: "/api/v1/admin/projects/{projectKey}/announcements/{id}",
                    description: "更新公告",
                    auth: { tokenRequired: true },
                    requestBody: {
                      title: "系统维护通知（延期）",
                      content: "维护窗口改为 23:00-24:00",
                      is_hidden: true,
                      platforms: ["web"],
                    },
                  },
                ],
              },
            ]}
          />
        </div>

        <AdminCard className="space-y-6">
          <div className="space-y-2">
            <h2 className="text-lg font-semibold">发布公告</h2>
            <p className="text-sm text-slate-200/90">支持按平台发布与隐藏公告。</p>
          </div>

          <form className="grid gap-3" onSubmit={handleCreate}>
            <AnnouncementFormFields form={form} setForm={setForm} theme="dark" />

            <Button type="submit" disabled={submitLoading || !selectedProjectKey}>
              {submitLoading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Plus className="size-4" />
              )}
              发布公告
            </Button>
          </form>
        </AdminCard>
      </section>

      <AdminCard as="section">
        <AdminListHeader title="公告列表" total={total} page={page} totalPages={totalPages} />

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

        {hasToken && selectedProjectKey && !loading && !error && announcements.length > 0 ? (
          <div className="space-y-3">
            <div className="overflow-x-auto rounded-2xl border border-white/10 bg-white/5">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-left text-slate-300">
                    <th className="px-3 py-2 font-medium">标题</th>
                    <th className="px-3 py-2 font-medium">状态</th>
                    <th className="px-3 py-2 font-medium">发布时间</th>
                    <th className="px-3 py-2 font-medium">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {announcements.map((item) => (
                    <tr key={item.id} className="border-b border-white/5 align-top">
                      <td className="px-3 py-2">
                        <p className="font-medium text-slate-100">{item.title}</p>
                        <p className="mt-1 text-xs text-slate-300">{item.content}</p>
                        <p className="mt-1 text-xs text-slate-400">
                          作者：{item.author ?? "未填写"}
                        </p>
                      </td>
                      <td className="px-3 py-2 text-xs text-slate-300">
                        <p className="inline-flex items-center gap-1">
                          {item.is_pinned ? <Pin className="size-3" /> : null}
                          置顶：{item.is_pinned ? "是" : "否"}
                        </p>
                        <p>隐藏：{item.is_hidden ? "是" : "否"}</p>
                        <p>
                          平台：{item.platforms.length > 0 ? item.platforms.join(", ") : "全部"}
                        </p>
                      </td>
                      <td className="px-3 py-2 text-xs text-slate-300">
                        <p>{new Date(item.published_at * 1000).toLocaleString("zh-CN")}</p>
                        <p>更新于 {new Date(item.updated_at * 1000).toLocaleString("zh-CN")}</p>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => copyFromAnnouncement(item)}
                          >
                            <Copy className="size-4" />
                            复制配置
                          </Button>
                          <Button type="button" variant="outline" onClick={() => beginEdit(item)}>
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
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <AdminPagination
              hasPrev={offset > 0}
              hasNext={offset + PAGE_SIZE < total}
              onPrev={() => setOffset((prev) => Math.max(0, prev - PAGE_SIZE))}
              onNext={() => setOffset((prev) => prev + PAGE_SIZE)}
            />
          </div>
        ) : null}
      </AdminCard>

      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>编辑公告</DialogTitle>
            <DialogDescription>通过弹窗编辑公告，不再占用主表单。</DialogDescription>
          </DialogHeader>

          <div className="grid gap-3">
            <AnnouncementFormFields form={editForm} setForm={setEditForm} theme="light" />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setEditDialogOpen(false)}>
              取消
            </Button>
            <Button
              type="button"
              disabled={savingEdit || !editingId}
              onClick={() => void handleSaveEdit()}
            >
              <Save className="size-4" />
              保存修改
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}
