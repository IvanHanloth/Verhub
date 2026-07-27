"use client"

import * as React from "react"
import { AlertTriangle, Copy, Eye, EyeOff, PencilLine, Plus, Save, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@workspace/ui/components/button"

import { isAuthError } from "@/lib/api-client"
import { getErrorMessage } from "@/lib/error-utils"
import { useConfirm } from "@/components/common/confirm-dialog"
import { TableSkeleton } from "@/components/common/skeleton"
import { usePagination } from "@/hooks/use-pagination"
import { getSessionToken } from "@/lib/auth-session"
import { AdminCard } from "@/components/admin/admin-card"
import { AdminFormDialog } from "@/components/admin/admin-form-dialog"
import { AdminListHeader, AdminPagination } from "@/components/admin/admin-list"
import { AdminPageHeader } from "@/components/admin/admin-page-header"
import { ClientOriginBadges } from "@/components/common/client-origin-badges"
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
import { PLATFORM_OPTIONS as platformOptions, type Platform } from "@/lib/platform"

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
  const [includeHidden, setIncludeHidden] = React.useState(false)

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
          { limit: PAGE_SIZE, offset: nextOffset, includeHidden },
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
    [selectedProjectKey, token, setTotal, includeHidden],
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

      <AdminCard as="section">
        <AdminListHeader title="反馈列表" total={total} page={page} totalPages={totalPages} />

        {/* 隐藏的反馈默认不列出；开关只影响展示，评分统计始终按全量算。 */}
        <label className="mb-3 inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
          <input
            type="checkbox"
            checked={includeHidden}
            onChange={(event) => {
              setIncludeHidden(event.target.checked)
              resetOffset()
            }}
            className="size-4"
          />
          显示隐藏的反馈
        </label>

        {!hasToken ? (
          <div className="rounded-2xl border border-dashed border-rose-200/30 bg-rose-100/5 p-6 text-sm text-rose-100">
            请先在登录页完成登录后查看反馈数据。
          </div>
        ) : null}

        {hasToken && !selectedProjectKey ? (
          <div className="rounded-2xl border border-dashed border-white/20 bg-white/5 p-6 text-sm text-slate-300">
            暂无项目，请先去项目管理页创建项目。
          </div>
        ) : null}

        {hasToken && selectedProjectKey && loading ? <TableSkeleton /> : null}

        {hasToken && selectedProjectKey && !loading && error ? (
          <div className="rounded-2xl border border-rose-300/30 bg-rose-300/10 p-6 text-sm text-rose-200">
            {error}
          </div>
        ) : null}

        {hasToken && selectedProjectKey && !loading && !error && feedbacks.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/20 bg-white/5 p-6 text-sm text-slate-300">
            暂无反馈，等待客户端上报后在此管理。
          </div>
        ) : null}

        {hasToken && selectedProjectKey && !loading && !error && feedbacks.length > 0 ? (
          <div className="space-y-3">
            <div className="overflow-x-auto rounded-2xl border border-white/10 bg-white/5">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-left text-slate-300">
                    <th className="px-3 py-2 font-medium">内容</th>
                    <th className="px-3 py-2 font-medium">用户/评分</th>
                    <th className="px-3 py-2 font-medium">来源</th>
                    <th className="px-3 py-2 font-medium">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {feedbacks.map((item) => (
                    <tr key={item.id} className="border-b border-white/5 align-top">
                      <td className="px-3 py-2 text-slate-200">
                        {item.is_hidden ? (
                          <span className="mb-1 inline-flex items-center gap-1 rounded-full border border-amber-300/40 bg-amber-300/10 px-2 py-0.5 text-xs text-amber-200">
                            <EyeOff className="size-3" />
                            已隐藏
                          </span>
                        ) : null}
                        <p>{item.content}</p>
                        {item.custom_data ? (
                          <div className="mt-2 max-w-md">
                            <JsonField label="custom_data" value={item.custom_data} />
                          </div>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 text-xs text-slate-300">
                        <p>{item.user_id ?? "匿名"}</p>
                        <p>评分：{item.rating ?? "未评分"}</p>
                        <p>联系方式：{item.contact ?? "未留"}</p>
                      </td>
                      {/* 平台已并入来源徽章，避免同一信息占两列。 */}
                      <td className="max-w-xs px-3 py-2 text-xs text-slate-300">
                        <ClientOriginBadges origin={item} />
                        {!item.ip && !item.platform ? <span>未采集</span> : null}
                      </td>
                      <td className="px-3 py-2">
                        {/* 图标按钮：名字挂在 aria-label / title 上，读屏与悬停都拿得到。 */}
                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            size="icon"
                            variant="outline"
                            className="border-white/20 bg-white/5"
                            title="复制配置"
                            aria-label="复制配置"
                            onClick={() => copyFromFeedback(item)}
                          >
                            <Copy className="size-4" />
                          </Button>
                          <Button
                            type="button"
                            size="icon"
                            variant="outline"
                            className="border-white/20 bg-white/5"
                            title={item.is_hidden ? "取消隐藏" : "隐藏"}
                            aria-label={item.is_hidden ? "取消隐藏" : "隐藏"}
                            onClick={() => void handleToggleHidden(item)}
                          >
                            {item.is_hidden ? (
                              <Eye className="size-4" />
                            ) : (
                              <EyeOff className="size-4" />
                            )}
                          </Button>
                          <Button
                            type="button"
                            size="icon"
                            variant="outline"
                            className="border-white/20 bg-white/5"
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
        title="新增反馈"
        description="补录渠道外收集到的反馈；来源信息（IP、地理位置）不会被伪造填充。"
        submitLabel="创建反馈"
        submitIcon={<Plus className="size-4" />}
        submitting={createLoading}
        submitDisabled={!selectedProjectKey}
        onSubmit={() => void handleCreate()}
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
        className="sm:max-w-3xl"
      >
        <FeedbackFormFields form={form} setForm={setForm} />
      </AdminFormDialog>
    </section>
  )
}
