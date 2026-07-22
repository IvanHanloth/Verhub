"use client"

import * as React from "react"
import { Copy, Loader2, PencilLine, Pin, Plus, Save, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"

import { AdminCard } from "@/components/admin/admin-card"
import { AdminFormDialog } from "@/components/admin/admin-form-dialog"
import { AdminListHeader, AdminPagination } from "@/components/admin/admin-list"
import { ApiReferenceDrawer } from "@/components/docs/api-reference-drawer"
import { MarkdownEditor } from "@/components/markdown/markdown-editor"
import {
  createAnnouncement,
  deleteAnnouncement,
  listAnnouncements,
  updateAnnouncement,
  type AnnouncementItem,
  type AnnouncementMutationInput,
} from "@/lib/announcements-api"
import { isAuthError } from "@/lib/api-client"
import { PLATFORM_OPTIONS, type Platform } from "@/lib/platform"
import { getErrorMessage } from "@/lib/error-utils"
import { usePagination } from "@/hooks/use-pagination"
import { getSessionToken } from "@/lib/auth-session"
import { AdminPageHeader } from "@/components/admin/admin-page-header"
import { useAdminProjects } from "@/hooks/use-admin-projects"

const PAGE_SIZE = 10

const platformOptions = PLATFORM_OPTIONS

type AnnouncementFormState = {
  title: string
  content: string
  is_pinned: boolean
  is_hidden: boolean
  platforms: Platform[]
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

function togglePlatform(current: Platform[], next: Platform): Platform[] {
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

      <MarkdownEditor
        label="公告内容"
        value={form.content}
        onChange={(value) => setForm((prev) => ({ ...prev, content: value }))}
        rows={6}
        className={inputClassName}
        required
        maxLength={4096}
      />

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

  const { selectedProject, selectedProjectKey, error: projectsError } = useAdminProjects()

  const [announcements, setAnnouncements] = React.useState<AnnouncementItem[]>([])
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
    adjustAfterDelete,
    resetOffset,
  } = usePagination({ pageSize: PAGE_SIZE })
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const [form, setForm] = React.useState<AnnouncementFormState>(emptyForm)
  const [createDialogOpen, setCreateDialogOpen] = React.useState(false)
  const [submitLoading, setSubmitLoading] = React.useState(false)

  const [editDialogOpen, setEditDialogOpen] = React.useState(false)
  const [editingId, setEditingId] = React.useState<string | null>(null)
  const [editForm, setEditForm] = React.useState<AnnouncementFormState>(emptyForm)
  const [savingEdit, setSavingEdit] = React.useState(false)

  const hasToken = token.trim().length > 0

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
    [selectedProjectKey, token, setTotal],
  )

  React.useEffect(() => {
    const controller = new AbortController()
    void loadAnnouncements(offset, controller.signal)

    return () => {
      controller.abort()
    }
  }, [loadAnnouncements, offset])

  React.useEffect(() => {
    resetOffset()
    setForm(emptyForm)
    setCreateDialogOpen(false)
    setEditDialogOpen(false)
    setEditingId(null)
  }, [selectedProjectKey, resetOffset])

  function openCreateDialog() {
    setForm(emptyForm)
    setCreateDialogOpen(true)
  }

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
    setCreateDialogOpen(true)
    toast.success("已复制配置到创建表单")
  }

  async function handleCreate() {
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
      setCreateDialogOpen(false)
      resetOffset()
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
      adjustAfterDelete(announcements.length - 1)
      const nextOffset =
        announcements.length === 1 && offset > 0 ? Math.max(0, offset - PAGE_SIZE) : offset
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
        actions={
          <>
            <ApiReferenceDrawer
              tag="Announcements"
              title="公告接口文档"
              projectKey={selectedProject?.project_key}
            />
            <Button type="button" disabled={!selectedProjectKey} onClick={openCreateDialog}>
              <Plus className="size-4" />
              新增公告
            </Button>
          </>
        }
      />

      {authError || projectsError ? (
        <AdminCard className="text-sm text-rose-500 dark:text-rose-300">
          {authError ?? projectsError}
        </AdminCard>
      ) : null}

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
                        {/* 图标按钮：名字挂在 aria-label / title 上，读屏与悬停都拿得到。 */}
                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            size="icon"
                            variant="outline"
                            title="复制配置"
                            aria-label="复制配置"
                            onClick={() => copyFromAnnouncement(item)}
                          >
                            <Copy className="size-4" />
                          </Button>
                          <Button
                            type="button"
                            size="icon"
                            variant="outline"
                            title="编辑"
                            aria-label="编辑"
                            onClick={() => beginEdit(item)}
                          >
                            <PencilLine className="size-4" />
                          </Button>
                          <Button
                            type="button"
                            size="icon"
                            variant="destructive"
                            title="删除"
                            aria-label="删除"
                            onClick={() => void handleDelete(item.id)}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <AdminPagination hasPrev={hasPrev} hasNext={hasNext} onPrev={onPrev} onNext={onNext} />
          </div>
        ) : null}
      </AdminCard>

      <AdminFormDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        title="发布公告"
        description="支持按平台发布，也可以先隐藏再择机放出。"
        submitLabel="发布公告"
        submitIcon={<Plus className="size-4" />}
        submitting={submitLoading}
        submitDisabled={!selectedProjectKey}
        onSubmit={() => void handleCreate()}
      >
        <AnnouncementFormFields form={form} setForm={setForm} theme="light" />
      </AdminFormDialog>

      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>编辑公告</DialogTitle>
            <DialogDescription>通过弹窗编辑公告，不再占用主表单。</DialogDescription>
          </DialogHeader>

          <DialogBody>
            <div className="grid gap-3">
              <AnnouncementFormFields form={editForm} setForm={setEditForm} theme="light" />
            </div>
          </DialogBody>

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
