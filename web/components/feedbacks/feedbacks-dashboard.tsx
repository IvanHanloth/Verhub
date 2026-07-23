"use client"

import * as React from "react"
import { AlertTriangle, Copy, PencilLine, Plus, Save, Trash2 } from "lucide-react"
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
  platform: "" | Platform
  custom_data: string
}

const emptyForm: FeedbackFormState = {
  user_id: "",
  rating: "",
  content: "",
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
    [selectedProjectKey, token, setTotal],
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
        description="查看并维护反馈内容、评分、平台信息与扩展数据。"
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
        description="修改反馈内容、评分、平台与扩展数据。"
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
