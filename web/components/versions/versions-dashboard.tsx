"use client"

import * as React from "react"
import { AlertTriangle, CheckCircle2, Loader2, Plus } from "lucide-react"

import { Button } from "@workspace/ui/components/button"

import { ApiError, isAuthError } from "@/lib/api-client"
import { getSessionToken } from "@/lib/auth-session"
import { AdminCard, AdminItemCard } from "@/components/admin/admin-card"
import { AdminListHeader, AdminPagination } from "@/components/admin/admin-list"
import { AdminPageHeader } from "@/components/admin/admin-page-header"
import { useSharedProjectSelection } from "@/hooks/use-shared-project-selection"
import { listProjects, type ProjectItem } from "@/lib/projects-api"
import {
  createVersion,
  listVersions,
  updateVersion,
  type ClientPlatform,
  type CreateVersionInput,
  type VersionItem,
} from "@/lib/versions-api"

const PROJECT_PAGE_SIZE = 100
const VERSION_PAGE_SIZE = 10

const platformOptions: Array<{ label: string; value: ClientPlatform }> = [
  { label: "iOS", value: "ios" },
  { label: "Android", value: "android" },
  { label: "Windows", value: "windows" },
  { label: "macOS", value: "mac" },
  { label: "Web", value: "web" },
]

type VersionFormState = {
  version: string
  title: string
  content: string
  download_url: string
  forced: boolean
  platform: "" | ClientPlatform
  custom_data: string
}

const emptyVersionForm: VersionFormState = {
  version: "",
  title: "",
  content: "",
  download_url: "",
  forced: false,
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

function parseJsonInput(value: string): Record<string, unknown> | undefined {
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

function toCreateInput(form: VersionFormState): CreateVersionInput {
  return {
    version: form.version.trim(),
    title: form.title.trim() || undefined,
    content: form.content.trim() || undefined,
    download_url: form.download_url.trim(),
    forced: form.forced,
    platform: form.platform || undefined,
    custom_data: parseJsonInput(form.custom_data),
  }
}

export function VersionsDashboard() {
  const [token, setToken] = React.useState("")
  const [authError, setAuthError] = React.useState<string | null>(null)

  const [projects, setProjects] = React.useState<ProjectItem[]>([])
  const [projectsLoading, setProjectsLoading] = React.useState(false)
  const { selectedProjectId, setSelectedProjectId } = useSharedProjectSelection()

  const [versions, setVersions] = React.useState<VersionItem[]>([])
  const [totalVersions, setTotalVersions] = React.useState(0)
  const [offset, setOffset] = React.useState(0)
  const [versionsLoading, setVersionsLoading] = React.useState(false)
  const [versionsError, setVersionsError] = React.useState<string | null>(null)

  const [form, setForm] = React.useState<VersionFormState>(emptyVersionForm)
  const [editingVersionId, setEditingVersionId] = React.useState<string | null>(null)
  const [submitLoading, setSubmitLoading] = React.useState(false)
  const [submitMessage, setSubmitMessage] = React.useState<string | null>(null)

  const hasToken = token.trim().length > 0
  const page = Math.floor(offset / VERSION_PAGE_SIZE) + 1
  const totalPages = Math.max(1, Math.ceil(totalVersions / VERSION_PAGE_SIZE))

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
    } catch (error) {
      if (isAuthError(error)) {
        setToken("")
        setAuthError("登录状态已过期，请重新登录。")
      }
      setAuthError(getErrorMessage(error))
      setProjects([])
      setSelectedProjectId("")
    } finally {
      setProjectsLoading(false)
    }
  }, [selectedProjectId, setSelectedProjectId, token])

  const loadVersions = React.useCallback(
    async (nextOffset: number, signal?: AbortSignal) => {
      if (!token || !selectedProjectId) {
        setVersions([])
        setTotalVersions(0)
        return
      }

      setVersionsLoading(true)
      setVersionsError(null)

      try {
        const response = await listVersions(
          token,
          selectedProjectId,
          { limit: VERSION_PAGE_SIZE, offset: nextOffset },
          signal,
        )
        setVersions(response.data)
        setTotalVersions(response.total)
      } catch (error) {
        if (signal?.aborted) {
          return
        }
        if (isAuthError(error)) {
          setToken("")
          setAuthError("登录状态已过期，请重新登录。")
        }
        setVersionsError(getErrorMessage(error))
        setVersions([])
        setTotalVersions(0)
      } finally {
        if (!signal?.aborted) {
          setVersionsLoading(false)
        }
      }
    },
    [selectedProjectId, token],
  )

  React.useEffect(() => {
    const savedToken = getSessionToken().trim()
    if (savedToken) {
      setToken(savedToken)
    }
  }, [])

  React.useEffect(() => {
    void loadProjects()
  }, [loadProjects])

  React.useEffect(() => {
    const controller = new AbortController()
    void loadVersions(offset, controller.signal)

    return () => {
      controller.abort()
    }
  }, [loadVersions, offset])

  React.useEffect(() => {
    setOffset(0)
  }, [selectedProjectId])

  async function handleCreateVersion(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!token) {
      setSubmitMessage("请先登录后再操作。")
      return
    }

    if (!selectedProjectId) {
      setSubmitMessage("请先选择一个项目。")
      return
    }

    setSubmitLoading(true)
    setSubmitMessage(null)

    try {
      const payload = toCreateInput(form)
      if (!payload.version || !payload.download_url) {
        setSubmitMessage("version 与 download_url 为必填项。")
        return
      }

      if (editingVersionId) {
        await updateVersion(token, selectedProjectId, editingVersionId, payload)
        setSubmitMessage("版本已更新。")
      } else {
        await createVersion(token, selectedProjectId, payload)
        setSubmitMessage("版本已发布。")
      }
      setForm(emptyVersionForm)
      setEditingVersionId(null)
      setOffset(0)
      await loadVersions(0)
    } catch (error) {
      if (isAuthError(error)) {
        setToken("")
        setAuthError("登录状态已过期，请重新登录。")
      }
      setSubmitMessage(getErrorMessage(error))
    } finally {
      setSubmitLoading(false)
    }
  }

  function beginEdit(version: VersionItem) {
    setEditingVersionId(version.id)
    setForm({
      version: version.version,
      title: version.title ?? "",
      content: version.content ?? "",
      download_url: version.download_url,
      forced: version.forced,
      platform: version.platform ?? "",
      custom_data: version.custom_data ? JSON.stringify(version.custom_data, null, 2) : "",
    })
    setSubmitMessage(null)
  }

  function resetForm() {
    setEditingVersionId(null)
    setForm(emptyVersionForm)
    setSubmitMessage(null)
  }

  return (
    <section className="space-y-6">
      <AdminPageHeader
        title="版本发布管理"
        description="为指定项目发布客户端版本，配置平台、强更策略和下载地址，并按分页浏览历史版本。"
        badge="Verhub Versions"
      />

      <section className="grid gap-6 lg:grid-cols-[1.1fr_1.9fr]">
        <AdminCard className="space-y-6">
          <div className="space-y-2">
            <h2 className="text-lg font-semibold">项目选择</h2>
          </div>

          <div className="space-y-2">
            <label className="text-sm text-slate-700 dark:text-slate-300" htmlFor="project-select">
              目标项目
            </label>
            <select
              id="project-select"
              className="w-full rounded-xl border border-slate-900/20 bg-white/80 px-3 py-2 text-sm ring-cyan-300 transition outline-none focus:ring-2 dark:border-white/20 dark:bg-white/5"
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
            <h2 className="text-lg font-semibold">
              {editingVersionId ? "编辑版本" : "发布新版本"}
            </h2>
            <p className="text-sm text-slate-700 dark:text-slate-300">
              与后端 CreateVersionDto 对齐：version 与 download_url 必填，custom_data 需为 JSON
              对象。
            </p>
          </div>

          <form className="grid gap-3" onSubmit={handleCreateVersion}>
            <label className="space-y-1 text-sm">
              <span className="text-slate-700 dark:text-slate-300">版本号</span>
              <input
                type="text"
                placeholder="例如：2.3.0"
                value={form.version}
                onChange={(event) => setForm((prev) => ({ ...prev, version: event.target.value }))}
                className="w-full rounded-xl border border-slate-900/20 bg-white/80 px-3 py-2 text-sm ring-cyan-300 transition outline-none focus:ring-2 dark:border-white/20 dark:bg-white/10"
                required
                maxLength={64}
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-slate-700 dark:text-slate-300">下载地址</span>
              <input
                type="url"
                placeholder="https://example.com/download"
                value={form.download_url}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, download_url: event.target.value }))
                }
                className="w-full rounded-xl border border-slate-900/20 bg-white/80 px-3 py-2 text-sm ring-cyan-300 transition outline-none focus:ring-2 dark:border-white/20 dark:bg-white/10"
                required
                maxLength={2048}
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-slate-700 dark:text-slate-300">版本标题（可选）</span>
              <input
                type="text"
                placeholder="例如：稳定版更新"
                value={form.title}
                onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
                className="w-full rounded-xl border border-slate-900/20 bg-white/80 px-3 py-2 text-sm ring-cyan-300 transition outline-none focus:ring-2 dark:border-white/20 dark:bg-white/10"
                maxLength={128}
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-slate-700 dark:text-slate-300">更新内容（可选）</span>
              <textarea
                placeholder="描述本次版本的主要变化"
                value={form.content}
                onChange={(event) => setForm((prev) => ({ ...prev, content: event.target.value }))}
                rows={4}
                className="w-full rounded-xl border border-slate-900/20 bg-white/80 px-3 py-2 text-sm ring-cyan-300 transition outline-none focus:ring-2 dark:border-white/20 dark:bg-white/10"
                maxLength={4096}
              />
            </label>

            <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
              <label className="space-y-1 text-sm">
                <span className="text-slate-700 dark:text-slate-300">平台范围</span>
                <select
                  aria-label="版本平台"
                  value={form.platform}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      platform: event.target.value as "" | ClientPlatform,
                    }))
                  }
                  className="w-full rounded-xl border border-slate-900/20 bg-white/80 px-3 py-2 text-sm ring-cyan-300 transition outline-none focus:ring-2 dark:border-white/20 dark:bg-white/10"
                >
                  <option value="">全部平台（默认）</option>
                  {platformOptions.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="inline-flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                <input
                  type="checkbox"
                  checked={form.forced}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, forced: event.target.checked }))
                  }
                  className="size-4 rounded border-white/30 bg-white/10"
                />
                强制更新
              </label>
            </div>

            <label className="space-y-1 text-sm">
              <span className="text-slate-700 dark:text-slate-300">扩展数据 JSON（可选）</span>
              <textarea
                placeholder='例如：{"channel":"beta"}'
                value={form.custom_data}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, custom_data: event.target.value }))
                }
                rows={4}
                className="w-full rounded-xl border border-slate-900/20 bg-white/80 px-3 py-2 font-mono text-xs ring-cyan-300 transition outline-none focus:ring-2 dark:border-white/20 dark:bg-white/10"
              />
            </label>

            <Button
              type="submit"
              className="bg-emerald-300 text-emerald-950 hover:bg-emerald-200"
              disabled={submitLoading || !selectedProjectId}
            >
              {submitLoading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Plus className="size-4" />
              )}
              {editingVersionId ? "保存版本" : "发布版本"}
            </Button>

            {editingVersionId ? (
              <Button
                type="button"
                variant="outline"
                className="border-white/25 bg-white/5"
                onClick={resetForm}
              >
                取消编辑
              </Button>
            ) : null}

            {submitMessage ? (
              <p className="inline-flex items-center gap-2 text-sm text-slate-700 dark:text-slate-100">
                <CheckCircle2 className="size-4 text-emerald-300" />
                {submitMessage}
              </p>
            ) : null}
          </form>
        </AdminCard>
      </section>

      <AdminCard as="section">
        <AdminListHeader
          title="版本列表"
          total={totalVersions}
          page={page}
          totalPages={totalPages}
        />

        {!hasToken ? (
          <div className="rounded-2xl border border-dashed border-cyan-300/40 bg-cyan-100/70 p-6 text-sm text-cyan-800 dark:border-cyan-200/30 dark:bg-cyan-100/5 dark:text-cyan-100">
            请先在登录页完成登录后查看版本数据。
          </div>
        ) : null}

        {hasToken && !selectedProjectId ? (
          <div className="rounded-2xl border border-dashed border-slate-900/20 bg-slate-100/60 p-6 text-sm text-slate-600 dark:border-white/20 dark:bg-white/5 dark:text-slate-300">
            暂无项目，请先去项目管理页创建项目。
          </div>
        ) : null}

        {hasToken && selectedProjectId && versionsLoading ? (
          <div className="flex items-center gap-2 rounded-2xl border border-slate-900/15 bg-slate-100/60 p-6 text-sm text-slate-700 dark:border-white/15 dark:bg-white/5 dark:text-slate-200">
            <Loader2 className="size-4 animate-spin" />
            正在加载版本列表...
          </div>
        ) : null}

        {hasToken && selectedProjectId && !versionsLoading && versionsError ? (
          <div className="rounded-2xl border border-rose-300/30 bg-rose-300/10 p-6 text-sm text-rose-200">
            {versionsError}
          </div>
        ) : null}

        {hasToken &&
        selectedProjectId &&
        !versionsLoading &&
        !versionsError &&
        versions.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/20 bg-white/5 p-6 text-sm text-slate-300">
            暂无版本，使用上方表单发布第一条版本记录。
          </div>
        ) : null}

        {hasToken &&
        selectedProjectId &&
        !versionsLoading &&
        !versionsError &&
        versions.length > 0 ? (
          <div className="space-y-3">
            {versions.map((version) => (
              <AdminItemCard key={version.id}>
                <div className="space-y-1">
                  <p className="text-base font-medium">{version.version}</p>
                  <p className="font-mono text-xs text-cyan-100/90">ID: {version.id}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-300">
                    创建于 {new Date(version.created_at).toLocaleString("zh-CN")}
                  </p>
                  <p className="text-sm text-slate-700 dark:text-slate-200/90">
                    {version.title ?? "无标题"}
                  </p>
                  {version.content ? (
                    <p className="text-sm text-slate-600 dark:text-slate-300">{version.content}</p>
                  ) : null}
                  <a
                    className="text-sm text-cyan-200 underline-offset-2 hover:underline"
                    href={version.download_url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {version.download_url}
                  </a>
                  <p className="text-xs text-slate-500 dark:text-slate-300">
                    平台：{version.platform ?? "全部"} | 强更：{version.forced ? "是" : "否"}
                  </p>
                  <div className="pt-1">
                    <Button
                      type="button"
                      variant="outline"
                      className="border-white/20 bg-white/5"
                      onClick={() => beginEdit(version)}
                    >
                      编辑版本
                    </Button>
                  </div>
                </div>
              </AdminItemCard>
            ))}

            <AdminPagination
              hasPrev={offset > 0}
              hasNext={offset + VERSION_PAGE_SIZE < totalVersions}
              onPrev={() => setOffset((prev) => Math.max(0, prev - VERSION_PAGE_SIZE))}
              onNext={() => setOffset((prev) => prev + VERSION_PAGE_SIZE)}
            />
          </div>
        ) : null}
      </AdminCard>
    </section>
  )
}
