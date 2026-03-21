"use client"

import * as React from "react"
import { AlertTriangle, CheckCircle2, Copy, Loader2, PencilLine, Save, Trash2 } from "lucide-react"

import { Button } from "@workspace/ui/components/button"

import { ApiError, isAuthError } from "@/lib/api-client"
import { getSessionToken } from "@/lib/auth-session"
import { AdminCard } from "@/components/admin/admin-card"
import { AdminListHeader, AdminPagination } from "@/components/admin/admin-list"
import { ManagementListItem } from "@/components/admin/management-list-item"
import { AdminPageHeader } from "@/components/admin/admin-page-header"
import { ProjectApiOverview } from "@/components/admin/project-api-overview"
import { ProjectSelectorCard } from "@/components/admin/project-selector-card"
import { useSharedProjectSelection } from "@/hooks/use-shared-project-selection"
import {
  deleteFeedback,
  listFeedbacks,
  updateFeedback,
  type ClientPlatform,
  type FeedbackItem,
  type FeedbackMutationInput,
} from "@/lib/feedbacks-api"
import { listProjects, type ProjectItem } from "@/lib/projects-api"

const PROJECT_PAGE_SIZE = 100
const PAGE_SIZE = 10

const platformOptions: Array<{ label: string; value: ClientPlatform }> = [
  { label: "iOS", value: "ios" },
  { label: "Android", value: "android" },
  { label: "Windows", value: "windows" },
  { label: "macOS", value: "mac" },
  { label: "Web", value: "web" },
]

type FeedbackFormState = {
  user_id: string
  rating: string
  content: string
  platform: "" | ClientPlatform
  custom_data: string
}

const emptyForm: FeedbackFormState = {
  user_id: "",
  rating: "",
  content: "",
  platform: "",
  custom_data: "",
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

export function FeedbacksDashboard() {
  const [token, setToken] = React.useState(() => getSessionToken().trim())
  const [authError, setAuthError] = React.useState<string | null>(null)

  const [projects, setProjects] = React.useState<ProjectItem[]>([])
  const [projectsLoading, setProjectsLoading] = React.useState(false)
  const { selectedProjectKey, setSelectedProjectKey } = useSharedProjectSelection()

  const [feedbacks, setFeedbacks] = React.useState<FeedbackItem[]>([])
  const [total, setTotal] = React.useState(0)
  const [offset, setOffset] = React.useState(0)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const [editingId, setEditingId] = React.useState<string | null>(null)
  const [form, setForm] = React.useState<FeedbackFormState>(emptyForm)
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
    [selectedProjectKey, token],
  )

  React.useEffect(() => {
    void loadProjects()
  }, [loadProjects])

  React.useEffect(() => {
    const controller = new AbortController()
    void loadFeedbacks(offset, controller.signal)

    return () => {
      controller.abort()
    }
  }, [loadFeedbacks, offset])

  React.useEffect(() => {
    setOffset(0)
    setEditingId(null)
    setForm(emptyForm)
    setSubmitMessage(null)
  }, [selectedProjectKey])

  function beginEdit(item: FeedbackItem) {
    setEditingId(item.id)
    setForm({
      user_id: item.user_id ?? "",
      rating: item.rating ? String(item.rating) : "",
      content: item.content,
      platform: item.platform ?? "",
      custom_data: toPrettyJson(item.custom_data),
    })
    setSubmitMessage(null)
  }

  function copyFromFeedback(item: FeedbackItem) {
    setEditingId(null)
    setForm({
      user_id: item.user_id ?? "",
      rating: item.rating ? String(item.rating) : "",
      content: item.content,
      platform: item.platform ?? "",
      custom_data: toPrettyJson(item.custom_data),
    })
    setSubmitMessage("已复制配置到表单，可直接编辑后保存。")
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

    if (!editingId) {
      setSubmitMessage("请先从列表中选择要编辑的反馈。")
      return
    }

    setSubmitLoading(true)
    setSubmitMessage(null)

    try {
      const payload = toMutationInput(form)
      const ratingValue = payload.rating
      if (
        ratingValue !== undefined &&
        (!Number.isInteger(ratingValue) || ratingValue < 1 || ratingValue > 5)
      ) {
        setSubmitMessage("rating 需为 1-5 的整数。")
        return
      }

      if (!payload.content) {
        setSubmitMessage("content 不能为空。")
        return
      }

      await updateFeedback(token, selectedProjectKey, editingId, payload)
      setSubmitMessage("反馈已更新。")
      await loadFeedbacks(offset)
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

    const confirmed = window.confirm("确认删除这条反馈吗？该操作不可撤销。")
    if (!confirmed) {
      return
    }

    try {
      await deleteFeedback(token, selectedProjectKey, id)
      const nextOffset =
        feedbacks.length === 1 && offset > 0 ? Math.max(0, offset - PAGE_SIZE) : offset
      setOffset(nextOffset)
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
    }
  }

  return (
    <section className="space-y-6">
      <AdminPageHeader
        title="用户反馈管理"
        description="查看并维护反馈内容、评分、平台信息与扩展数据。"
        badge="Verhub Feedbacks"
      />

      <section className="grid gap-6 lg:grid-cols-[1.1fr_1.9fr]">
        <div className="space-y-6">
          <ProjectSelectorCard
            selectId="feedback-project-select"
            selectedProjectKey={selectedProjectKey}
            projects={projects}
            disabled={!hasToken || projectsLoading || projects.length === 0}
            ringClassName="ring-rose-300"
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
            title="接口示例 · 反馈"
            projectKey={selectedProject?.project_key}
            groups={[
              {
                label: "公开接口",
                endpoints: [
                  {
                    method: "POST",
                    path: "/api/v1/public/{projectKey}/feedbacks",
                    description: "客户端提交反馈",
                    auth: { tokenRequired: false },
                    requestBody: {
                      content: "希望增加批量导出功能",
                      rating: 4,
                      platform: "web",
                      user_id: "u_1024",
                      custom_data: { page: "settings", locale: "zh-CN" },
                    },
                  },
                ],
              },
              {
                label: "管理接口",
                endpoints: [
                  {
                    method: "GET",
                    path: "/api/v1/admin/projects/{projectKey}/feedbacks",
                    description: "分页获取反馈",
                    auth: { tokenRequired: true },
                  },
                  {
                    method: "PATCH",
                    path: "/api/v1/admin/projects/{projectKey}/feedbacks/{id}",
                    description: "编辑反馈",
                    auth: { tokenRequired: true },
                    requestBody: {
                      content: "已复现并记录需求，计划下个版本支持",
                      rating: 5,
                    },
                  },
                  {
                    method: "DELETE",
                    path: "/api/v1/admin/projects/{projectKey}/feedbacks/{id}",
                    description: "删除反馈",
                    auth: { tokenRequired: true },
                  },
                ],
              },
            ]}
          />
        </div>

        <AdminCard className="space-y-6">
          <div className="space-y-2">
            <h2 className="text-lg font-semibold">编辑反馈</h2>
            <p className="text-sm text-slate-200/90">先从列表选择一条反馈，再在此修改并保存。</p>
          </div>

          <form className="grid gap-3" onSubmit={handleSubmit}>
            <label className="space-y-1 text-sm">
              <span className="text-slate-700 dark:text-slate-300">用户 ID</span>
              <input
                type="text"
                placeholder="例如：u_1024"
                value={form.user_id}
                onChange={(event) => setForm((prev) => ({ ...prev, user_id: event.target.value }))}
                className="w-full rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-sm ring-rose-300 transition outline-none focus:ring-2"
                maxLength={64}
                disabled={!editingId}
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
                className="w-full rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-sm ring-rose-300 transition outline-none focus:ring-2"
                disabled={!editingId}
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-slate-700 dark:text-slate-300">平台</span>
              <select
                aria-label="反馈平台"
                value={form.platform}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    platform: event.target.value as "" | ClientPlatform,
                  }))
                }
                className="w-full rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-sm ring-rose-300 transition outline-none focus:ring-2"
                disabled={!editingId}
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
                className="w-full rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-sm ring-rose-300 transition outline-none focus:ring-2"
                maxLength={4096}
                disabled={!editingId}
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-slate-700 dark:text-slate-300">扩展数据 JSON</span>
              <textarea
                placeholder='例如：{"channel":"beta"}'
                value={form.custom_data}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, custom_data: event.target.value }))
                }
                rows={4}
                className="w-full rounded-xl border border-white/20 bg-white/10 px-3 py-2 font-mono text-xs ring-rose-300 transition outline-none focus:ring-2"
                disabled={!editingId}
              />
            </label>

            <div className="flex flex-wrap gap-2">
              <Button
                type="submit"
                className="bg-emerald-300 text-emerald-950 hover:bg-emerald-200"
                disabled={submitLoading || !editingId}
              >
                {submitLoading ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Save className="size-4" />
                )}
                保存反馈
              </Button>
              <Button
                type="button"
                variant="outline"
                className="border-white/25 bg-white/5"
                onClick={resetForm}
              >
                取消编辑
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

        {hasToken && selectedProjectKey && loading ? (
          <div className="flex items-center gap-2 rounded-2xl border border-white/15 bg-white/5 p-6 text-sm text-slate-200">
            <Loader2 className="size-4 animate-spin" />
            正在加载反馈列表...
          </div>
        ) : null}

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
            {feedbacks.map((item) => (
              <ManagementListItem
                key={item.id}
                className="border-white/15 bg-white/8"
                title={item.content}
                meta={
                  <>
                    <p>创建于 {new Date(item.created_at * 1000).toLocaleString("zh-CN")}</p>
                    <p>用户：{item.user_id ?? "匿名"}</p>
                    <p>评分：{item.rating ?? "未评分"}</p>
                    <p>平台：{item.platform ?? "未指定"}</p>
                  </>
                }
                actions={
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      className="border-white/20 bg-white/5"
                      onClick={() => copyFromFeedback(item)}
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
