"use client"

import * as React from "react"
import {
  Copy,
  ExternalLink,
  Github,
  Loader2,
  PencilLine,
  Plus,
  RefreshCcw,
  Save,
  Trash2,
} from "lucide-react"
import Link from "next/link"
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

import { isAuthError } from "@/lib/api-client"
import { getErrorMessage } from "@/lib/error-utils"
import { useConfirm } from "@/components/common/confirm-dialog"
import { useUnsavedChangesGuard } from "@/components/common/unsaved-changes-guard"
import {
  DataTable,
  EmptyValue,
  TruncatedCell,
  type DataTableColumn,
} from "@/components/common/data-table"
import { notifyAdminProjectsChanged, useAdminProjects } from "@/hooks/use-admin-projects"
import { usePagination } from "@/hooks/use-pagination"
import { getSessionToken } from "@/lib/auth-session"
import { AdminCard } from "@/components/admin/admin-card"
import { AdminFormDialog } from "@/components/admin/admin-form-dialog"
import { AdminPageHeader } from "@/components/admin/admin-page-header"
import { MarkdownEditor } from "@/components/markdown/markdown-editor"
import { GithubIntegrationDialog } from "@/components/projects/github-integration-dialog"
import { ProjectAliasesSettings } from "@/components/projects/project-aliases-settings"
import { validateComparableVersion } from "@/lib/comparable-version"
import { formatTimestamp } from "@/lib/format"
import {
  createProject,
  deleteProject,
  listProjects,
  previewProjectFromGithubRepo,
  type ProjectItem,
  type ProjectMutationInput,
  updateProject,
} from "@/lib/projects-api"

const PAGE_SIZE = 10

/** Keep in sync with the backend's stats retention bounds. */
const DEFAULT_STATS_RETENTION_DAYS = 365
const MIN_STATS_RETENTION_DAYS = 1
const MAX_STATS_RETENTION_DAYS = 365

type FormState = {
  project_key: string
  name: string
  repo_url: string
  description: string
  author: string
  author_homepage_url: string
  icon_url: string
  website_url: string
  docs_url: string
  published_at: string
  optional_update_min_comparable_version: string
  optional_update_max_comparable_version: string
  stats_retention_days: string
}

const emptyForm: FormState = {
  project_key: "",
  name: "",
  repo_url: "",
  description: "",
  author: "",
  author_homepage_url: "",
  icon_url: "",
  website_url: "",
  docs_url: "",
  published_at: "",
  optional_update_min_comparable_version: "",
  optional_update_max_comparable_version: "",
  stats_retention_days: String(DEFAULT_STATS_RETENTION_DAYS),
}

/** 链接列：显示地址本身并截断，完整地址进 title —— 域名和仓库名都在开头，够认。 */
function ExternalLinkCell({ url }: { url: string | null }) {
  if (!url) {
    return <EmptyValue />
  }

  return (
    <a
      className="block max-w-[16rem] truncate text-xs text-cyan-700 hover:underline dark:text-cyan-300"
      href={url}
      target="_blank"
      rel="noreferrer"
      title={url}
    >
      {url}
    </a>
  )
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

function toStatsRetentionDays(value: string): number | undefined {
  const trimmed = value.trim()
  if (!trimmed) {
    return undefined
  }

  const days = Number(trimmed)
  if (
    !Number.isInteger(days) ||
    days < MIN_STATS_RETENTION_DAYS ||
    days > MAX_STATS_RETENTION_DAYS
  ) {
    throw new Error(
      `统计保留时长需为 ${MIN_STATS_RETENTION_DAYS}-${MAX_STATS_RETENTION_DAYS} 之间的整数天`,
    )
  }

  return days
}

function toMutationInput(
  form: FormState,
  options?: { clearOptionalRangeWithNull?: boolean },
): ProjectMutationInput {
  const optionalMin = form.optional_update_min_comparable_version.trim()
  const optionalMax = form.optional_update_max_comparable_version.trim()

  // During edit (clearOptionalRangeWithNull=true): always send the field so
  // the backend can distinguish "clear to null" from "not provided".
  // During create: omit empty fields (undefined → column defaults to null).
  const resolveOptionalField = (value: string): string | null | undefined => {
    if (options?.clearOptionalRangeWithNull) {
      return value || null
    }
    return value || undefined
  }

  return {
    project_key: form.project_key.trim(),
    name: form.name.trim(),
    repo_url: form.repo_url.trim() || undefined,
    description: form.description.trim() || undefined,
    author: form.author.trim() || undefined,
    author_homepage_url: form.author_homepage_url.trim() || undefined,
    icon_url: form.icon_url.trim() || undefined,
    website_url: form.website_url.trim() || undefined,
    docs_url: form.docs_url.trim() || undefined,
    published_at: toTimestampSeconds(form.published_at),
    optional_update_min_comparable_version: resolveOptionalField(optionalMin),
    optional_update_max_comparable_version: resolveOptionalField(optionalMax),
    stats_retention_days: toStatsRetentionDays(form.stats_retention_days),
  }
}

function ProjectFormFields({
  form,
  setForm,
  minComparableError,
  maxComparableError,
  theme = "dark",
}: {
  form: FormState
  setForm: React.Dispatch<React.SetStateAction<FormState>>
  minComparableError: string | null
  maxComparableError: string | null
  theme?: "dark" | "light"
}) {
  const inputClassName =
    theme === "light"
      ? "w-full rounded-xl border border-slate-900/20 bg-white/80 px-3 py-2 text-sm dark:border-white/20 dark:bg-white/10"
      : "w-full rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-sm ring-cyan-300 transition outline-none focus:ring-2"

  return (
    <>
      <label className="space-y-1 text-sm">
        <span className="text-slate-700 dark:text-slate-300">项目标识</span>
        <input
          type="text"
          placeholder="例如：verhub-admin"
          value={form.project_key}
          onChange={(event) => setForm((prev) => ({ ...prev, project_key: event.target.value }))}
          className={inputClassName}
          required
          maxLength={64}
        />
      </label>
      <label className="space-y-1 text-sm">
        <span className="text-slate-700 dark:text-slate-300">项目名称</span>
        <input
          type="text"
          placeholder="输入面向管理员展示的名称"
          value={form.name}
          onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
          className={inputClassName}
          required
          maxLength={128}
        />
      </label>
      <label className="space-y-1 text-sm">
        <span className="text-slate-700 dark:text-slate-300">仓库地址</span>
        <input
          type="url"
          placeholder="https://github.com/org/repo"
          value={form.repo_url}
          onChange={(event) => setForm((prev) => ({ ...prev, repo_url: event.target.value }))}
          className={inputClassName}
          maxLength={512}
        />
      </label>
      <MarkdownEditor
        label="项目描述"
        placeholder="简要说明项目用途和范围"
        value={form.description}
        onChange={(value) => setForm((prev) => ({ ...prev, description: value }))}
        rows={4}
        className={inputClassName}
        maxLength={2048}
      />
      <label className="space-y-1 text-sm">
        <span className="text-slate-700 dark:text-slate-300">作者</span>
        <input
          type="text"
          placeholder="例如：octocat"
          value={form.author}
          onChange={(event) => setForm((prev) => ({ ...prev, author: event.target.value }))}
          className={inputClassName}
          maxLength={128}
        />
      </label>
      <label className="space-y-1 text-sm">
        <span className="text-slate-700 dark:text-slate-300">作者主页</span>
        <input
          type="url"
          placeholder="https://github.com/author"
          value={form.author_homepage_url}
          onChange={(event) =>
            setForm((prev) => ({ ...prev, author_homepage_url: event.target.value }))
          }
          className={inputClassName}
          maxLength={512}
        />
      </label>
      <label className="space-y-1 text-sm">
        <span className="text-slate-700 dark:text-slate-300">图标链接</span>
        <input
          type="url"
          placeholder="https://example.com/icon.png"
          value={form.icon_url}
          onChange={(event) => setForm((prev) => ({ ...prev, icon_url: event.target.value }))}
          className={inputClassName}
          maxLength={1024}
        />
      </label>
      <label className="space-y-1 text-sm">
        <span className="text-slate-700 dark:text-slate-300">官网</span>
        <input
          type="url"
          placeholder="https://example.com"
          value={form.website_url}
          onChange={(event) => setForm((prev) => ({ ...prev, website_url: event.target.value }))}
          className={inputClassName}
          maxLength={512}
        />
      </label>
      <label className="space-y-1 text-sm">
        <span className="text-slate-700 dark:text-slate-300">文档链接</span>
        <input
          type="url"
          placeholder="https://docs.example.com"
          value={form.docs_url}
          onChange={(event) => setForm((prev) => ({ ...prev, docs_url: event.target.value }))}
          className={inputClassName}
          maxLength={512}
        />
      </label>
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
        <span className="text-slate-700 dark:text-slate-300">可选更新范围下限</span>
        <input
          type="text"
          placeholder="例如：1.0.0"
          value={form.optional_update_min_comparable_version}
          onChange={(event) =>
            setForm((prev) => ({
              ...prev,
              optional_update_min_comparable_version: event.target.value,
            }))
          }
          className={inputClassName}
          maxLength={64}
        />
        {minComparableError ? <p className="text-xs text-rose-500">{minComparableError}</p> : null}
      </label>
      <label className="space-y-1 text-sm">
        <span className="text-slate-700 dark:text-slate-300">可选更新范围上限</span>
        <input
          type="text"
          placeholder="例如：1.99.99"
          value={form.optional_update_max_comparable_version}
          onChange={(event) =>
            setForm((prev) => ({
              ...prev,
              optional_update_max_comparable_version: event.target.value,
            }))
          }
          className={inputClassName}
          maxLength={64}
        />
        {maxComparableError ? <p className="text-xs text-rose-500">{maxComparableError}</p> : null}
      </label>
      <label className="space-y-1 text-sm">
        <span className="text-slate-700 dark:text-slate-300">统计保留时长（天）</span>
        <input
          type="number"
          min={MIN_STATS_RETENTION_DAYS}
          max={MAX_STATS_RETENTION_DAYS}
          step={1}
          placeholder={String(DEFAULT_STATS_RETENTION_DAYS)}
          value={form.stats_retention_days}
          onChange={(event) =>
            setForm((prev) => ({ ...prev, stats_retention_days: event.target.value }))
          }
          className={inputClassName}
        />
        <p className="text-xs text-slate-500 dark:text-slate-400">
          超出该时长的接口请求统计会被自动清理，最长 {MAX_STATS_RETENTION_DAYS} 天。
        </p>
      </label>
    </>
  )
}

export function ProjectsDashboard() {
  const confirm = useConfirm()
  const { selectedProjectKey, setSelectedProjectKey } = useAdminProjects()
  const [projects, setProjects] = React.useState<ProjectItem[]>([])
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
  const [search, setSearch] = React.useState("")

  const [token, setToken] = React.useState("")
  const [authError, setAuthError] = React.useState<string | null>(null)

  const [form, setForm] = React.useState<FormState>(emptyForm)
  const [createDialogOpen, setCreateDialogOpen] = React.useState(false)
  const [submitLoading, setSubmitLoading] = React.useState(false)
  const [githubLoading, setGithubLoading] = React.useState(false)
  const [editDialogOpen, setEditDialogOpen] = React.useState(false)
  const [editingProjectKey, setEditingProjectKey] = React.useState<string | null>(null)
  const [githubDialogOpen, setGithubDialogOpen] = React.useState(false)
  const [githubProjectKey, setGithubProjectKey] = React.useState<string | null>(null)
  // 目标仓库默认跟项目自己的仓库走，开弹窗时一并带过去。
  const [githubProjectRepoUrl, setGithubProjectRepoUrl] = React.useState<string | null>(null)
  const [editForm, setEditForm] = React.useState<FormState>(emptyForm)
  const [savingEdit, setSavingEdit] = React.useState(false)
  // 别名区块（ProjectAliasesSettings）有自己的即时保存，不算表单草稿，不纳入比较。
  const handleEditOpenChange = useUnsavedChangesGuard({
    open: editDialogOpen,
    onOpenChange: setEditDialogOpen,
    value: editForm,
  })

  const hasToken = token.trim().length > 0
  const minComparableError = form.optional_update_min_comparable_version.trim()
    ? validateComparableVersion(form.optional_update_min_comparable_version)
    : null
  const maxComparableError = form.optional_update_max_comparable_version.trim()
    ? validateComparableVersion(form.optional_update_max_comparable_version)
    : null
  const editMinComparableError = editForm.optional_update_min_comparable_version.trim()
    ? validateComparableVersion(editForm.optional_update_min_comparable_version)
    : null
  const editMaxComparableError = editForm.optional_update_max_comparable_version.trim()
    ? validateComparableVersion(editForm.optional_update_max_comparable_version)
    : null

  const loadProjects = React.useCallback(
    async (nextOffset: number, signal?: AbortSignal) => {
      if (!token) {
        setProjects([])
        setTotal(0)
        return
      }

      setLoading(true)
      setError(null)

      try {
        const response = await listProjects(
          token,
          { limit: PAGE_SIZE, offset: nextOffset, search: search.trim() || undefined },
          signal,
        )
        setProjects(response.data)
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
        setProjects([])
        setTotal(0)
      } finally {
        if (!signal?.aborted) {
          setLoading(false)
        }
      }
    },
    [token, setTotal, search],
  )

  React.useEffect(() => {
    const storedToken = getSessionToken().trim()
    if (storedToken) {
      setToken(storedToken)
    }
  }, [])

  React.useEffect(() => {
    const controller = new AbortController()
    void loadProjects(offset, controller.signal)

    return () => {
      controller.abort()
    }
  }, [loadProjects, offset])

  function beginEdit(project: ProjectItem) {
    setEditingProjectKey(project.project_key)
    setEditForm({
      project_key: project.project_key,
      name: project.name,
      repo_url: project.repo_url ?? "",
      description: project.description ?? "",
      author: project.author ?? "",
      author_homepage_url: project.author_homepage_url ?? "",
      icon_url: project.icon_url ?? "",
      website_url: project.website_url ?? "",
      docs_url: project.docs_url ?? "",
      published_at: project.published_at
        ? new Date(project.published_at * 1000).toISOString().slice(0, 16)
        : "",
      optional_update_min_comparable_version: project.optional_update_min_comparable_version ?? "",
      optional_update_max_comparable_version: project.optional_update_max_comparable_version ?? "",
      stats_retention_days: String(project.stats_retention_days ?? DEFAULT_STATS_RETENTION_DAYS),
    })
    setEditDialogOpen(true)
  }

  function copyFromProject(project: ProjectItem) {
    setForm({
      project_key: project.project_key,
      name: project.name,
      repo_url: project.repo_url ?? "",
      description: project.description ?? "",
      author: project.author ?? "",
      author_homepage_url: project.author_homepage_url ?? "",
      icon_url: project.icon_url ?? "",
      website_url: project.website_url ?? "",
      docs_url: project.docs_url ?? "",
      published_at: project.published_at
        ? new Date(project.published_at * 1000).toISOString().slice(0, 16)
        : "",
      optional_update_min_comparable_version: project.optional_update_min_comparable_version ?? "",
      optional_update_max_comparable_version: project.optional_update_max_comparable_version ?? "",
      stats_retention_days: String(project.stats_retention_days ?? DEFAULT_STATS_RETENTION_DAYS),
    })
    setCreateDialogOpen(true)
    toast.success("已复制配置到表单，可直接创建新项目。")
  }

  function resetForm() {
    setForm(emptyForm)
  }

  function openCreateDialog() {
    setForm(emptyForm)
    setCreateDialogOpen(true)
  }

  async function handleSubmit() {
    if (!token) {
      toast.error("请先登录后再操作。")
      return
    }

    const payload = toMutationInput(form)
    if (!payload.project_key || !payload.name) {
      toast.error("project_key 与 name 为必填项。")
      return
    }
    if (minComparableError) {
      toast.error("可选更新范围下限格式不合法。")
      return
    }
    if (maxComparableError) {
      toast.error("可选更新范围上限格式不合法。")
      return
    }

    setSubmitLoading(true)

    try {
      await createProject(token, payload)
      toast.success("项目已创建。")
      notifyAdminProjectsChanged()

      resetForm()
      setCreateDialogOpen(false)
      resetOffset()
      await loadProjects(0)
    } catch (submitError) {
      toast.error(getErrorMessage(submitError))
    } finally {
      setSubmitLoading(false)
    }
  }

  async function handleSaveEdit() {
    if (!token || !editingProjectKey) {
      return
    }

    if (editMinComparableError) {
      toast.error("可选更新范围下限格式不合法。")
      return
    }
    if (editMaxComparableError) {
      toast.error("可选更新范围上限格式不合法。")
      return
    }

    setSavingEdit(true)
    try {
      await updateProject(
        token,
        editingProjectKey,
        toMutationInput(editForm, {
          clearOptionalRangeWithNull: true,
        }),
      )
      toast.success("项目已更新。")
      // project_key 可能被改写，选中项跟着迁移，避免侧边栏落到一个已不存在的 key 上。
      if (selectedProjectKey === editingProjectKey) {
        setSelectedProjectKey(toMutationInput(editForm).project_key)
      }
      notifyAdminProjectsChanged()
      setEditDialogOpen(false)
      setEditingProjectKey(null)
      await loadProjects(offset)
    } catch (error) {
      toast.error(getErrorMessage(error))
    } finally {
      setSavingEdit(false)
    }
  }

  async function handleDelete(projectKey: string) {
    if (!token) {
      setError("请先登录后再删除项目。")
      return
    }

    const confirmed = await confirm({
      title: "删除项目",
      description: "确认删除这个项目吗？该操作不可撤销。",
      confirmLabel: "删除",
      destructive: true,
    })
    if (!confirmed) {
      return
    }

    try {
      await deleteProject(token, projectKey)
      toast.success("项目已删除。")
      notifyAdminProjectsChanged()
      adjustAfterDelete(projects.length - 1)
      const nextOffset =
        projects.length === 1 && offset > 0 ? Math.max(0, offset - PAGE_SIZE) : offset
      await loadProjects(nextOffset)
    } catch (deleteError) {
      if (isAuthError(deleteError)) {
        setToken("")
        setAuthError("登录状态已过期，请重新登录。")
      }
      setError(getErrorMessage(deleteError))
    }
  }

  async function handlePrefillFromGithubRepo() {
    if (!token) {
      toast.error("请先登录后再操作。")
      return
    }

    const repoUrl = form.repo_url.trim()
    if (!repoUrl) {
      toast.error("请先填写 GitHub 仓库地址。")
      return
    }

    setGithubLoading(true)
    try {
      const preview = await previewProjectFromGithubRepo(token, repoUrl)
      setForm((prev) => ({
        ...prev,
        project_key: preview.project_key,
        name: preview.name,
        repo_url: preview.repo_url,
        description: preview.description ?? "",
        author: preview.author ?? "",
        author_homepage_url: preview.author_homepage_url ?? "",
        icon_url: preview.icon_url ?? "",
        website_url: preview.website_url ?? "",
        docs_url: preview.docs_url ?? "",
        published_at: preview.published_at
          ? new Date(preview.published_at * 1000).toISOString().slice(0, 16)
          : "",
      }))
      toast.success("已从 GitHub 仓库自动填充项目信息。")
    } catch (error) {
      toast.error(getErrorMessage(error))
    } finally {
      setGithubLoading(false)
    }
  }

  // 不做 memo：操作按钮闭包了当前页数据，缓存下来会让编辑/删除作用在上一轮的行上。
  const columns: Array<DataTableColumn<ProjectItem>> = [
    {
      id: "name",
      header: "名称",
      label: "名称",
      alwaysVisible: true,
      className: "font-medium",
      cell: (project) => (
        <TruncatedCell className="max-w-[16rem]" title={project.name}>
          {project.name}
        </TruncatedCell>
      ),
    },
    {
      id: "project_key",
      header: "Project Key",
      label: "Project Key",
      alwaysVisible: true,
      className: "font-mono text-xs whitespace-nowrap",
      cell: (project) => project.project_key,
    },
    {
      id: "aliases",
      header: "历史 Key",
      label: "历史 Key（别名）",
      defaultHidden: true,
      className: "font-mono text-xs text-slate-600 dark:text-slate-300",
      // aliases 是后加的字段，旧接口响应里可能没有。
      cell: (project) => (project.aliases?.length ? project.aliases.join(", ") : <EmptyValue />),
    },
    {
      id: "description",
      header: "描述",
      label: "描述",
      defaultHidden: true,
      className: "text-xs text-slate-600 dark:text-slate-300",
      cell: (project) =>
        project.description ? (
          <TruncatedCell className="max-w-[20rem]" title={project.description}>
            {project.description}
          </TruncatedCell>
        ) : (
          <EmptyValue />
        ),
    },
    {
      id: "author",
      header: "作者",
      label: "作者",
      defaultHidden: true,
      className: "text-xs text-slate-600 dark:text-slate-300",
      cell: (project) => project.author ?? <EmptyValue />,
    },
    {
      id: "repo_url",
      header: "仓库",
      label: "仓库地址",
      cell: (project) => <ExternalLinkCell url={project.repo_url} />,
    },
    {
      id: "website_url",
      header: "官网",
      label: "官网",
      cell: (project) => <ExternalLinkCell url={project.website_url} />,
    },
    {
      id: "docs_url",
      header: "文档",
      label: "文档",
      defaultHidden: true,
      cell: (project) => <ExternalLinkCell url={project.docs_url} />,
    },
    {
      id: "optional_update_range",
      header: "可选更新范围",
      label: "可选更新范围",
      className: "font-mono text-xs whitespace-nowrap text-slate-600 dark:text-slate-300",
      cell: (project) =>
        `${project.optional_update_min_comparable_version ?? "-∞"} ~ ${
          project.optional_update_max_comparable_version ?? "+∞"
        }`,
    },
    {
      id: "stats_retention_days",
      header: "统计保留",
      label: "统计保留天数",
      defaultHidden: true,
      className: "text-xs tabular-nums",
      cell: (project) => `${project.stats_retention_days} 天`,
    },
    {
      id: "published_at",
      header: "发布时间",
      label: "发布时间",
      defaultHidden: true,
      className: "whitespace-nowrap text-xs text-slate-600 tabular-nums dark:text-slate-300",
      cell: (project) => formatTimestamp(project.published_at, "—"),
    },
    {
      id: "created_at",
      header: "创建时间",
      label: "创建时间",
      defaultHidden: true,
      className: "whitespace-nowrap text-xs text-slate-600 tabular-nums dark:text-slate-300",
      cell: (project) => formatTimestamp(project.created_at, "—"),
    },
    {
      id: "actions",
      header: "操作",
      label: "操作",
      alwaysVisible: true,
      headerClassName: "text-right",
      className: "text-right",
      cell: (project) => (
        // 图标按钮：名字挂在 aria-label / title 上，读屏与悬停都拿得到。
        <div className="flex justify-end gap-1.5">
          <Button asChild type="button" size="icon-sm" variant="outline">
            <Link
              href={`/projects/${project.project_key}`}
              target="_blank"
              rel="noreferrer"
              title="项目展示页"
              aria-label="项目展示页"
            >
              <ExternalLink className="size-4" />
            </Link>
          </Button>
          <Button
            type="button"
            size="icon-sm"
            variant="outline"
            title="复制配置"
            aria-label="复制配置"
            onClick={() => copyFromProject(project)}
          >
            <Copy className="size-4" />
          </Button>
          <Button
            type="button"
            size="icon-sm"
            variant="outline"
            title="GitHub 集成"
            aria-label="GitHub 集成"
            onClick={() => {
              setGithubProjectKey(project.project_key)
              setGithubProjectRepoUrl(project.repo_url)
              setGithubDialogOpen(true)
            }}
          >
            <Github className="size-4" />
          </Button>
          <Button
            type="button"
            size="icon-sm"
            variant="outline"
            title="编辑"
            aria-label="编辑"
            onClick={() => beginEdit(project)}
          >
            <PencilLine className="size-4" />
          </Button>
          <Button
            type="button"
            size="icon-sm"
            variant="destructive"
            title="删除"
            aria-label="删除"
            onClick={() => void handleDelete(project.project_key)}
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
        title="项目管理"
        description="维护项目基础信息，包括标识、名称、仓库、官网与发布时间。"
        badge="Verhub Projects"
        actions={
          <>
            <Button
              type="button"
              variant="outline"
              className="border-white/30 bg-white/10 hover:bg-white/20"
              onClick={() => void loadProjects(offset)}
              disabled={!hasToken || loading}
            >
              {loading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <RefreshCcw className="size-4" />
              )}
              刷新
            </Button>
            <Button
              type="button"
              className="bg-emerald-300 text-emerald-950 hover:bg-emerald-200"
              onClick={openCreateDialog}
            >
              <Plus className="size-4" />
              新增项目
            </Button>
          </>
        }
      />

      {authError ? <p className="text-sm text-rose-300">{authError}</p> : null}

      <AdminCard as="section" className="space-y-4">
        <h2 className="text-lg font-semibold">项目列表</h2>

        <DataTable
          storageKey="projects"
          columns={columns}
          rows={projects}
          getRowId={(project) => project.project_key}
          loading={hasToken && loading}
          error={error}
          emptyMessage={
            !hasToken
              ? "请先在登录页完成登录后查看项目数据。"
              : "当前筛选条件下暂无项目，可点击右上角「新增项目」创建。"
          }
          // 当前选中的项目高亮：这一页同时兼任项目切换器。
          rowClassName={(project) =>
            project.project_key === selectedProjectKey ? "bg-sky-500/10" : undefined
          }
          search={{
            value: search,
            onChange: (value) => {
              setSearch(value)
              resetOffset()
            },
            placeholder: "搜索 key / 名称 / 仓库",
          }}
          pagination={{ total, page, totalPages, hasPrev, hasNext, onPrev, onNext }}
        />
      </AdminCard>

      <AdminFormDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        title="创建项目"
        description="project_key 与 name 为必填项，可先填仓库地址再从 GitHub 拉取其余信息。"
        submitLabel="创建项目"
        submitIcon={<Plus className="size-4" />}
        submitting={submitLoading}
        onSubmit={() => void handleSubmit()}
        formValue={form}
        footerExtra={
          <Button type="button" variant="outline" onClick={resetForm}>
            清空表单
          </Button>
        }
      >
        <ProjectFormFields
          form={form}
          setForm={setForm}
          minComparableError={minComparableError}
          maxComparableError={maxComparableError}
          theme="light"
        />
        <div>
          <Button
            type="button"
            variant="outline"
            disabled={githubLoading}
            onClick={() => void handlePrefillFromGithubRepo()}
          >
            {githubLoading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <RefreshCcw className="size-4" />
            )}
            从 GitHub 获取项目信息
          </Button>
        </div>
      </AdminFormDialog>

      <Dialog open={editDialogOpen} onOpenChange={handleEditOpenChange}>
        <DialogContent className="sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>编辑项目</DialogTitle>
            <DialogDescription>在弹窗中修改项目信息并保存。</DialogDescription>
          </DialogHeader>

          <DialogBody>
            <div className="grid gap-3">
              <ProjectFormFields
                form={editForm}
                setForm={setEditForm}
                minComparableError={editMinComparableError}
                maxComparableError={editMaxComparableError}
                theme="light"
              />
              {/* GitHub 相关配置（App 功能 + Release Webhook）已整体移至
                  行内「GitHub 集成」弹窗，编辑弹窗只保留项目自身信息。 */}
              <ProjectAliasesSettings
                key={`aliases-${editingProjectKey ?? "none"}`}
                token={token}
                projectKey={editingProjectKey}
              />
            </div>
          </DialogBody>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleEditOpenChange(false)}>
              取消
            </Button>
            <Button
              type="button"
              disabled={savingEdit || !editingProjectKey}
              onClick={() => void handleSaveEdit()}
            >
              <Save className="size-4" />
              保存修改
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <GithubIntegrationDialog
        key={`github-${githubProjectKey ?? "none"}`}
        open={githubDialogOpen}
        onOpenChange={setGithubDialogOpen}
        token={token}
        projectKey={githubProjectKey}
        projectRepoUrl={githubProjectRepoUrl}
      />
    </section>
  )
}
