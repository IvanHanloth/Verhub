"use client"

import * as React from "react"
import {
  AlertTriangle,
  Copy,
  DownloadCloud,
  Loader2,
  PencilLine,
  Plus,
  RefreshCcw,
  Sparkles,
  Star,
  Trash2,
} from "lucide-react"
import { toast } from "sonner"

import { Button } from "@workspace/ui/components/button"

import { isAuthError } from "@/lib/api-client"
import { getSessionToken } from "@/lib/auth-session"
import { getErrorMessage } from "@/lib/error-utils"
import { AdminCard } from "@/components/admin/admin-card"
import { AdminFormDialog } from "@/components/admin/admin-form-dialog"
import { AdminListHeader, AdminPagination } from "@/components/admin/admin-list"
import { AdminPageHeader } from "@/components/admin/admin-page-header"
import { ApiReferenceDrawer } from "@/components/docs/api-reference-drawer"
import { useAdminProjects } from "@/hooks/use-admin-projects"
import { usePagination } from "@/hooks/use-pagination"
import {
  extractComparableVersionFromVersion,
  validateComparableVersion,
} from "@/lib/comparable-version"
import {
  checkVersionUpdate,
  createVersion,
  deleteVersion,
  importVersionsFromGithubReleases,
  listVersions,
  previewVersionFromGithubRelease,
  updateVersion,
  upsertVersionByVersion,
  type CheckVersionUpdateResponse,
  type VersionItem,
} from "@/lib/versions-api"
import {
  emptyVersionForm,
  toCreateInput,
  toDateTimeLocal,
  validateVersionRules,
  type VersionFormState,
} from "./version-form-utils"
import { VersionEditDialog } from "./version-edit-dialog"
import { VersionFormFields } from "./version-form-fields"

const VERSION_PAGE_SIZE = 10

export function VersionsDashboard() {
  const [token, setToken] = React.useState(() => getSessionToken().trim())
  const [authError, setAuthError] = React.useState<string | null>(null)

  const { selectedProject, selectedProjectKey, error: projectsError } = useAdminProjects()

  const [versions, setVersions] = React.useState<VersionItem[]>([])
  const {
    offset,
    total: totalVersions,
    setTotal: setTotalVersions,
    page,
    totalPages,
    hasPrev: versionsPaginationHasPrev,
    hasNext: versionsPaginationHasNext,
    onPrev: onVersionsPrev,
    onNext: onVersionsNext,
    adjustAfterDelete: adjustVersionsAfterDelete,
    resetOffset: resetVersionsOffset,
  } = usePagination({ pageSize: VERSION_PAGE_SIZE })
  const [versionsLoading, setVersionsLoading] = React.useState(false)
  const [versionsError, setVersionsError] = React.useState<string | null>(null)

  const [form, setForm] = React.useState<VersionFormState>(emptyVersionForm)
  const [createDialogOpen, setCreateDialogOpen] = React.useState(false)
  const [submitLoading, setSubmitLoading] = React.useState(false)
  const [githubLoading, setGithubLoading] = React.useState(false)
  const [syncLoading, setSyncLoading] = React.useState(false)
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

  const hasToken = token.trim().length > 0
  const comparableVersionError = validateComparableVersion(form.comparable_version)

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
    [selectedProjectKey, token, setTotalVersions],
  )

  React.useEffect(() => {
    const controller = new AbortController()
    void loadVersions(offset, controller.signal)

    return () => {
      controller.abort()
    }
  }, [loadVersions, offset])

  React.useEffect(() => {
    resetVersionsOffset()
  }, [selectedProjectKey, resetVersionsOffset])

  function openCreateDialog() {
    setForm(emptyVersionForm)
    setCreateDialogOpen(true)
  }

  async function handleCreateVersion() {
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

      const rulesError = validateVersionRules(form, {
        candidates: versions.map((item) => ({
          id: item.id,
          comparable_version: item.comparable_version,
          is_preview: item.is_preview,
          is_deprecated: item.is_deprecated,
        })),
      })
      if (rulesError) {
        toast.error(rulesError)
        return
      }

      await createVersion(token, selectedProjectKey, payload)
      if (payload.is_latest) {
        toast.success("版本已发布。之前的 latest 版本标记已自动重置。")
      } else {
        toast.success("版本已发布。")
      }
      setForm(emptyVersionForm)
      setCreateDialogOpen(false)
      resetVersionsOffset()
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

    const rulesError = validateVersionRules(editForm, {
      candidates: versions.map((item) => ({
        id: item.id,
        comparable_version: item.comparable_version,
        is_preview: item.is_preview,
        is_deprecated: item.is_deprecated,
      })),
      editingVersionId: editingVersionId,
    })
    if (rulesError) {
      toast.error(rulesError)
      return
    }

    setSavingEdit(true)
    try {
      await updateVersion(token, selectedProjectKey, editingVersionId, toCreateInput(editForm))
      if (editForm.is_latest) {
        toast.success("版本已更新。之前的 latest 版本标记已自动重置。")
      } else {
        toast.success("版本已更新。")
      }
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
    setCreateDialogOpen(true)
    toast.success("已复制配置到表单，可直接发布新版本。")
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

  /**
   * 一键把 GitHub 上最新的 Release 落库。
   *
   * 走 upsert 而不是 create：同一个 Release 反复同步是常态（改了发布说明再点一次），
   * create 只会撞版本号唯一约束。
   */
  async function handleSyncLatestGithubRelease() {
    if (!token) {
      toast.error("请先登录后再操作。")
      return
    }
    if (!selectedProjectKey) {
      toast.error("请先选择一个项目。")
      return
    }

    setSyncLoading(true)
    try {
      const release = await previewVersionFromGithubRelease(token, selectedProjectKey)
      await upsertVersionByVersion(token, selectedProjectKey, release.version, {
        version: release.version,
        comparable_version: release.comparable_version ?? release.version,
        title: release.title,
        content: release.content,
        download_url: release.download_url,
        download_links: release.download_links,
        is_latest: release.is_latest,
        is_preview: release.is_preview,
        is_milestone: release.is_milestone,
        is_deprecated: release.is_deprecated,
        platforms: release.platforms,
        platform: release.platform,
        custom_data: release.custom_data,
        published_at: release.published_at,
      })
      toast.success(`已同步最新 Release ${release.version}。`)
      resetVersionsOffset()
      await loadVersions(0)
    } catch (error) {
      if (isAuthError(error)) {
        setToken("")
        setAuthError("登录状态已过期，请重新登录。")
      }
      toast.error(`同步最新 Release 失败：${getErrorMessage(error)}`)
    } finally {
      setSyncLoading(false)
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
      adjustVersionsAfterDelete(versions.length - 1)
      await loadVersions(offset)
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

    setSyncLoading(true)
    try {
      const result = await importVersionsFromGithubReleases(token, selectedProjectKey)
      toast.success(
        `历史版本导入完成：新增 ${result.imported} 条，跳过 ${result.skipped} 条，共扫描 ${result.scanned} 条。`,
      )
      await loadVersions(0)
      resetVersionsOffset()
    } catch (error) {
      toast.error(`GitHub 历史版本导入失败：${getErrorMessage(error)}`)
    } finally {
      setSyncLoading(false)
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
        actions={
          <>
            <ApiReferenceDrawer
              tag="Versions"
              title="版本接口文档"
              projectKey={selectedProject?.project_key}
            />
            {/* GitHub 同步是整库级操作，不属于某一条新建记录，所以留在弹窗外。 */}
            {selectedProject?.repo_url ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  className="border-white/30 bg-white/10 hover:bg-white/20"
                  disabled={syncLoading}
                  onClick={() => void handleImportFromGithubReleaseHistory()}
                >
                  {syncLoading ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <DownloadCloud className="size-4" />
                  )}
                  同步历史版本
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="border-white/30 bg-white/10 hover:bg-white/20"
                  disabled={syncLoading}
                  onClick={() => void handleSyncLatestGithubRelease()}
                >
                  {syncLoading ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <RefreshCcw className="size-4" />
                  )}
                  同步最新 Release
                </Button>
              </>
            ) : null}
            <Button
              type="button"
              className="bg-emerald-300 text-emerald-950 hover:bg-emerald-200"
              disabled={!selectedProjectKey}
              onClick={openCreateDialog}
            >
              <Plus className="size-4" />
              新增版本
            </Button>
          </>
        }
      />

      {!selectedProject?.repo_url ? (
        <p className="px-1 text-xs text-slate-500 dark:text-slate-400">
          当前项目未配置 GitHub 仓库地址，无法同步 Release。
        </p>
      ) : null}

      {authError || projectsError ? (
        <AdminCard className="flex items-center gap-2 text-sm text-rose-500 dark:text-rose-300">
          <AlertTriangle className="size-4" />
          {authError ?? projectsError}
        </AdminCard>
      ) : null}

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
            <p>最新版本：{simulationResult.latest_version.version}</p>
            <p>
              更新目标：
              {simulationResult.target_version ? simulationResult.target_version.version : "无"}
              {simulationResult.milestone.target_is_milestone ? "（里程碑）" : ""}
            </p>
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
            暂无版本，点击右上角“新增版本”发布第一条版本记录。
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
                        {/* 图标按钮：名字挂在 aria-label / title 上，读屏与悬停都拿得到。 */}
                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            size="icon"
                            variant="outline"
                            className="border-white/20 bg-white/5"
                            title="复制配置"
                            aria-label="复制配置"
                            onClick={() => copyFromVersion(version)}
                          >
                            <Copy className="size-4" />
                          </Button>
                          <Button
                            type="button"
                            size="icon"
                            variant="outline"
                            className="border-white/20 bg-white/5"
                            title="编辑版本"
                            aria-label="编辑版本"
                            onClick={() => beginEdit(version)}
                          >
                            <PencilLine className="size-4" />
                          </Button>
                          <Button
                            type="button"
                            size="icon"
                            variant="destructive"
                            title="删除版本"
                            aria-label="删除版本"
                            onClick={() => void handleDelete(version.id)}
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

            <AdminPagination
              hasPrev={versionsPaginationHasPrev}
              hasNext={versionsPaginationHasNext}
              onPrev={onVersionsPrev}
              onNext={onVersionsNext}
            />
          </div>
        ) : null}
      </AdminCard>

      <AdminFormDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        title="发布新版本"
        description="填写版本号和发布信息，可按版本号从 GitHub Release 拉取内容。"
        submitLabel="发布版本"
        submitIcon={<Plus className="size-4" />}
        submitting={submitLoading}
        submitDisabled={!selectedProjectKey}
        onSubmit={() => void handleCreateVersion()}
        footerExtra={
          <Button type="button" variant="outline" onClick={() => setForm(emptyVersionForm)}>
            清空表单
          </Button>
        }
      >
        <VersionFormFields
          form={form}
          setForm={setForm}
          comparableVersionError={comparableVersionError}
          onExtractComparableVersion={handleExtractComparableVersion}
          versionFieldAction={
            selectedProject?.repo_url ? (
              <Button
                type="button"
                variant="outline"
                disabled={githubLoading}
                onClick={() => void handlePrefillFromGithubRelease()}
              >
                {githubLoading ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <DownloadCloud className="size-4" />
                )}
                按版本号获取 Release 信息
              </Button>
            ) : null
          }
        />
      </AdminFormDialog>

      <VersionEditDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        form={editForm}
        setForm={setEditForm}
        saving={savingEdit}
        editingVersionId={editingVersionId}
        onSave={() => void handleSaveEdit()}
      />
    </section>
  )
}
