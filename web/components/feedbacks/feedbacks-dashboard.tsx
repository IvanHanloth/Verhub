"use client"

import * as React from "react"
import {
  AlertTriangle,
  Copy,
  Eye,
  EyeOff,
  Github,
  PencilLine,
  Plus,
  Save,
  Trash2,
} from "lucide-react"
import { toast } from "sonner"

import { Button } from "@workspace/ui/components/button"

import { isAuthError } from "@/lib/api-client"
import { getErrorMessage } from "@/lib/error-utils"
import { useConfirm } from "@/components/common/confirm-dialog"
import { usePagination } from "@/hooks/use-pagination"
import { getSessionToken } from "@/lib/auth-session"
import { AdminCard } from "@/components/admin/admin-card"
import { AdminFormDialog } from "@/components/admin/admin-form-dialog"
import { AdminPageHeader } from "@/components/admin/admin-page-header"
import { ClientOriginBadges } from "@/components/common/client-origin-badges"
import {
  DataTable,
  DataTableSelectFilter,
  DataTableToggle,
  EmptyValue,
  TruncatedCell,
  type DataTableColumn,
} from "@/components/common/data-table"
import { JsonField } from "@/components/common/json-viewer"
import { ApiReferenceDrawer } from "@/components/docs/api-reference-drawer"
import { useAdminProjects } from "@/hooks/use-admin-projects"
import {
  createFeedback,
  deleteFeedback,
  listFeedbacks,
  updateFeedback,
  type FeedbackItem,
  type FeedbackMutationInput,
} from "@/lib/feedbacks-api"
import {
  PLATFORM_OPTIONS as platformOptions,
  formatPlatformVersion,
  type Platform,
} from "@/lib/platform"
import { formatTimestamp } from "@/lib/format"

const PAGE_SIZE = 10

type FeedbackFormState = {
  user_id: string
  rating: string
  content: string
  contact: string
  is_hidden: boolean
  platform: "" | Platform
  custom_data: string
}

type FilterState = {
  search: string
  platform: "" | Platform
  /** 空串表示不限；下拉框的取值是字符串，转数字留到发请求时做。 */
  rating: string
  includeHidden: boolean
}

const emptyFilters: FilterState = {
  search: "",
  platform: "",
  rating: "",
  includeHidden: false,
}

const ratingOptions = [1, 2, 3, 4, 5].map((value) => ({
  label: `${value} 分`,
  value: String(value),
}))

const emptyForm: FeedbackFormState = {
  user_id: "",
  rating: "",
  content: "",
  contact: "",
  is_hidden: false,
  platform: "",
  custom_data: "",
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
    contact: form.contact.trim() || undefined,
    is_hidden: form.is_hidden,
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

const FIELD_CLASS =
  "w-full rounded-xl border border-slate-900/20 bg-white/80 px-3 py-2 text-sm dark:border-white/20 dark:bg-white/10"

const ISSUE_BADGE_CLASS =
  "inline-flex items-center gap-1 rounded-full border border-sky-300/40 bg-sky-300/10 px-2 py-0.5 text-xs text-sky-200"

/**
 * 已转成 GitHub Issue 的标记。编号与链接是分别尽力记录的，所以两者缺任何一个
 * 都还要能显示：缺链接就退成纯文字徽章，缺编号就只说「已转 Issue」。
 */
function GithubIssueBadge({ item }: { item: FeedbackItem }) {
  const label = item.github_issue_number ? `Issue #${item.github_issue_number}` : "已转 Issue"
  if (!item.github_issue_url) {
    return (
      <span className={ISSUE_BADGE_CLASS}>
        <Github className="size-3" />
        {label}
      </span>
    )
  }

  return (
    <a
      className={`${ISSUE_BADGE_CLASS} hover:bg-sky-300/20`}
      href={item.github_issue_url}
      target="_blank"
      rel="noreferrer"
      title={item.github_issue_url}
    >
      <Github className="size-3" />
      {label}
    </a>
  )
}

/** 反馈字段。新建与编辑共用，避免两处能改的范围不一致。 */
function FeedbackFormFields({
  form,
  setForm,
}: {
  form: FeedbackFormState
  setForm: React.Dispatch<React.SetStateAction<FeedbackFormState>>
}) {
  return (
    <>
      <label className="space-y-1 text-sm">
        <span className="text-slate-700 dark:text-slate-300">用户 ID</span>
        <input
          type="text"
          placeholder="例如：u_1024"
          value={form.user_id}
          onChange={(event) => setForm((prev) => ({ ...prev, user_id: event.target.value }))}
          className={FIELD_CLASS}
          maxLength={64}
        />
      </label>
      <label className="space-y-1 text-sm">
        <span className="text-slate-700 dark:text-slate-300">评分（1-5）</span>
        <input
          type="number"
          min={1}
          max={5}
          placeholder="1 到 5"
          value={form.rating}
          onChange={(event) => setForm((prev) => ({ ...prev, rating: event.target.value }))}
          className={FIELD_CLASS}
        />
      </label>
      <label className="space-y-1 text-sm">
        <span className="text-slate-700 dark:text-slate-300">联系方式</span>
        <input
          type="text"
          placeholder="邮箱 / 手机号 / IM 账号"
          value={form.contact}
          onChange={(event) => setForm((prev) => ({ ...prev, contact: event.target.value }))}
          className={FIELD_CLASS}
          maxLength={128}
        />
      </label>
      <label className="space-y-1 text-sm">
        <span className="text-slate-700 dark:text-slate-300">平台</span>
        <select
          value={form.platform}
          onChange={(event) =>
            setForm((prev) => ({ ...prev, platform: event.target.value as "" | Platform }))
          }
          className={FIELD_CLASS}
        >
          <option value="">未指定平台</option>
          {platformOptions.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
      </label>
      <label className="space-y-1 text-sm">
        <span className="text-slate-700 dark:text-slate-300">反馈内容</span>
        <textarea
          placeholder="请保持原始语义并只修正必要内容"
          value={form.content}
          onChange={(event) => setForm((prev) => ({ ...prev, content: event.target.value }))}
          rows={5}
          className={FIELD_CLASS}
          maxLength={4096}
        />
      </label>
      <label className="space-y-1 text-sm">
        <span className="text-slate-700 dark:text-slate-300">扩展数据 JSON</span>
        <textarea
          placeholder='例如：{"channel":"beta"}'
          value={form.custom_data}
          onChange={(event) => setForm((prev) => ({ ...prev, custom_data: event.target.value }))}
          rows={4}
          className="w-full rounded-xl border border-slate-900/20 bg-white/80 px-3 py-2 font-mono text-xs dark:border-white/20 dark:bg-white/10"
        />
      </label>
      <label className="inline-flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
        <input
          type="checkbox"
          checked={form.is_hidden}
          onChange={(event) => setForm((prev) => ({ ...prev, is_hidden: event.target.checked }))}
          className="size-4"
        />
        隐藏反馈（列表默认不显示，评分仍计入统计）
      </label>
    </>
  )
}

export function FeedbacksDashboard() {
  const confirm = useConfirm()
  const [token, setToken] = React.useState(() => getSessionToken().trim())
  const [authError, setAuthError] = React.useState<string | null>(null)

  const { selectedProject, selectedProjectKey, error: projectsError } = useAdminProjects()

  const [feedbacks, setFeedbacks] = React.useState<FeedbackItem[]>([])
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
  const includeHidden = filters.includeHidden

  const [editingId, setEditingId] = React.useState<string | null>(null)
  const [form, setForm] = React.useState<FeedbackFormState>(emptyForm)
  const [createForm, setCreateForm] = React.useState<FeedbackFormState>(emptyForm)
  const [createDialogOpen, setCreateDialogOpen] = React.useState(false)
  const [editDialogOpen, setEditDialogOpen] = React.useState(false)
  const [submitLoading, setSubmitLoading] = React.useState(false)
  const [createLoading, setCreateLoading] = React.useState(false)

  const hasToken = token.trim().length > 0

  const loadFeedbacks = React.useCallback(
    async (nextOffset: number, signal?: AbortSignal) => {
      if (!token || !selectedProjectKey) {
        setFeedbacks([])
        setTotal(0)
        return
      }

      setLoading(true)
      setError(null)

      try {
        const response = await listFeedbacks(
          token,
          selectedProjectKey,
          {
            limit: PAGE_SIZE,
            offset: nextOffset,
            includeHidden: filters.includeHidden,
            search: filters.search.trim() || undefined,
            platform: filters.platform || undefined,
            rating: filters.rating ? Number(filters.rating) : undefined,
          },
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
    [selectedProjectKey, token, setTotal, filters],
  )

  React.useEffect(() => {
    const controller = new AbortController()
    void loadFeedbacks(offset, controller.signal)

    return () => {
      controller.abort()
    }
  }, [loadFeedbacks, offset])

  React.useEffect(() => {
    resetOffset()
    setForm(emptyForm)
    setCreateForm(emptyForm)
    setEditingId(null)
    setEditDialogOpen(false)
    setCreateDialogOpen(false)
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
    setCreateForm(emptyForm)
    setCreateDialogOpen(true)
  }

  function beginEdit(item: FeedbackItem) {
    setEditingId(item.id)
    setForm({
      user_id: item.user_id ?? "",
      rating: item.rating ? String(item.rating) : "",
      content: item.content,
      contact: item.contact ?? "",
      is_hidden: item.is_hidden,
      platform: item.platform ?? "",
      custom_data: toPrettyJson(item.custom_data),
    })
    setEditDialogOpen(true)
  }

  function copyFromFeedback(item: FeedbackItem) {
    setCreateForm({
      user_id: item.user_id ?? "",
      rating: item.rating ? String(item.rating) : "",
      content: item.content,
      contact: item.contact ?? "",
      is_hidden: item.is_hidden,
      platform: item.platform ?? "",
      custom_data: toPrettyJson(item.custom_data),
    })
    setCreateDialogOpen(true)
    toast.success("已复制配置到新建表单。")
  }

  function resetForm() {
    setForm(emptyForm)
  }

  /** 提交前的公共校验：返回 payload，不合法时返回 null 并已给出提示。 */
  function buildPayload(state: FeedbackFormState): FeedbackMutationInput | null {
    const payload = toMutationInput(state)
    const ratingValue = payload.rating
    if (
      ratingValue !== undefined &&
      (!Number.isInteger(ratingValue) || ratingValue < 1 || ratingValue > 5)
    ) {
      toast.error("rating 需为 1-5 的整数。")
      return null
    }

    if (!payload.content) {
      toast.error("content 不能为空。")
      return null
    }

    return payload
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

    setCreateLoading(true)

    try {
      const payload = buildPayload(createForm)
      if (!payload) {
        return
      }

      await createFeedback(token, selectedProjectKey, payload)
      toast.success("反馈已新建。")
      setCreateForm(emptyForm)
      setCreateDialogOpen(false)
      resetOffset()
      await loadFeedbacks(0)
    } catch (submitError) {
      if (isAuthError(submitError)) {
        setToken("")
        setAuthError("登录状态已过期，请重新登录。")
      }
      toast.error(getErrorMessage(submitError))
    } finally {
      setCreateLoading(false)
    }
  }

  async function handleSubmit() {
    if (!token) {
      toast.error("请先登录后再操作。")
      return
    }

    if (!selectedProjectKey) {
      toast.error("请先选择项目。")
      return
    }

    if (!editingId) {
      toast.error("请先从列表中选择要编辑的反馈。")
      return
    }

    setSubmitLoading(true)

    try {
      const payload = buildPayload(form)
      if (!payload) {
        return
      }

      await updateFeedback(token, selectedProjectKey, editingId, payload)
      toast.success("反馈已更新。")
      setEditDialogOpen(false)
      await loadFeedbacks(offset)
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

  /** 行内隐藏/取消隐藏。隐藏后若列表未开启"显示隐藏反馈"，该行会从当前页消失。 */
  async function handleToggleHidden(item: FeedbackItem) {
    if (!token || !selectedProjectKey) {
      toast.error("请先登录并选择项目。")
      return
    }

    try {
      await updateFeedback(token, selectedProjectKey, item.id, { is_hidden: !item.is_hidden })
      toast.success(item.is_hidden ? "反馈已取消隐藏。" : "反馈已隐藏。")

      // 隐藏会让该行从当前视图里消失，和删除一样可能把最后一页掏空。
      const leavesList = !includeHidden && !item.is_hidden
      if (leavesList) {
        adjustAfterDelete(feedbacks.length - 1)
      }
      const nextOffset =
        leavesList && feedbacks.length === 1 && offset > 0
          ? Math.max(0, offset - PAGE_SIZE)
          : offset
      await loadFeedbacks(nextOffset)
    } catch (toggleError) {
      if (isAuthError(toggleError)) {
        setToken("")
        setAuthError("登录状态已过期，请重新登录。")
      }
      toast.error(getErrorMessage(toggleError))
    }
  }

  async function handleDelete(id: string) {
    if (!token || !selectedProjectKey) {
      setError("请先登录并选择项目。")
      return
    }

    const confirmed = await confirm({
      title: "删除反馈",
      description: "确认删除这条反馈吗？该操作不可撤销。",
      confirmLabel: "删除",
      destructive: true,
    })
    if (!confirmed) {
      return
    }

    try {
      await deleteFeedback(token, selectedProjectKey, id)
      toast.success("反馈已删除。")
      adjustAfterDelete(feedbacks.length - 1)
      const nextOffset =
        feedbacks.length === 1 && offset > 0 ? Math.max(0, offset - PAGE_SIZE) : offset
      await loadFeedbacks(nextOffset)
      if (editingId === id) {
        resetForm()
      }
    } catch (deleteError) {
      if (isAuthError(deleteError)) {
        setToken("")
        setAuthError("登录状态已过期，请重新登录。")
      }
      setError(getErrorMessage(deleteError))
      toast.error(getErrorMessage(deleteError))
    }
  }

  // 不做 memo：操作按钮闭包了当前页数据，缓存下来会让隐藏/删除作用在上一轮的行上。
  const columns: Array<DataTableColumn<FeedbackItem>> = [
    {
      id: "content",
      header: "内容",
      label: "内容",
      alwaysVisible: true,
      className: "min-w-64",
      cell: (item) => (
        <TruncatedCell className="max-w-[28rem]" title={item.content}>
          {item.content}
        </TruncatedCell>
      ),
    },
    {
      id: "rating",
      header: "评分",
      label: "评分",
      className: "whitespace-nowrap text-xs tabular-nums",
      cell: (item) =>
        item.rating === null ? <EmptyValue>未评分</EmptyValue> : `${item.rating} 分`,
    },
    {
      id: "user_id",
      header: "用户",
      label: "用户 ID",
      className: "text-xs text-slate-600 dark:text-slate-300",
      cell: (item) => item.user_id ?? <EmptyValue>匿名</EmptyValue>,
    },
    {
      id: "contact",
      header: "联系方式",
      label: "联系方式",
      className: "text-xs text-slate-600 dark:text-slate-300",
      cell: (item) =>
        item.contact ? (
          <TruncatedCell className="max-w-[14rem]" title={item.contact}>
            {item.contact}
          </TruncatedCell>
        ) : (
          <EmptyValue />
        ),
    },
    {
      id: "status",
      header: "状态",
      label: "状态（隐藏 / Issue）",
      cell: (item) => (
        <div className="flex flex-wrap items-center gap-1">
          {item.is_hidden ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[11px] text-amber-700 dark:border-amber-300/40 dark:bg-amber-300/10 dark:text-amber-200">
              <EyeOff className="size-3" />
              已隐藏
            </span>
          ) : null}
          {item.forwarded_to_github ? <GithubIssueBadge item={item} /> : null}
          {!item.is_hidden && !item.forwarded_to_github ? (
            <span className="text-xs text-slate-500 dark:text-slate-400">正常</span>
          ) : null}
        </div>
      ),
    },
    {
      id: "platform",
      header: "平台",
      label: "平台",
      className: "whitespace-nowrap text-xs text-slate-600 dark:text-slate-300",
      cell: (item) => formatPlatformVersion(item.platform, item.platform_version) ?? <EmptyValue />,
    },
    {
      id: "created_at",
      header: "提交时间",
      label: "提交时间",
      className: "whitespace-nowrap text-xs text-slate-600 tabular-nums dark:text-slate-300",
      cell: (item) => formatTimestamp(item.created_at, "—"),
    },
    {
      id: "ip",
      header: "IP",
      label: "来源 IP",
      defaultHidden: true,
      className: "font-mono text-xs text-slate-600 dark:text-slate-300",
      cell: (item) => item.ip ?? <EmptyValue />,
    },
    {
      id: "location",
      header: "地区",
      label: "来源地区",
      defaultHidden: true,
      className: "text-xs text-slate-600 dark:text-slate-300",
      cell: (item) => {
        const parts = [item.city, item.region_name, item.country_name ?? item.country_code]
          .map((part) => part?.trim())
          .filter((part): part is string => Boolean(part))
        const unique = parts.filter((part, index) => parts.indexOf(part) === index)
        return unique.length > 0 ? unique.join(" · ") : <EmptyValue />
      },
    },
    {
      id: "id",
      header: "ID",
      label: "反馈 ID",
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
            onClick={() => copyFromFeedback(item)}
          >
            <Copy className="size-4" />
          </Button>
          <Button
            type="button"
            size="icon-sm"
            variant="outline"
            title={item.is_hidden ? "取消隐藏" : "隐藏"}
            aria-label={item.is_hidden ? "取消隐藏" : "隐藏"}
            onClick={() => void handleToggleHidden(item)}
          >
            {item.is_hidden ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
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
        title="用户反馈管理"
        description="查看并维护反馈内容、评分、联系方式、平台信息与扩展数据。"
        badge="Verhub Feedbacks"
        actions={
          <>
            <ApiReferenceDrawer
              tag="Feedbacks"
              title="反馈接口文档"
              projectKey={selectedProject?.project_key}
            />
            <Button type="button" disabled={!selectedProjectKey} onClick={openCreateDialog}>
              <Plus className="size-4" />
              新增反馈
            </Button>
          </>
        }
      />

      {authError || projectsError ? (
        <AdminCard className="flex items-center gap-2 text-sm text-rose-500 dark:text-rose-300">
          <AlertTriangle className="size-4" />
          {authError ?? projectsError}
        </AdminCard>
      ) : null}

      <AdminCard as="section" className="space-y-4">
        <h2 className="text-lg font-semibold">反馈列表</h2>

        <DataTable
          storageKey="feedbacks"
          columns={columns}
          rows={feedbacks}
          getRowId={(item) => item.id}
          loading={hasToken && Boolean(selectedProjectKey) && loading}
          error={error}
          emptyMessage={
            !hasToken
              ? "请先在登录页完成登录后查看反馈数据。"
              : !selectedProjectKey
                ? "暂无项目，请先去项目管理页创建项目。"
                : "当前筛选条件下暂无反馈。"
          }
          rowClassName={(item) => (item.is_hidden ? "opacity-60" : undefined)}
          search={{
            value: filters.search,
            onChange: (value) => updateFilter("search", value),
            placeholder: "搜索内容 / 用户 / 联系方式",
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
                label="评分"
                value={filters.rating}
                onChange={(value) => updateFilter("rating", value)}
                options={ratingOptions}
              />
            </>
          }
          onResetFilters={resetFilters}
          toolbarExtra={
            // 隐藏的反馈默认不列出；开关只影响展示，评分统计始终按全量算。
            <DataTableToggle
              label="显示已隐藏"
              checked={filters.includeHidden}
              onChange={(checked) => updateFilter("includeHidden", checked)}
            />
          }
          renderExpanded={(item) => (
            <div className="space-y-3">
              <ClientOriginBadges origin={item} />
              <JsonField label="custom_data" value={item.custom_data} />
            </div>
          )}
          pagination={{ total, page, totalPages, hasPrev, hasNext, onPrev, onNext }}
        />
      </AdminCard>

      <AdminFormDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        title="新增反馈"
        description="补录渠道外收集到的反馈；来源信息（IP、地理位置）不会被伪造填充。"
        submitLabel="创建反馈"
        submitIcon={<Plus className="size-4" />}
        submitting={createLoading}
        submitDisabled={!selectedProjectKey}
        onSubmit={() => void handleCreate()}
        formValue={createForm}
        className="sm:max-w-3xl"
      >
        <FeedbackFormFields form={createForm} setForm={setCreateForm} />
      </AdminFormDialog>

      <AdminFormDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        title="编辑反馈"
        description="修改反馈内容、评分、联系方式、平台、扩展数据与隐藏状态。"
        submitLabel="保存反馈"
        submitIcon={<Save className="size-4" />}
        submitting={submitLoading}
        submitDisabled={!editingId}
        onSubmit={() => void handleSubmit()}
        formValue={form}
        className="sm:max-w-3xl"
      >
        <FeedbackFormFields form={form} setForm={setForm} />
      </AdminFormDialog>
    </section>
  )
}
