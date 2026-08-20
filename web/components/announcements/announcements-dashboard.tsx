"use client"

import * as React from "react"
import { Copy, PencilLine, Pin, Plus, Save, Trash2 } from "lucide-react"
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
import {
  DataTable,
  DataTableSelectFilter,
  EmptyValue,
  TruncatedCell,
  type DataTableColumn,
} from "@/components/common/data-table"
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
import { useConfirm } from "@/components/common/confirm-dialog"
import { useUnsavedChangesGuard } from "@/components/common/unsaved-changes-guard"
import { formatTimestamp } from "@/lib/format"
import { usePagination } from "@/hooks/use-pagination"
import { getSessionToken } from "@/lib/auth-session"
import { AdminPageHeader } from "@/components/admin/admin-page-header"
import { useAdminProjects } from "@/hooks/use-admin-projects"

const PAGE_SIZE = 10

const platformOptions = PLATFORM_OPTIONS

type FilterState = {
  search: string
  platform: "" | Platform
  /** 空串表示不限；"true" / "false" 分别对应只看是 / 只看否。 */
  isPinned: string
  isHidden: string
}

const emptyFilters: FilterState = {
  search: "",
  platform: "",
  isPinned: "",
  isHidden: "",
}

const yesNoOptions = [
  { label: "是", value: "true" },
  { label: "否", value: "false" },
]

/** 三态开关：空串不带进请求，其余按字符串转布尔。 */
function toOptionalBoolean(value: string): boolean | undefined {
  return value === "" ? undefined : value === "true"
}

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
  const confirm = useConfirm()
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
  const [filters, setFilters] = React.useState<FilterState>(emptyFilters)

  const [form, setForm] = React.useState<AnnouncementFormState>(emptyForm)
  const [createDialogOpen, setCreateDialogOpen] = React.useState(false)
  const [submitLoading, setSubmitLoading] = React.useState(false)

  const [editDialogOpen, setEditDialogOpen] = React.useState(false)
  const [editingId, setEditingId] = React.useState<string | null>(null)
  const [editForm, setEditForm] = React.useState<AnnouncementFormState>(emptyForm)
  const [savingEdit, setSavingEdit] = React.useState(false)
  const handleEditOpenChange = useUnsavedChangesGuard({
    open: editDialogOpen,
    onOpenChange: setEditDialogOpen,
    value: editForm,
  })

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
          {
            limit: PAGE_SIZE,
            offset: nextOffset,
            search: filters.search.trim() || undefined,
            platform: filters.platform || undefined,
            is_pinned: toOptionalBoolean(filters.isPinned),
            is_hidden: toOptionalBoolean(filters.isHidden),
          },
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
    [selectedProjectKey, token, setTotal, filters],
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

  /** 改任何一个筛选条件都回到第一页：留在第 5 页看新条件的结果没有意义。 */
  const updateFilter = React.useCallback(
    <K extends keyof FilterState>(key: K, value: FilterState[K]) => {
      setFilters((current) => ({ ...current, [key]: value }))
      resetOffset()
    },
    [resetOffset],
  )

  function resetFilters() {
    setFilters(emptyFilters)
    resetOffset()
  }

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

    const confirmed = await confirm({
      title: "删除公告",
      description: "确认删除这个公告吗？该操作不可撤销。",
      confirmLabel: "删除",
      destructive: true,
    })
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

  // 不做 memo：操作按钮闭包了当前页数据，缓存下来会让编辑/删除作用在上一轮的行上。
  const columns: Array<DataTableColumn<AnnouncementItem>> = [
    {
      id: "title",
      header: "标题",
      label: "标题",
      alwaysVisible: true,
      className: "font-medium",
      cell: (item) => (
        <TruncatedCell className="max-w-[20rem]" title={item.title}>
          {item.title}
        </TruncatedCell>
      ),
    },
    {
      id: "content",
      header: "正文",
      label: "正文",
      className: "min-w-64 text-xs text-slate-600 dark:text-slate-300",
      cell: (item) => (
        <TruncatedCell className="max-w-[26rem]" title={item.content}>
          {item.content}
        </TruncatedCell>
      ),
    },
    {
      id: "is_pinned",
      header: "置顶",
      label: "置顶",
      className: "text-xs",
      cell: (item) =>
        item.is_pinned ? (
          <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-300">
            <Pin className="size-3" />是
          </span>
        ) : (
          <EmptyValue>否</EmptyValue>
        ),
    },
    {
      id: "is_hidden",
      header: "隐藏",
      label: "隐藏",
      className: "text-xs",
      cell: (item) =>
        item.is_hidden ? (
          <span className="text-amber-600 dark:text-amber-300">是</span>
        ) : (
          <EmptyValue>否</EmptyValue>
        ),
    },
    {
      id: "platforms",
      header: "平台",
      label: "平台",
      className: "text-xs text-slate-600 dark:text-slate-300",
      cell: (item) =>
        item.platforms.length > 0 ? item.platforms.join(", ") : <EmptyValue>全部</EmptyValue>,
    },
    {
      id: "author",
      header: "作者",
      label: "作者",
      className: "text-xs text-slate-600 dark:text-slate-300",
      cell: (item) => item.author ?? <EmptyValue />,
    },
    {
      id: "published_at",
      header: "发布时间",
      label: "发布时间",
      className: "whitespace-nowrap text-xs text-slate-600 tabular-nums dark:text-slate-300",
      cell: (item) => formatTimestamp(item.published_at, "—"),
    },
    {
      id: "updated_at",
      header: "更新时间",
      label: "更新时间",
      defaultHidden: true,
      className: "whitespace-nowrap text-xs text-slate-600 tabular-nums dark:text-slate-300",
      cell: (item) => formatTimestamp(item.updated_at, "—"),
    },
    {
      id: "id",
      header: "ID",
      label: "公告 ID",
      defaultHidden: true,
      className: "font-mono text-xs text-slate-500 dark:text-slate-400",
      cell: (item) => item.id,
    },
    {
      id: "actions",
      header: "操作",
      label: "操作",
      alwaysVisible: true,
      headerClassName: "text-right",
      className: "text-right",
      cell: (item) => (
        // 图标按钮：名字挂在 aria-label / title 上，读屏与悬停都拿得到。
        <div className="flex justify-end gap-1.5">
          <Button
            type="button"
            size="icon-sm"
            variant="outline"
            title="复制配置"
            aria-label="复制配置"
            onClick={() => copyFromAnnouncement(item)}
          >
            <Copy className="size-4" />
          </Button>
          <Button
            type="button"
            size="icon-sm"
            variant="outline"
            title="编辑"
            aria-label="编辑"
            onClick={() => beginEdit(item)}
          >
            <PencilLine className="size-4" />
          </Button>
          <Button
            type="button"
            size="icon-sm"
            variant="destructive"
            title="删除"
            aria-label="删除"
            onClick={() => void handleDelete(item.id)}
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      ),
    },
  ]

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

      <AdminCard as="section" className="space-y-4">
        <h2 className="text-lg font-semibold">公告列表</h2>

        <DataTable
          storageKey="announcements"
          columns={columns}
          rows={announcements}
          getRowId={(item) => item.id}
          loading={hasToken && Boolean(selectedProjectKey) && loading}
          error={error}
          emptyMessage={
            !hasToken
              ? "请先在登录页完成登录后查看公告数据。"
              : !selectedProjectKey
                ? "暂无项目，请先去项目管理页创建项目。"
                : "当前筛选条件下暂无公告。"
          }
          rowClassName={(item) => (item.is_hidden ? "opacity-60" : undefined)}
          search={{
            value: filters.search,
            onChange: (value) => updateFilter("search", value),
            placeholder: "搜索标题 / 正文 / 作者",
          }}
          filters={
            <>
              <DataTableSelectFilter
                label="平台"
                value={filters.platform}
                onChange={(value) => updateFilter("platform", value as FilterState["platform"])}
                options={platformOptions}
              />
              <DataTableSelectFilter
                label="置顶"
                value={filters.isPinned}
                onChange={(value) => updateFilter("isPinned", value)}
                options={yesNoOptions}
              />
              <DataTableSelectFilter
                label="隐藏"
                value={filters.isHidden}
                onChange={(value) => updateFilter("isHidden", value)}
                options={yesNoOptions}
              />
            </>
          }
          onResetFilters={resetFilters}
          renderExpanded={(item) => (
            <p className="text-sm whitespace-pre-wrap text-slate-700 dark:text-slate-300">
              {item.content}
            </p>
          )}
          pagination={{ total, page, totalPages, hasPrev, hasNext, onPrev, onNext }}
        />
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
        formValue={form}
      >
        <AnnouncementFormFields form={form} setForm={setForm} theme="light" />
      </AdminFormDialog>

      <Dialog open={editDialogOpen} onOpenChange={handleEditOpenChange}>
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
            <Button type="button" variant="outline" onClick={() => handleEditOpenChange(false)}>
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
