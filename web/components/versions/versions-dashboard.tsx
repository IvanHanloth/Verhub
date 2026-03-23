"use client"

import * as React from "react"
import {
  AlertTriangle,
  Copy,
  DownloadCloud,
  Loader2,
  PencilLine,
  Plus,
  Save,
  Sparkles,
  Star,
  Trash2,
} from "lucide-react"
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

import { ApiError, isAuthError } from "@/lib/api-client"
import { getSessionToken } from "@/lib/auth-session"
import { AdminCard } from "@/components/admin/admin-card"
import { AdminListHeader, AdminPagination } from "@/components/admin/admin-list"
import { AdminPageHeader } from "@/components/admin/admin-page-header"
import { ProjectApiOverview } from "@/components/admin/project-api-overview"
import { ProjectSelectorCard } from "@/components/admin/project-selector-card"
import { useSharedProjectSelection } from "@/hooks/use-shared-project-selection"
import {
  extractComparableVersionFromVersion,
  validateComparableVersion,
} from "@/lib/comparable-version"
import { listProjects, type ProjectItem } from "@/lib/projects-api"
import { scrollToPageTop } from "@/lib/scroll"
import {
  checkVersionUpdate,
  createVersion,
  deleteVersion,
  importVersionsFromGithubReleases,
  listVersions,
  previewVersionFromGithubRelease,
  updateVersion,
  type CheckVersionUpdateResponse,
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
  comparable_version: string
  title: string
  content: string
  download_url: string
  download_links_json: string
  is_latest: boolean
  is_preview: boolean
  is_milestone: boolean
  is_deprecated: boolean
  published_at: string
  platforms: ClientPlatform[]
  custom_data: string
}

const emptyVersionForm: VersionFormState = {
  version: "",
  comparable_version: "",
  title: "",
  content: "",
  download_url: "",
  download_links_json: "",
  is_latest: true,
  is_preview: false,
  is_milestone: false,
  is_deprecated: false,
  published_at: "",
  platforms: [],
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
    comparable_version: form.comparable_version.trim(),
    title: form.title.trim() || undefined,
    content: form.content.trim() || undefined,
    download_url: trimmedDownloadUrl || undefined,
    download_links: parseDownloadLinks(form.download_links_json),
    is_latest: form.is_latest,
    is_preview: form.is_preview,
    is_milestone: form.is_milestone,
    is_deprecated: form.is_deprecated,
    platforms: form.platforms,
    platform: form.platforms[0],
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
  const [submitLoading, setSubmitLoading] = React.useState(false)
  const [githubLoading, setGithubLoading] = React.useState(false)
  const [editDialogOpen, setEditDialogOpen] = React.useState(false)
  const [editingVersionId, setEditingVersionId] = React.useState<string | null>(null)
  const [editForm, setEditForm] = React.useState<VersionFormState>(emptyVersionForm)
  const [savingEdit, setSavingEdit] = React.useState(false)
  const [simulationCurrentVersion, setSimulationCurrentVersion] = React.useState("")
  const [simulationCurrentComparableVersion, setSimulationCurrentComparableVersion] =
    React.useState("")
  const [simulationIncludePreview, setSimulationIncludePreview] = React.useState(false)
  const [simulationLoading, setSimulationLoading] = React.useState(false)
  const [simulationResult, setSimulationResult] = React.useState<CheckVersionUpdateResponse | null>(
    null,
  )
  const [simulationError, setSimulationError] = React.useState<string | null>(null)

  const selectedProject = React.useMemo(
    () => projects.find((project) => project.project_key === selectedProjectKey) ?? null,
    [projects, selectedProjectKey],
  )

  const hasToken = token.trim().length > 0
  const comparableVersionError = validateComparableVersion(form.comparable_version)
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
      toast.error("请先登录后再操作。")
      return
    }

    if (!selectedProjectKey) {
      toast.error("请先选择一个项目。")
      return
    }

    setSubmitLoading(true)

    try {
      const payload = toCreateInput(form)
      if (!payload.version) {
        toast.error("version 为必填项。")
        return
      }

      if (comparableVersionError) {
        toast.error(comparableVersionError)
        return
      }

      await createVersion(token, selectedProjectKey, payload)
      toast.success("版本已发布。")
      setForm(emptyVersionForm)
      setOffset(0)
      await loadVersions(0)
    } catch (error) {
      if (isAuthError(error)) {
        setToken("")
        setAuthError("登录状态已过期，请重新登录。")
      }
      toast.error(getErrorMessage(error))
    } finally {
      setSubmitLoading(false)
    }
  }

  function beginEdit(version: VersionItem) {
    setEditingVersionId(version.id)
    setEditForm({
      version: version.version,
      comparable_version: version.comparable_version ?? "",
      title: version.title ?? "",
      content: version.content ?? "",
      download_url: version.download_url ?? "",
      download_links_json:
        version.download_links.length > 0 ? JSON.stringify(version.download_links, null, 2) : "",
      is_latest: version.is_latest,
      is_preview: version.is_preview,
      is_milestone: version.is_milestone ?? false,
      is_deprecated: version.is_deprecated ?? false,
      published_at: toDateTimeLocal(version.published_at),
      platforms:
        version.platforms && version.platforms.length > 0
          ? version.platforms
          : version.platform
            ? [version.platform]
            : [],
      custom_data: version.custom_data ? JSON.stringify(version.custom_data, null, 2) : "",
    })
    setEditDialogOpen(true)
    scrollToPageTop()
  }

  async function handleSaveEdit() {
    if (!token || !selectedProjectKey || !editingVersionId) {
      return
    }

    const editComparableError = validateComparableVersion(editForm.comparable_version)
    if (editComparableError) {
      toast.error(editComparableError)
      return
    }

    setSavingEdit(true)
    try {
      await updateVersion(token, selectedProjectKey, editingVersionId, toCreateInput(editForm))
      toast.success("版本已更新。")
      setEditDialogOpen(false)
      setEditingVersionId(null)
      await loadVersions(offset)
    } catch (error) {
      toast.error(getErrorMessage(error))
    } finally {
      setSavingEdit(false)
    }
  }

  function copyFromVersion(version: VersionItem) {
    setEditingVersionId(null)
    setForm({
      version: version.version,
      comparable_version: version.comparable_version ?? "",
      title: version.title ?? "",
      content: version.content ?? "",
      download_url: version.download_url ?? "",
      download_links_json:
        version.download_links.length > 0 ? JSON.stringify(version.download_links, null, 2) : "",
      is_latest: version.is_latest,
      is_preview: version.is_preview,
      is_milestone: version.is_milestone ?? false,
      is_deprecated: version.is_deprecated ?? false,
      published_at: toDateTimeLocal(version.published_at),
      platforms:
        version.platforms && version.platforms.length > 0
          ? version.platforms
          : version.platform
            ? [version.platform]
            : [],
      custom_data: version.custom_data ? JSON.stringify(version.custom_data, null, 2) : "",
    })
    toast.success("已复制配置到表单，可直接发布新版本。")
    scrollToPageTop()
  }

  async function handlePrefillFromGithubRelease() {
    if (!token) {
      toast.error("请先登录后再操作。")
      return
    }
    if (!selectedProjectKey) {
      toast.error("请先选择一个项目。")
      return
    }

    setGithubLoading(true)

    try {
      const release = await previewVersionFromGithubRelease(token, selectedProjectKey, {
        tag: form.version.trim() || undefined,
      })
      setForm((prev) => ({
        ...prev,
        version: release.version,
        comparable_version: release.comparable_version ?? release.version,
        title: release.title ?? "",
        content: release.content ?? "",
        download_url: release.download_url ?? "",
        download_links_json:
          release.download_links.length > 0 ? JSON.stringify(release.download_links, null, 2) : "",
        is_latest: release.is_latest,
        is_preview: release.is_preview,
        is_milestone: release.is_milestone ?? false,
        is_deprecated: release.is_deprecated ?? false,
        published_at: toDateTimeLocal(release.published_at),
        platforms:
          release.platforms && release.platforms.length > 0
            ? release.platforms
            : release.platform
              ? [release.platform]
              : prev.platforms,
        custom_data: release.custom_data ? JSON.stringify(release.custom_data, null, 2) : "",
      }))
      toast.success("已从 GitHub Release 自动填充版本表单。")
    } catch (error) {
      if (isAuthError(error)) {
        setToken("")
        setAuthError("登录状态已过期，请重新登录。")
      }
      toast.error(`GitHub Release 获取失败：${getErrorMessage(error)}`)
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
      toast.error("请先登录后再操作。")
      return
    }
    if (!selectedProjectKey) {
      toast.error("请先选择一个项目。")
      return
    }

    setGithubLoading(true)
    try {
      const result = await importVersionsFromGithubReleases(token, selectedProjectKey)
      toast.success(
        `历史版本导入完成：新增 ${result.imported} 条，跳过 ${result.skipped} 条，共扫描 ${result.scanned} 条。`,
      )
      await loadVersions(0)
      setOffset(0)
    } catch (error) {
      toast.error(`GitHub 历史版本导入失败：${getErrorMessage(error)}`)
    } finally {
      setGithubLoading(false)
    }
  }

  function handleExtractComparableVersion() {
    const extracted = extractComparableVersionFromVersion(form.version)
    if (!extracted) {
      toast.error("无法从版本号提取可比较版本号，请手动填写。")
      return
    }

    setForm((prev) => ({ ...prev, comparable_version: extracted }))
    toast.success("已从版本号提取可比较版本号。")
  }

  async function handleSimulateCheckUpdate() {
    if (!selectedProject?.project_key) {
      setSimulationError("请先选择项目。")
      return
    }

    const currentComparable = simulationCurrentComparableVersion.trim()
    if (currentComparable && validateComparableVersion(currentComparable)) {
      setSimulationError("模拟输入的可比较版本号格式不合法。")
      return
    }

    setSimulationLoading(true)
    setSimulationError(null)
    setSimulationResult(null)

    try {
      const result = await checkVersionUpdate(selectedProject.project_key, {
        current_version: simulationCurrentVersion.trim() || undefined,
        current_comparable_version: currentComparable || undefined,
        include_preview: simulationIncludePreview,
      })
      setSimulationResult(result)
    } catch (error) {
      setSimulationError(getErrorMessage(error))
    } finally {
      setSimulationLoading(false)
    }
  }

  return (
    <section className="space-y-6">
      <AdminPageHeader
        title="版本发布管理"
        description="发布和维护项目版本，统一管理平台范围、更新策略和下载信息。"
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
            title="接口示例 · 版本"
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
                  {
                    method: "GET",
                    path: "/api/v1/public/{projectKey}/versions/latest-preview",
                    description: "查询项目最新预发布版本",
                    auth: { tokenRequired: false },
                  },
                  {
                    method: "GET",
                    path: "/api/v1/public/{projectKey}/versions/by-version/{version}",
                    description: "按语义化版本号查询指定版本",
                    auth: { tokenRequired: false },
                  },
                  {
                    method: "POST",
                    path: "/api/v1/public/{projectKey}/versions/check-update",
                    description: "提交当前版本并返回更新判定（可选/必更）",
                    auth: { tokenRequired: false },
                    requestBody: {
                      current_version: "v1.20.326",
                      current_comparable_version: "1.20.326",
                      include_preview: false,
                    },
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
                      comparable_version: "2.1.0",
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
                      is_latest: true,
                      is_preview: false,
                      is_milestone: true,
                      is_deprecated: false,
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
                      is_milestone: true,
                      is_deprecated: true,
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
            <h2 className="text-lg font-semibold">发布新版本</h2>
            <p className="text-sm text-slate-700 dark:text-slate-300">
              填写版本号和发布信息，可从 GitHub Release 导入已有内容。
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
              <span className="text-slate-700 dark:text-slate-300">可比较版本号</span>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="例如：2.3.0-rc.1"
                  value={form.comparable_version}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, comparable_version: event.target.value }))
                  }
                  className="w-full rounded-xl border border-slate-900/20 bg-white/80 px-3 py-2 text-sm ring-cyan-300 transition outline-none focus:ring-2 dark:border-white/20 dark:bg-white/10"
                  required
                  maxLength={64}
                />
                <Button type="button" variant="outline" onClick={handleExtractComparableVersion}>
                  提取
                </Button>
              </div>
              {comparableVersionError ? (
                <p className="text-xs text-rose-500">{comparableVersionError}</p>
              ) : (
                <p className="text-xs text-emerald-600 dark:text-emerald-300">格式校验通过</p>
              )}
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
            <label className="inline-flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
              <input
                type="checkbox"
                checked={form.is_milestone}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, is_milestone: event.target.checked }))
                }
                className="size-4 rounded border-white/30 bg-white/10"
              />
              标记为里程碑版本
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-slate-700 dark:text-slate-300">版本标题（创建）</span>
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

            <div className="grid gap-3 sm:grid-cols-2 sm:items-center">
              <div className="rounded-xl border border-slate-900/20 bg-white/80 px-3 py-2 text-sm dark:border-white/20 dark:bg-white/10">
                <p className="mb-2 text-slate-700 dark:text-slate-300">
                  平台范围（多选，空表示全部）
                </p>
                <div className="flex flex-wrap gap-3">
                  {platformOptions.map((item) => (
                    <label
                      key={item.value}
                      className="inline-flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300"
                    >
                      <input
                        type="checkbox"
                        checked={form.platforms.includes(item.value)}
                        onChange={() =>
                          setForm((prev) => ({
                            ...prev,
                            platforms: prev.platforms.includes(item.value)
                              ? prev.platforms.filter((platform) => platform !== item.value)
                              : [...prev.platforms, item.value],
                          }))
                        }
                        className="size-4"
                      />
                      {item.label}
                    </label>
                  ))}
                </div>
              </div>
              <label className="inline-flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                <input
                  type="checkbox"
                  checked={form.is_deprecated}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, is_deprecated: event.target.checked }))
                  }
                  className="size-4 rounded border-white/30 bg-white/10"
                />
                标记为废弃版本（客户端必更）
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
              发布版本
            </Button>
          </form>
        </AdminCard>
      </section>

      <AdminCard className="space-y-4">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">版本模拟检查更新</h2>
          <p className="text-sm text-slate-700 dark:text-slate-300">
            用当前版本号模拟调用 check-update，验证里程碑拦截、废弃版本与可选更新范围策略。
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-sm">
            <span className="text-slate-700 dark:text-slate-300">当前版本号（可选）</span>
            <input
              type="text"
              value={simulationCurrentVersion}
              onChange={(event) => setSimulationCurrentVersion(event.target.value)}
              placeholder="例如：v1.20.326"
              className="w-full rounded-xl border border-slate-900/20 bg-white/80 px-3 py-2 text-sm ring-cyan-300 transition outline-none focus:ring-2 dark:border-white/20 dark:bg-white/10"
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-slate-700 dark:text-slate-300">当前可比较版本号（可选）</span>
            <input
              type="text"
              value={simulationCurrentComparableVersion}
              onChange={(event) => setSimulationCurrentComparableVersion(event.target.value)}
              placeholder="例如：1.20.326"
              className="w-full rounded-xl border border-slate-900/20 bg-white/80 px-3 py-2 text-sm ring-cyan-300 transition outline-none focus:ring-2 dark:border-white/20 dark:bg-white/10"
            />
          </label>
        </div>

        <label className="inline-flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
          <input
            type="checkbox"
            checked={simulationIncludePreview}
            onChange={(event) => setSimulationIncludePreview(event.target.checked)}
            className="size-4 rounded border-white/30 bg-white/10"
          />
          包含 preview 版本参与比较
        </label>

        <div>
          <Button
            type="button"
            onClick={() => void handleSimulateCheckUpdate()}
            disabled={simulationLoading || !selectedProject?.project_key}
          >
            {simulationLoading ? <Loader2 className="size-4 animate-spin" /> : null}
            开始模拟
          </Button>
        </div>

        {simulationError ? <p className="text-sm text-rose-500">{simulationError}</p> : null}

        {simulationResult ? (
          <div className="space-y-2 rounded-xl border border-slate-900/10 bg-white/60 p-3 text-sm dark:border-white/10 dark:bg-white/5">
            <p>
              结果：
              {simulationResult.should_update ? "需要更新" : "无需更新"} /
              {simulationResult.required ? " 必须更新" : " 可选更新"}
            </p>
            <p>目标版本：{simulationResult.target_version.version}</p>
            <p>判定原因：{simulationResult.reason_codes.join("、") || "无"}</p>
            <p>
              里程碑：当前 {simulationResult.milestone.current ? "是" : "否"}，最新
              {simulationResult.milestone.latest ? "是" : "否"}
            </p>
          </div>
        ) : null}
      </AdminCard>

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
            <div className="overflow-x-auto rounded-2xl border border-slate-900/15 bg-white/70 dark:border-white/10 dark:bg-white/5">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-100/80 text-left text-slate-700 dark:bg-white/10 dark:text-slate-200">
                  <tr>
                    <th className="px-3 py-2 font-medium">版本</th>
                    <th className="px-3 py-2 font-medium">状态</th>
                    <th className="px-3 py-2 font-medium">下载</th>
                    <th className="px-3 py-2 font-medium">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {versions.map((version) => (
                    <tr
                      key={version.id}
                      className="border-t border-slate-900/10 dark:border-white/10"
                    >
                      <td className="px-3 py-2 align-top">
                        <p className="inline-flex items-center gap-2 font-medium text-slate-900 dark:text-slate-100">
                          {version.version}
                          {version.is_latest ? <Star className="size-4 text-amber-500" /> : null}
                          {version.is_preview ? <Sparkles className="size-4 text-sky-500" /> : null}
                        </p>
                        <p className="font-mono text-xs text-slate-600 dark:text-slate-300">
                          ID: {version.id}
                        </p>
                        <p className="text-xs text-slate-600 dark:text-slate-300">
                          comparable: {version.comparable_version ?? "未设置"}
                        </p>
                      </td>
                      <td className="px-3 py-2 align-top text-xs text-slate-700 dark:text-slate-300">
                        <p>
                          平台：
                          {version.platforms && version.platforms.length > 0
                            ? version.platforms.join(", ")
                            : (version.platform ?? "全部")}
                        </p>
                        <p>里程碑：{version.is_milestone ? "是" : "否"}</p>
                        <p>废弃：{version.is_deprecated ? "是" : "否"}</p>
                        <p>发布：{new Date(version.published_at * 1000).toLocaleString("zh-CN")}</p>
                      </td>
                      <td className="px-3 py-2 align-top text-xs text-slate-700 dark:text-slate-300">
                        {version.download_links.length > 0 ? (
                          <div className="space-y-1">
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
                            className="inline-block text-cyan-700 underline-offset-2 hover:underline dark:text-cyan-200"
                            href={version.download_url}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {version.download_url}
                          </a>
                        ) : (
                          <span className="text-slate-500 dark:text-slate-400">未配置下载地址</span>
                        )}
                      </td>
                      <td className="px-3 py-2 align-top">
                        <div className="flex flex-wrap gap-2">
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
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <AdminPagination
              hasPrev={offset > 0}
              hasNext={offset + VERSION_PAGE_SIZE < totalVersions}
              onPrev={() => setOffset((prev) => Math.max(0, prev - VERSION_PAGE_SIZE))}
              onNext={() => setOffset((prev) => prev + VERSION_PAGE_SIZE)}
            />
          </div>
        ) : null}
      </AdminCard>

      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>编辑版本</DialogTitle>
            <DialogDescription>在弹窗中更新版本字段并保存。</DialogDescription>
          </DialogHeader>

          <div className="grid gap-3">
            <label className="space-y-1 text-sm">
              <span className="text-slate-700 dark:text-slate-300">版本号</span>
              <input
                type="text"
                value={editForm.version}
                onChange={(event) =>
                  setEditForm((prev) => ({ ...prev, version: event.target.value }))
                }
                className="w-full rounded-xl border border-slate-900/20 bg-white/80 px-3 py-2 text-sm dark:border-white/20 dark:bg-white/10"
                maxLength={64}
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-slate-700 dark:text-slate-300">可比较版本号</span>
              <input
                type="text"
                value={editForm.comparable_version}
                onChange={(event) =>
                  setEditForm((prev) => ({ ...prev, comparable_version: event.target.value }))
                }
                className="w-full rounded-xl border border-slate-900/20 bg-white/80 px-3 py-2 text-sm dark:border-white/20 dark:bg-white/10"
                maxLength={64}
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-slate-700 dark:text-slate-300">版本标题</span>
              <input
                type="text"
                value={editForm.title}
                onChange={(event) =>
                  setEditForm((prev) => ({ ...prev, title: event.target.value }))
                }
                className="w-full rounded-xl border border-slate-900/20 bg-white/80 px-3 py-2 text-sm dark:border-white/20 dark:bg-white/10"
                maxLength={128}
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-slate-700 dark:text-slate-300">下载地址</span>
              <input
                type="url"
                value={editForm.download_url}
                onChange={(event) =>
                  setEditForm((prev) => ({ ...prev, download_url: event.target.value }))
                }
                className="w-full rounded-xl border border-slate-900/20 bg-white/80 px-3 py-2 text-sm dark:border-white/20 dark:bg-white/10"
                maxLength={2048}
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-slate-700 dark:text-slate-300">下载链接列表 JSON</span>
              <textarea
                value={editForm.download_links_json}
                onChange={(event) =>
                  setEditForm((prev) => ({ ...prev, download_links_json: event.target.value }))
                }
                rows={4}
                className="w-full rounded-xl border border-slate-900/20 bg-white/80 px-3 py-2 font-mono text-xs dark:border-white/20 dark:bg-white/10"
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-slate-700 dark:text-slate-300">更新内容</span>
              <textarea
                value={editForm.content}
                onChange={(event) =>
                  setEditForm((prev) => ({ ...prev, content: event.target.value }))
                }
                rows={4}
                className="w-full rounded-xl border border-slate-900/20 bg-white/80 px-3 py-2 text-sm dark:border-white/20 dark:bg-white/10"
                maxLength={4096}
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-slate-700 dark:text-slate-300">发布时间</span>
              <input
                type="datetime-local"
                value={editForm.published_at}
                onChange={(event) =>
                  setEditForm((prev) => ({ ...prev, published_at: event.target.value }))
                }
                className="w-full rounded-xl border border-slate-900/20 bg-white/80 px-3 py-2 text-sm dark:border-white/20 dark:bg-white/10"
              />
            </label>
            <div className="rounded-xl border border-slate-900/20 bg-white/80 px-3 py-2 text-sm dark:border-white/20 dark:bg-white/10">
              <p className="mb-2 text-slate-700 dark:text-slate-300">
                平台范围（多选，空表示全部）
              </p>
              <div className="flex flex-wrap gap-3">
                {platformOptions.map((item) => (
                  <label
                    key={item.value}
                    className="inline-flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300"
                  >
                    <input
                      type="checkbox"
                      checked={editForm.platforms.includes(item.value)}
                      onChange={() =>
                        setEditForm((prev) => ({
                          ...prev,
                          platforms: prev.platforms.includes(item.value)
                            ? prev.platforms.filter((platform) => platform !== item.value)
                            : [...prev.platforms, item.value],
                        }))
                      }
                      className="size-4"
                    />
                    {item.label}
                  </label>
                ))}
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="inline-flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                <input
                  type="checkbox"
                  checked={editForm.is_latest}
                  onChange={(event) =>
                    setEditForm((prev) => ({ ...prev, is_latest: event.target.checked }))
                  }
                  className="size-4 rounded border-white/30 bg-white/10"
                />
                设为 latest
              </label>
              <label className="inline-flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                <input
                  type="checkbox"
                  checked={editForm.is_preview}
                  onChange={(event) =>
                    setEditForm((prev) => ({ ...prev, is_preview: event.target.checked }))
                  }
                  className="size-4 rounded border-white/30 bg-white/10"
                />
                预发布版本
              </label>
            </div>
            <label className="inline-flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
              <input
                type="checkbox"
                checked={editForm.is_milestone}
                onChange={(event) =>
                  setEditForm((prev) => ({ ...prev, is_milestone: event.target.checked }))
                }
                className="size-4 rounded border-white/30 bg-white/10"
              />
              标记为里程碑版本
            </label>
            <label className="inline-flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
              <input
                type="checkbox"
                checked={editForm.is_deprecated}
                onChange={(event) =>
                  setEditForm((prev) => ({ ...prev, is_deprecated: event.target.checked }))
                }
                className="size-4 rounded border-white/30 bg-white/10"
              />
              标记为废弃版本
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-slate-700 dark:text-slate-300">扩展数据 JSON</span>
              <textarea
                value={editForm.custom_data}
                onChange={(event) =>
                  setEditForm((prev) => ({ ...prev, custom_data: event.target.value }))
                }
                rows={4}
                className="w-full rounded-xl border border-slate-900/20 bg-white/80 px-3 py-2 font-mono text-xs dark:border-white/20 dark:bg-white/10"
              />
            </label>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setEditDialogOpen(false)}>
              取消
            </Button>
            <Button
              type="button"
              disabled={savingEdit || !editingVersionId}
              onClick={() => void handleSaveEdit()}
            >
              {savingEdit ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Save className="size-4" />
              )}
              保存版本
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}
