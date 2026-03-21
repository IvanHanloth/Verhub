"use client"

import * as React from "react"
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  DownloadCloud,
  Loader2,
  PencilLine,
  Plus,
  Sparkles,
  Star,
  Trash2,
} from "lucide-react"

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
import { listProjects, type ProjectItem } from "@/lib/projects-api"
import {
  createVersion,
  deleteVersion,
  importVersionsFromGithubReleases,
  listVersions,
  previewVersionFromGithubRelease,
  updateVersion,
  type ClientPlatform,
  type CreateVersionInput,
  type VersionDownloadLink,
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
  download_links_json: string
  forced: boolean
  is_latest: boolean
  is_preview: boolean
  published_at: string
  platform: "" | ClientPlatform
  custom_data: string
}

const emptyVersionForm: VersionFormState = {
  version: "",
  title: "",
  content: "",
  download_url: "",
  download_links_json: "",
  forced: false,
  is_latest: true,
  is_preview: false,
  published_at: "",
  platform: "",
  custom_data: "",
}

function toDateTimeLocal(timestampSeconds: number): string {
  const date = new Date(timestampSeconds * 1000)
  const offsetMs = date.getTimezoneOffset() * 60 * 1000
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16)
}

function toTimestampSeconds(value: string): number | undefined {
  const trimmed = value.trim()
  if (!trimmed) {
    return undefined
  }

  const millis = Date.parse(trimmed)
  if (Number.isNaN(millis)) {
    throw new Error("发布时间格式不正确")
  }

  return Math.floor(millis / 1000)
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

function parseDownloadLinks(value: string): VersionDownloadLink[] | undefined {
  const trimmed = value.trim()
  if (!trimmed) {
    return undefined
  }

  const parsed = JSON.parse(trimmed) as unknown
  if (!Array.isArray(parsed)) {
    throw new Error("download_links 必须是数组。")
  }

  const links = parsed
    .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
    .map((item) => ({
      url: typeof item.url === "string" ? item.url.trim() : "",
      name: typeof item.name === "string" ? item.name.trim() : undefined,
      platform: typeof item.platform === "string" ? item.platform.trim() : undefined,
    }))
    .filter((item) => item.url.length > 0)

  return links
}

function toCreateInput(form: VersionFormState): CreateVersionInput {
  const trimmedDownloadUrl = form.download_url.trim()

  return {
    version: form.version.trim(),
    title: form.title.trim() || undefined,
    content: form.content.trim() || undefined,
    download_url: trimmedDownloadUrl || undefined,
    download_links: parseDownloadLinks(form.download_links_json),
    forced: form.forced,
    is_latest: form.is_latest,
    is_preview: form.is_preview,
    platform: form.platform || undefined,
    custom_data: parseJsonInput(form.custom_data),
    published_at: toTimestampSeconds(form.published_at),
  }
}

export function VersionsDashboard() {
  const [token, setToken] = React.useState(() => getSessionToken().trim())
  const [authError, setAuthError] = React.useState<string | null>(null)

  const [projects, setProjects] = React.useState<ProjectItem[]>([])
  const [projectsLoading, setProjectsLoading] = React.useState(false)
  const { selectedProjectKey, setSelectedProjectKey } = useSharedProjectSelection()

  const [versions, setVersions] = React.useState<VersionItem[]>([])
  const [totalVersions, setTotalVersions] = React.useState(0)
  const [offset, setOffset] = React.useState(0)
  const [versionsLoading, setVersionsLoading] = React.useState(false)
  const [versionsError, setVersionsError] = React.useState<string | null>(null)

  const [form, setForm] = React.useState<VersionFormState>(emptyVersionForm)
  const [editingVersionId, setEditingVersionId] = React.useState<string | null>(null)
  const [submitLoading, setSubmitLoading] = React.useState(false)
  const [submitMessage, setSubmitMessage] = React.useState<string | null>(null)
  const [githubLoading, setGithubLoading] = React.useState(false)

  const selectedProject = React.useMemo(
    () => projects.find((project) => project.id === selectedProjectKey) ?? null,
    [projects, selectedProjectKey],
  )

  const hasToken = token.trim().length > 0
  const page = Math.floor(offset / VERSION_PAGE_SIZE) + 1
  const totalPages = Math.max(1, Math.ceil(totalVersions / VERSION_PAGE_SIZE))

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
    } catch (error) {
      if (isAuthError(error)) {
        setToken("")
        setAuthError("登录状态已过期，请重新登录。")
      }
      setAuthError(getErrorMessage(error))
      setProjects([])
      setSelectedProjectKey("")
    } finally {
      setProjectsLoading(false)
    }
  }, [selectedProjectKey, setSelectedProjectKey, token])

  const loadVersions = React.useCallback(
    async (nextOffset: number, signal?: AbortSignal) => {
      if (!token || !selectedProjectKey) {
        setVersions([])
        setTotalVersions(0)
        return
      }

      setVersionsLoading(true)
      setVersionsError(null)

      try {
        const response = await listVersions(
          token,
          selectedProjectKey,
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
    [selectedProjectKey, token],
  )

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
  }, [selectedProjectKey])

  async function handleCreateVersion(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!token) {
      setSubmitMessage("请先登录后再操作。")
      return
    }

    if (!selectedProjectKey) {
      setSubmitMessage("请先选择一个项目。")
      return
    }

    setSubmitLoading(true)
    setSubmitMessage(null)

    try {
      const payload = toCreateInput(form)
      if (!payload.version) {
        setSubmitMessage("version 为必填项。")
        return
      }

      if (editingVersionId) {
        await updateVersion(token, selectedProjectKey, editingVersionId, payload)
        setSubmitMessage("版本已更新。")
      } else {
        await createVersion(token, selectedProjectKey, payload)
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
      download_url: version.download_url ?? "",
      download_links_json:
        version.download_links.length > 0 ? JSON.stringify(version.download_links, null, 2) : "",
      forced: version.forced,
      is_latest: version.is_latest,
      is_preview: version.is_preview,
      published_at: toDateTimeLocal(version.published_at),
      platform: version.platform ?? "",
      custom_data: version.custom_data ? JSON.stringify(version.custom_data, null, 2) : "",
    })
    setSubmitMessage(null)
  }

  function copyFromVersion(version: VersionItem) {
    setEditingVersionId(null)
    setForm({
      version: version.version,
      title: version.title ?? "",
      content: version.content ?? "",
      download_url: version.download_url ?? "",
      download_links_json:
        version.download_links.length > 0 ? JSON.stringify(version.download_links, null, 2) : "",
      forced: version.forced,
      is_latest: version.is_latest,
      is_preview: version.is_preview,
      published_at: toDateTimeLocal(version.published_at),
      platform: version.platform ?? "",
      custom_data: version.custom_data ? JSON.stringify(version.custom_data, null, 2) : "",
    })
    setSubmitMessage("已复制配置到表单，可直接发布新版本。")
  }

  async function handlePrefillFromGithubRelease() {
    if (!token) {
      setSubmitMessage("请先登录后再操作。")
      return
    }
    if (!selectedProjectKey) {
      setSubmitMessage("请先选择一个项目。")
      return
    }

    setGithubLoading(true)
    setSubmitMessage(null)

    try {
      const release = await previewVersionFromGithubRelease(token, selectedProjectKey, {
        tag: form.version.trim() || undefined,
      })
      setForm((prev) => ({
        ...prev,
        version: release.version,
        title: release.title ?? "",
        content: release.content ?? "",
        download_url: release.download_url ?? "",
        download_links_json:
          release.download_links.length > 0 ? JSON.stringify(release.download_links, null, 2) : "",
        forced: release.forced,
        is_latest: release.is_latest,
        is_preview: release.is_preview,
        published_at: toDateTimeLocal(release.published_at),
        custom_data: release.custom_data ? JSON.stringify(release.custom_data, null, 2) : "",
      }))
      setSubmitMessage("已从 GitHub Release 自动填充版本表单。")
    } catch (error) {
      if (isAuthError(error)) {
        setToken("")
        setAuthError("登录状态已过期，请重新登录。")
      }
      setSubmitMessage(getErrorMessage(error))
    } finally {
      setGithubLoading(false)
    }
  }

  async function handleDelete(versionId: string) {
    if (!token || !selectedProjectKey) {
      setVersionsError("请先登录并选择项目。")
      return
    }

    const confirmed = window.confirm("确认删除这个版本吗？该操作不可撤销。")
    if (!confirmed) {
      return
    }

    try {
      await deleteVersion(token, selectedProjectKey, versionId)
      const nextOffset =
        versions.length === 1 && offset > 0 ? Math.max(0, offset - VERSION_PAGE_SIZE) : offset
      setOffset(nextOffset)
      await loadVersions(nextOffset)
    } catch (error) {
      setVersionsError(getErrorMessage(error))
    }
  }

  async function handleImportFromGithubReleaseHistory() {
    if (!token) {
      setSubmitMessage("请先登录后再操作。")
      return
    }
    if (!selectedProjectKey) {
      setSubmitMessage("请先选择一个项目。")
      return
    }

    setGithubLoading(true)
    setSubmitMessage(null)
    try {
      const result = await importVersionsFromGithubReleases(token, selectedProjectKey)
      setSubmitMessage(
        `历史版本导入完成：新增 ${result.imported} 条，跳过 ${result.skipped} 条，共扫描 ${result.scanned} 条。`,
      )
      await loadVersions(0)
      setOffset(0)
    } catch (error) {
      setSubmitMessage(getErrorMessage(error))
    } finally {
      setGithubLoading(false)
    }
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
        <div className="space-y-6">
          <ProjectSelectorCard
            selectId="project-select"
            selectedProjectKey={selectedProjectKey}
            projects={projects}
            disabled={!hasToken || projectsLoading || projects.length === 0}
            ringClassName="ring-cyan-300"
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
            title="API Demo · 版本"
            projectKey={selectedProject?.project_key}
            groups={[
              {
                label: "公开接口",
                endpoints: [
                  {
                    method: "GET",
                    path: "/api/v1/public/{projectKey}/versions",
                    description: "查询项目所有版本（客户端可直接调用）",
                    auth: { tokenRequired: false },
                  },
                  {
                    method: "GET",
                    path: "/api/v1/public/{projectKey}/versions/latest",
                    description: "查询项目最新版本",
                    auth: { tokenRequired: false },
                  },
                ],
              },
              {
                label: "管理接口",
                endpoints: [
                  {
                    method: "POST",
                    path: "/api/v1/admin/projects/{projectKey}/versions",
                    description: "创建版本（支持 API Key）",
                    auth: { tokenRequired: true },
                    requestBody: {
                      version: "2.1.0",
                      title: "稳定版",
                      content: "修复已知问题",
                      download_url: "https://example.com/download/2.1.0",
                      download_links: [
                        {
                          url: "https://example.com/download/2.1.0",
                          name: "web.zip",
                          platform: "web",
                        },
                      ],
                      forced: false,
                      is_latest: true,
                      is_preview: false,
                      published_at: 1774050000,
                      platform: "web",
                      custom_data: { channel: "stable", project_key: "{projectKey}" },
                    },
                  },
                  {
                    method: "PATCH",
                    path: "/api/v1/admin/projects/{projectKey}/versions/{id}",
                    description: "编辑版本",
                    auth: { tokenRequired: true },
                    requestBody: {
                      title: "稳定版-修订",
                      forced: true,
                      custom_data: { release_note: "hotfix" },
                    },
                  },
                  {
                    method: "DELETE",
                    path: "/api/v1/admin/projects/{projectKey}/versions/{id}",
                    description: "删除版本",
                    auth: { tokenRequired: true },
                  },
                ],
              },
            ]}
          />
        </div>

        <AdminCard className="space-y-6">
          <div className="space-y-2">
            <h2 className="text-lg font-semibold">
              {editingVersionId ? "编辑版本" : "发布新版本"}
            </h2>
            <p className="text-sm text-slate-700 dark:text-slate-300">
              与后端 CreateVersionDto 对齐：支持 latest/preview 状态、发布时间和 GitHub Release
              自动填充。
            </p>
            {selectedProject?.repo_url ? (
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="border-cyan-300/40 bg-cyan-200/10 text-cyan-900 hover:bg-cyan-200/20 dark:text-cyan-100"
                  disabled={githubLoading}
                  onClick={() => void handlePrefillFromGithubRelease()}
                >
                  {githubLoading ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <DownloadCloud className="size-4" />
                  )}
                  从 GitHub Release 获取
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="border-cyan-300/40 bg-cyan-200/10 text-cyan-900 hover:bg-cyan-200/20 dark:text-cyan-100"
                  disabled={githubLoading}
                  onClick={() => void handleImportFromGithubReleaseHistory()}
                >
                  {githubLoading ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <DownloadCloud className="size-4" />
                  )}
                  从 GitHub 导入历史版本
                </Button>
              </div>
            ) : (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                当前项目未配置 GitHub 仓库地址，无法自动拉取 Release。
              </p>
            )}
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
                maxLength={2048}
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-slate-700 dark:text-slate-300">版本标题</span>
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
              <span className="text-slate-700 dark:text-slate-300">下载链接列表 JSON</span>
              <textarea
                placeholder='例如：[{"url":"https://example.com/app.zip","name":"Windows 包","platform":"windows"}]'
                value={form.download_links_json}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, download_links_json: event.target.value }))
                }
                rows={4}
                className="w-full rounded-xl border border-slate-900/20 bg-white/80 px-3 py-2 font-mono text-xs ring-cyan-300 transition outline-none focus:ring-2 dark:border-white/20 dark:bg-white/10"
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-slate-700 dark:text-slate-300">更新内容</span>
              <textarea
                placeholder="描述本次版本的主要变化"
                value={form.content}
                onChange={(event) => setForm((prev) => ({ ...prev, content: event.target.value }))}
                rows={4}
                className="w-full rounded-xl border border-slate-900/20 bg-white/80 px-3 py-2 text-sm ring-cyan-300 transition outline-none focus:ring-2 dark:border-white/20 dark:bg-white/10"
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
                className="w-full rounded-xl border border-slate-900/20 bg-white/80 px-3 py-2 text-sm ring-cyan-300 transition outline-none focus:ring-2 dark:border-white/20 dark:bg-white/10"
                aria-label="发布时间"
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

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="inline-flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                <input
                  type="checkbox"
                  checked={form.is_latest}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, is_latest: event.target.checked }))
                  }
                  className="size-4 rounded border-white/30 bg-white/10"
                  aria-label="设为 latest"
                />
                设为 latest
              </label>
              <label className="inline-flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                <input
                  type="checkbox"
                  checked={form.is_preview}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, is_preview: event.target.checked }))
                  }
                  className="size-4 rounded border-white/30 bg-white/10"
                  aria-label="预发布版本"
                />
                预发布版本
              </label>
            </div>

            <label className="space-y-1 text-sm">
              <span className="text-slate-700 dark:text-slate-300">扩展数据 JSON</span>
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
              disabled={submitLoading || !selectedProjectKey}
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

        {hasToken && !selectedProjectKey ? (
          <div className="rounded-2xl border border-dashed border-slate-900/20 bg-slate-100/60 p-6 text-sm text-slate-600 dark:border-white/20 dark:bg-white/5 dark:text-slate-300">
            暂无项目，请先去项目管理页创建项目。
          </div>
        ) : null}

        {hasToken && selectedProjectKey && versionsLoading ? (
          <div className="flex items-center gap-2 rounded-2xl border border-slate-900/15 bg-slate-100/60 p-6 text-sm text-slate-700 dark:border-white/15 dark:bg-white/5 dark:text-slate-200">
            <Loader2 className="size-4 animate-spin" />
            正在加载版本列表...
          </div>
        ) : null}

        {hasToken && selectedProjectKey && !versionsLoading && versionsError ? (
          <div className="rounded-2xl border border-rose-300/30 bg-rose-300/10 p-6 text-sm text-rose-200">
            {versionsError}
          </div>
        ) : null}

        {hasToken &&
        selectedProjectKey &&
        !versionsLoading &&
        !versionsError &&
        versions.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/20 bg-white/5 p-6 text-sm text-slate-300">
            暂无版本，使用上方表单发布第一条版本记录。
          </div>
        ) : null}

        {hasToken &&
        selectedProjectKey &&
        !versionsLoading &&
        !versionsError &&
        versions.length > 0 ? (
          <div className="space-y-3">
            {versions.map((version) => (
              <ManagementListItem
                key={version.id}
                title={version.version}
                subtitle={
                  <p className="font-mono text-xs text-slate-700 dark:text-cyan-100/90">
                    ID: {version.id}
                  </p>
                }
                meta={
                  <>
                    <p>发布时间 {new Date(version.published_at * 1000).toLocaleString("zh-CN")}</p>
                    <p>创建于 {new Date(version.created_at * 1000).toLocaleString("zh-CN")}</p>
                    <p>
                      平台：{version.platform ?? "全部"} | 强更：{version.forced ? "是" : "否"} |
                      latest：
                      {version.is_latest ? "是" : "否"} | preview：
                      {version.is_preview ? "是" : "否"}
                    </p>
                  </>
                }
                content={
                  <>
                    <p className="inline-flex items-center gap-2">
                      {version.title ?? "无标题"}
                      {version.is_latest ? <Star className="size-4 text-amber-500" /> : null}
                      {version.is_preview ? <Sparkles className="size-4 text-sky-500" /> : null}
                    </p>
                    {version.content ? <p className="mt-1">{version.content}</p> : null}
                    {version.download_links.length > 0 ? (
                      <div className="mt-1 space-y-1">
                        {version.download_links.map((link, index) => (
                          <a
                            key={`${version.id}-${index}`}
                            className="block text-cyan-700 underline-offset-2 hover:underline dark:text-cyan-200"
                            href={link.url}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {link.name ? `${link.name} · ` : ""}
                            {link.platform ? `[${link.platform}] ` : ""}
                            {link.url}
                          </a>
                        ))}
                      </div>
                    ) : version.download_url ? (
                      <a
                        className="mt-1 inline-block text-cyan-700 underline-offset-2 hover:underline dark:text-cyan-200"
                        href={version.download_url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {version.download_url}
                      </a>
                    ) : (
                      <p className="mt-1 text-slate-500 dark:text-slate-400">未配置下载地址</p>
                    )}
                  </>
                }
                actions={
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      className="border-white/20 bg-white/5"
                      onClick={() => copyFromVersion(version)}
                    >
                      <Copy className="size-4" />
                      复制配置
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="border-white/20 bg-white/5"
                      onClick={() => beginEdit(version)}
                    >
                      <PencilLine className="size-4" />
                      编辑版本
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      onClick={() => void handleDelete(version.id)}
                    >
                      <Trash2 className="size-4" />
                      删除版本
                    </Button>
                  </>
                }
              />
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
