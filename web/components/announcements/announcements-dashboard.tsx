"use client"

import * as React from "react"
import { Copy, Languages, PencilLine, Pin, Plus, Save, Trash2 } from "lucide-react"
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
  MarkdownCell,
  TruncatedCell,
  createDataTableColumns,
} from "@/components/common/data-table"
import { ApiReferenceDrawer } from "@/components/docs/api-reference-drawer"
import { SegmentedButton, SegmentedGroup } from "@/components/github/ui"
import { MarkdownEditor } from "@/components/markdown/markdown-editor"
import {
  createAnnouncement,
  deleteAnnouncement,
  listAnnouncements,
  updateAnnouncement,
  type AnnouncementItem,
  type AnnouncementMutationInput,
  type AnnouncementTranslation,
} from "@/lib/announcements-api"
import { isAuthError } from "@/lib/api-client"
import { listProjectLocales, type ProjectLocaleItem } from "@/lib/projects-api"
import { validateComparableVersion } from "@/lib/comparable-version"
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
  min_comparable_version: string
  max_comparable_version: string
  /**
   * 按语言存的译文草稿。标题、正文、隐藏开关三者全无意义的语言不会提交，
   * 等同该语言没有任何覆盖设置。
   */
  translations: Record<string, { title: string; content: string; is_hidden: boolean }>
  published_at: string
}

const emptyForm: AnnouncementFormState = {
  title: "",
  content: "",
  is_pinned: false,
  is_hidden: false,
  platforms: [],
  author: "",
  min_comparable_version: "",
  max_comparable_version: "",
  translations: {},
  published_at: "",
}

/**
 * 只提交有意义的语言：标题、正文、隐藏开关三者任一有值即算配过。
 * 三者全空的行后端会拒——存下来只会让人以为配过什么。
 */
function toTranslationList(
  translations: AnnouncementFormState["translations"],
): AnnouncementTranslation[] {
  return Object.entries(translations)
    .filter(([, value]) => value.title.trim() || value.content.trim() || value.is_hidden)
    .map(([locale, value]) => ({
      locale,
      title: value.title.trim() || null,
      content: value.content.trim() || null,
      is_hidden: value.is_hidden,
    }))
}

function toFormTranslations(
  translations: AnnouncementTranslation[] | undefined,
): AnnouncementFormState["translations"] {
  return Object.fromEntries(
    (translations ?? []).map((item) => [
      item.locale,
      {
        title: item.title ?? "",
        content: item.content ?? "",
        is_hidden: item.is_hidden,
      },
    ]),
  )
}

function toMutationInput(form: AnnouncementFormState): AnnouncementMutationInput {
  return {
    title: form.title.trim(),
    content: form.content.trim(),
    is_pinned: form.is_pinned,
    is_hidden: form.is_hidden,
    platforms: form.platforms,
    author: form.author.trim() || undefined,
    // 空串要发 null 而不是 undefined：前者是「清掉这一端的限制」，后者是「不动它」。
    min_comparable_version: form.min_comparable_version.trim() || null,
    max_comparable_version: form.max_comparable_version.trim() || null,
    translations: toTranslationList(form.translations),
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
  locales = [],
  theme = "dark",
}: {
  form: AnnouncementFormState
  setForm: React.Dispatch<React.SetStateAction<AnnouncementFormState>>
  /** 项目注册的语言。为空时不显示语言页签，表单退化成单一默认内容。 */
  locales?: ProjectLocaleItem[]
  theme?: "dark" | "light"
}) {
  // 默认内容页用空串标识，与任何真实 locale 都不会撞。
  const [activeLocale, setActiveLocale] = React.useState("")
  const inputClassName =
    theme === "light"
      ? "w-full rounded-xl border border-slate-900/20 bg-white/80 px-3 py-2 text-sm dark:border-white/20 dark:bg-white/10"
      : "w-full rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-sm"
  const panelClassName =
    theme === "light"
      ? "rounded-xl border border-slate-900/15 p-3 dark:border-white/15"
      : "rounded-xl border border-white/15 p-3"
  const textClassName = theme === "light" ? "text-slate-700 dark:text-slate-300" : "text-slate-200"

  // 注销语言后表单里可能还停在那一页，回落到默认内容页而不是渲染一个空壳。
  const currentLocale = locales.some((item) => item.locale === activeLocale) ? activeLocale : ""
  const draft = form.translations[currentLocale] ?? { title: "", content: "", is_hidden: false }
  const minVersionError = form.min_comparable_version.trim()
    ? validateComparableVersion(form.min_comparable_version)
    : null
  const maxVersionError = form.max_comparable_version.trim()
    ? validateComparableVersion(form.max_comparable_version)
    : null

  function updateTranslation(patch: { title?: string; content?: string; is_hidden?: boolean }) {
    setForm((prev) => {
      const previous = prev.translations[currentLocale] ?? {
        title: "",
        content: "",
        is_hidden: false,
      }
      return {
        ...prev,
        translations: { ...prev.translations, [currentLocale]: { ...previous, ...patch } },
      }
    })
  }

  return (
    <>
      {locales.length > 0 ? (
        <SegmentedGroup role="tablist" className="flex w-full flex-wrap text-sm">
          <SegmentedButton
            role="tab"
            grow
            active={currentLocale === ""}
            onClick={() => setActiveLocale("")}
            label="默认内容"
          />
          {locales.map((item) => (
            <SegmentedButton
              key={item.locale}
              role="tab"
              grow
              active={currentLocale === item.locale}
              onClick={() => setActiveLocale(item.locale)}
              label={item.label ? `${item.label}（${item.locale}）` : item.locale}
            />
          ))}
        </SegmentedGroup>
      ) : null}

      {currentLocale ? (
        <>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            标题与正文各自留空即沿用默认内容。
            其余字段（平台、置顶、时间、版本范围等）只在默认内容页设置，对所有语言生效。
          </p>

          <label
            className={`inline-flex items-center gap-2 text-sm ${textClassName}`}
            key={`hidden-${currentLocale}`}
          >
            <input
              type="checkbox"
              checked={draft.is_hidden}
              onChange={(event) => updateTranslation({ is_hidden: event.target.checked })}
              className="size-4"
            />
            在 {currentLocale} 下隐藏这条公告
          </label>

          <label className="space-y-1 text-sm">
            <span className="text-slate-700 dark:text-slate-300">译文标题</span>
            <input
              type="text"
              value={draft.title}
              onChange={(event) => updateTranslation({ title: event.target.value })}
              className={inputClassName}
              maxLength={128}
            />
          </label>

          <MarkdownEditor
            label="译文内容"
            value={draft.content}
            onChange={(value) => updateTranslation({ content: value })}
            rows={6}
            className={inputClassName}
            maxLength={4096}
          />
        </>
      ) : (
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
              onChange={(event) =>
                setForm((prev) => ({ ...prev, published_at: event.target.value }))
              }
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
            <p className={`mb-1 text-sm ${textClassName}`}>可见版本范围（闭区间，留空即不限）</p>
            <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">
              填了任意一端后，只有上报了版本号且落在范围内的客户端才看得到这条公告——没上报版本号的客户端一律看不到。
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="space-y-1 text-sm">
                <span className={textClassName}>最低版本</span>
                <input
                  type="text"
                  value={form.min_comparable_version}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, min_comparable_version: event.target.value }))
                  }
                  className={inputClassName}
                  placeholder="例如：2.0.0"
                  maxLength={64}
                />
                {minVersionError ? (
                  <span className="text-xs text-rose-500">{minVersionError}</span>
                ) : null}
              </label>
              <label className="space-y-1 text-sm">
                <span className={textClassName}>最高版本</span>
                <input
                  type="text"
                  value={form.max_comparable_version}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, max_comparable_version: event.target.value }))
                  }
                  className={inputClassName}
                  placeholder="例如：2.9.9"
                  maxLength={64}
                />
                {maxVersionError ? (
                  <span className="text-xs text-rose-500">{maxVersionError}</span>
                ) : null}
              </label>
            </div>
          </div>

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
              onChange={(event) =>
                setForm((prev) => ({ ...prev, is_pinned: event.target.checked }))
              }
              className="size-4"
            />
            置顶公告
          </label>

          <label className={`inline-flex items-center gap-2 text-sm ${textClassName}`}>
            <input
              type="checkbox"
              checked={form.is_hidden}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, is_hidden: event.target.checked }))
              }
              className="size-4"
            />
            隐藏公告（公开 API 不返回）
          </label>
        </>
      )}
    </>
  )
}

const column = createDataTableColumns<AnnouncementItem>()

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
  // 项目注册的语言，决定公告弹窗里出现哪些语言页签。
  const [locales, setLocales] = React.useState<ProjectLocaleItem[]>([])
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
    if (!token || !selectedProjectKey) {
      setLocales([])
      return
    }

    const controller = new AbortController()
    listProjectLocales(token, selectedProjectKey, controller.signal)
      .then((result) => setLocales(result.data))
      // 语言拉不到只是没有译文页签可编辑，不该拦住整个公告页——静默退化。
      .catch(() => {
        if (!controller.signal.aborted) {
          setLocales([])
        }
      })

    return () => {
      controller.abort()
    }
  }, [token, selectedProjectKey])

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
      min_comparable_version: item.min_comparable_version ?? "",
      max_comparable_version: item.max_comparable_version ?? "",
      translations: toFormTranslations(item.translations),
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
      min_comparable_version: item.min_comparable_version ?? "",
      max_comparable_version: item.max_comparable_version ?? "",
      translations: toFormTranslations(item.translations),
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
  const columns = [
    column.display({
      id: "title",
      header: "标题",
      enableHiding: false,
      cell: ({ row }) => (
        <span className="inline-flex items-center gap-1.5">
          <TruncatedCell className="max-w-[20rem]" title={row.original.title}>
            {row.original.title}
          </TruncatedCell>
          {row.original.translations && row.original.translations.length > 0 ? (
            <span
              className="inline-flex shrink-0 items-center gap-0.5 rounded-md bg-slate-900/8 px-1.5 py-0.5 text-[11px] font-normal text-slate-600 dark:bg-white/15 dark:text-slate-300"
              title={`已录入译文：${row.original.translations.map((tr) => tr.locale).join("、")}`}
            >
              <Languages className="size-3" />
              {row.original.translations.length}
            </span>
          ) : null}
        </span>
      ),
      meta: { className: "font-medium" },
    }),
    column.display({
      id: "version_range",
      header: "版本范围",
      cell: ({ row }) =>
        row.original.min_comparable_version || row.original.max_comparable_version ? (
          `${row.original.min_comparable_version ?? "*"} ~ ${row.original.max_comparable_version ?? "*"}`
        ) : (
          <EmptyValue>不限</EmptyValue>
        ),
      meta: {
        label: "可见版本范围",
        className: "font-mono text-xs whitespace-nowrap text-slate-600 dark:text-slate-300",
      },
    }),
    column.display({
      id: "content",
      header: "正文",
      cell: ({ row }) => <MarkdownCell value={row.original.content} />,
      meta: { className: "min-w-64 text-xs text-slate-600 dark:text-slate-300" },
    }),
    column.display({
      id: "is_pinned",
      header: "置顶",
      cell: ({ row }) =>
        row.original.is_pinned ? (
          <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-300">
            <Pin className="size-3" />是
          </span>
        ) : (
          <EmptyValue>否</EmptyValue>
        ),
      meta: { className: "text-xs" },
    }),
    column.display({
      id: "is_hidden",
      header: "隐藏",
      cell: ({ row }) =>
        row.original.is_hidden ? (
          <span className="text-amber-600 dark:text-amber-300">是</span>
        ) : (
          <EmptyValue>否</EmptyValue>
        ),
      meta: { className: "text-xs" },
    }),
    column.display({
      id: "platforms",
      header: "平台",
      cell: ({ row }) =>
        row.original.platforms.length > 0 ? (
          row.original.platforms.join(", ")
        ) : (
          <EmptyValue>全部</EmptyValue>
        ),
      meta: { className: "text-xs text-slate-600 dark:text-slate-300" },
    }),
    column.display({
      id: "author",
      header: "作者",
      cell: ({ row }) => row.original.author ?? <EmptyValue />,
      meta: { className: "text-xs text-slate-600 dark:text-slate-300" },
    }),
    column.display({
      id: "published_at",
      header: "发布时间",
      cell: ({ row }) => formatTimestamp(row.original.published_at, "—"),
      meta: {
        className: "whitespace-nowrap text-xs text-slate-600 tabular-nums dark:text-slate-300",
      },
    }),
    column.display({
      id: "updated_at",
      header: "更新时间",
      cell: ({ row }) => formatTimestamp(row.original.updated_at, "—"),
      meta: {
        defaultHidden: true,
        className: "whitespace-nowrap text-xs text-slate-600 tabular-nums dark:text-slate-300",
      },
    }),
    column.display({
      id: "translations",
      header: "译文",
      cell: ({ row }) =>
        row.original.translations && row.original.translations.length > 0 ? (
          <span className="text-xs text-slate-600 dark:text-slate-300">
            {row.original.translations.map((item) => item.locale).join("、")}
          </span>
        ) : (
          <EmptyValue>无</EmptyValue>
        ),
      meta: { label: "已录入译文", defaultHidden: true },
    }),
    column.display({
      id: "id",
      header: "ID",
      cell: ({ row }) => row.original.id,
      meta: {
        label: "公告 ID",
        defaultHidden: true,
        className: "font-mono text-xs text-slate-500 dark:text-slate-400",
      },
    }),
    column.display({
      id: "actions",
      header: "操作",
      enableHiding: false,
      // 图标按钮：名字挂在 aria-label / title 上，读屏与悬停都拿得到。
      cell: ({ row }) => (
        <div className="flex justify-end gap-1.5">
          <Button
            type="button"
            size="icon-sm"
            variant="outline"
            title="复制配置"
            aria-label="复制配置"
            onClick={() => copyFromAnnouncement(row.original)}
          >
            <Copy className="size-4" />
          </Button>
          <Button
            type="button"
            size="icon-sm"
            variant="outline"
            title="编辑"
            aria-label="编辑"
            onClick={() => beginEdit(row.original)}
          >
            <PencilLine className="size-4" />
          </Button>
          <Button
            type="button"
            size="icon-sm"
            variant="destructive"
            title="删除"
            aria-label="删除"
            onClick={() => void handleDelete(row.original.id)}
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      ),
      meta: {
        hideInDetail: true,
        pin: "end",
        headerClassName: "text-right",
        className: "text-right",
      },
    }),
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
          detailTitle={(item) => item.title}
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
        <AnnouncementFormFields form={form} setForm={setForm} locales={locales} theme="light" />
      </AdminFormDialog>

      <Dialog open={editDialogOpen} onOpenChange={handleEditOpenChange}>
        <DialogContent className="sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>编辑公告</DialogTitle>
            <DialogDescription>通过弹窗编辑公告，不再占用主表单。</DialogDescription>
          </DialogHeader>

          <DialogBody>
            <div className="grid gap-3">
              <AnnouncementFormFields
                form={editForm}
                setForm={setEditForm}
                locales={locales}
                theme="light"
              />
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
