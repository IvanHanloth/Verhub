"use client"

import * as React from "react"
import {
  Copy,
  ExternalLink,
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
import { validateComparableVersion } from "@/lib/comparable-version"
import { scrollToPageTop } from "@/lib/scroll"
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

type FormState = {
  project_key: string
  name: string
  repo_url: string
  description: string
  author: string
  author_homepage_url: string
  icon_url: string
  website_url: string
  published_at: string
  optional_update_min_comparable_version: string
  optional_update_max_comparable_version: string
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
  published_at: "",
  optional_update_min_comparable_version: "",
  optional_update_max_comparable_version: "",
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

function toMutationInput(form: FormState): ProjectMutationInput {
  return {
    project_key: form.project_key.trim(),
    name: form.name.trim(),
    repo_url: form.repo_url.trim() || undefined,
    description: form.description.trim() || undefined,
    author: form.author.trim() || undefined,
    author_homepage_url: form.author_homepage_url.trim() || undefined,
    icon_url: form.icon_url.trim() || undefined,
    website_url: form.website_url.trim() || undefined,
    published_at: toTimestampSeconds(form.published_at),
    optional_update_min_comparable_version:
      form.optional_update_min_comparable_version.trim() || undefined,
    optional_update_max_comparable_version:
      form.optional_update_max_comparable_version.trim() || undefined,
  }
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
      <label className="space-y-1 text-sm">
        <span className="text-slate-700 dark:text-slate-300">项目描述</span>
        <textarea
          placeholder="简要说明项目用途和范围"
          value={form.description}
          onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
          rows={4}
          className={inputClassName}
          maxLength={2048}
        />
      </label>
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
    </>
  )
}

export function ProjectsDashboard() {
  const [projects, setProjects] = React.useState<ProjectItem[]>([])
  const [total, setTotal] = React.useState(0)
  const [offset, setOffset] = React.useState(0)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const [token, setToken] = React.useState("")
  const [authError, setAuthError] = React.useState<string | null>(null)

  const [form, setForm] = React.useState<FormState>(emptyForm)
  const [submitLoading, setSubmitLoading] = React.useState(false)
  const [githubLoading, setGithubLoading] = React.useState(false)
  const [editDialogOpen, setEditDialogOpen] = React.useState(false)
  const [editingProjectKey, setEditingProjectKey] = React.useState<string | null>(null)
  const [editForm, setEditForm] = React.useState<FormState>(emptyForm)
  const [savingEdit, setSavingEdit] = React.useState(false)

  const hasToken = token.trim().length > 0
  const minComparableError = form.optional_update_min_comparable_version.trim()
    ? validateComparableVersion(form.optional_update_min_comparable_version)
    : null
  const maxComparableError = form.optional_update_max_comparable_version.trim()
    ? validateComparableVersion(form.optional_update_max_comparable_version)
    : null
  const page = Math.floor(offset / PAGE_SIZE) + 1
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
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
        const response = await listProjects(token, { limit: PAGE_SIZE, offset: nextOffset }, signal)
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
    [token],
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
      published_at: project.published_at
        ? new Date(project.published_at * 1000).toISOString().slice(0, 16)
        : "",
      optional_update_min_comparable_version: project.optional_update_min_comparable_version ?? "",
      optional_update_max_comparable_version: project.optional_update_max_comparable_version ?? "",
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
      published_at: project.published_at
        ? new Date(project.published_at * 1000).toISOString().slice(0, 16)
        : "",
      optional_update_min_comparable_version: project.optional_update_min_comparable_version ?? "",
      optional_update_max_comparable_version: project.optional_update_max_comparable_version ?? "",
    })
    toast.success("已复制配置到表单，可直接创建新项目。")
    scrollToPageTop()
  }

  function resetForm() {
    setForm(emptyForm)
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
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

      resetForm()
      setOffset(0)
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
      await updateProject(token, editingProjectKey, toMutationInput(editForm))
      toast.success("项目已更新。")
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

    const confirmed = window.confirm("确认删除这个项目吗？该操作不可撤销。")
    if (!confirmed) {
      return
    }

    try {
      await deleteProject(token, projectKey)
      toast.success("项目已删除。")
      const nextOffset =
        projects.length === 1 && offset > 0 ? Math.max(0, offset - PAGE_SIZE) : offset
      setOffset(nextOffset)
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

  return (
    <section className="space-y-6">
      <AdminPageHeader
        title="项目管理"
        description="维护项目基础信息，包括标识、名称、仓库、官网与发布时间。"
        badge="Verhub Projects"
        actions={
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
        }
      />

      <section className="space-y-6">
        <AdminCard className="space-y-6">
          <div className="space-y-2">
            <h2 className="text-lg font-semibold">创建项目</h2>
            <p className="text-sm text-slate-200/90">project_key 与 name 为必填项。</p>
          </div>

          {authError ? <p className="text-sm text-rose-300">{authError}</p> : null}

          <form className="grid gap-3" onSubmit={handleSubmit}>
            <ProjectFormFields
              form={form}
              setForm={setForm}
              minComparableError={minComparableError}
              maxComparableError={maxComparableError}
              theme="dark"
            />
            <div>
              <Button
                type="button"
                variant="outline"
                className="border-white/25 bg-white/5"
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
            <div className="flex flex-wrap gap-2">
              <Button
                type="submit"
                className="bg-emerald-300 text-emerald-950 hover:bg-emerald-200"
                disabled={submitLoading}
              >
                {submitLoading ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Plus className="size-4" />
                )}
                创建项目
              </Button>
              <Button
                type="button"
                variant="outline"
                className="border-white/25 bg-white/5"
                onClick={resetForm}
              >
                清空表单
              </Button>
            </div>
          </form>
        </AdminCard>
      </section>

      <AdminCard as="section">
        <AdminListHeader title="项目列表" total={total} page={page} totalPages={totalPages} />

        {!hasToken ? (
          <div className="rounded-2xl border border-dashed border-cyan-200/30 bg-cyan-100/5 p-6 text-sm text-cyan-100">
            请先在登录页完成登录后查看项目数据。
          </div>
        ) : null}

        {hasToken && loading ? (
          <div className="flex items-center gap-2 rounded-2xl border border-white/15 bg-white/5 p-6 text-sm text-slate-200">
            <Loader2 className="size-4 animate-spin" />
            正在加载项目列表...
          </div>
        ) : null}

        {hasToken && !loading && error ? (
          <div className="rounded-2xl border border-rose-300/30 bg-rose-300/10 p-6 text-sm text-rose-200">
            {error}
          </div>
        ) : null}

        {hasToken && !loading && !error && projects.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/20 bg-white/5 p-6 text-sm text-slate-300">
            暂无项目，使用上方表单创建第一条项目记录。
          </div>
        ) : null}

        {hasToken && !loading && !error && projects.length > 0 ? (
          <div className="space-y-3">
            <div className="overflow-x-auto rounded-2xl border border-slate-900/15 bg-white/70 dark:border-white/10 dark:bg-white/5">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-100/80 text-left text-slate-700 dark:bg-white/10 dark:text-slate-200">
                  <tr>
                    <th className="px-3 py-2 font-medium">项目</th>
                    <th className="px-3 py-2 font-medium">仓库/官网</th>
                    <th className="px-3 py-2 font-medium">可选更新范围</th>
                    <th className="px-3 py-2 font-medium">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {projects.map((project) => (
                    <tr
                      key={project.id}
                      className="border-t border-slate-900/10 dark:border-white/10"
                    >
                      <td className="px-3 py-2 align-top">
                        <p className="font-medium text-slate-900 dark:text-slate-100">
                          {project.name}
                        </p>
                        <p className="font-mono text-xs text-slate-600 dark:text-slate-300">
                          ID: {project.id}
                        </p>
                        <p className="font-mono text-xs text-slate-600 dark:text-slate-300">
                          {project.project_key}
                        </p>
                      </td>
                      <td className="px-3 py-2 align-top text-xs">
                        {project.repo_url ? (
                          <a
                            className="block text-cyan-700 underline-offset-2 hover:underline dark:text-cyan-200"
                            href={project.repo_url}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {project.repo_url}
                          </a>
                        ) : null}
                        {project.website_url ? (
                          <a
                            className="mt-1 block text-cyan-700 underline-offset-2 hover:underline dark:text-cyan-200"
                            href={project.website_url}
                            target="_blank"
                            rel="noreferrer"
                          >
                            官网：{project.website_url}
                          </a>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 align-top text-xs text-slate-700 dark:text-slate-300">
                        {project.optional_update_min_comparable_version ?? "-∞"}
                        {" ~ "}
                        {project.optional_update_max_comparable_version ?? "+∞"}
                      </td>
                      <td className="px-3 py-2 align-top">
                        <div className="flex flex-wrap gap-2">
                          <Button
                            asChild
                            type="button"
                            variant="outline"
                            className="border-white/20 bg-white/5"
                          >
                            <Link
                              href={`/projects/${project.project_key}`}
                              target="_blank"
                              rel="noreferrer"
                            >
                              <ExternalLink className="size-4" />
                              项目展示页
                            </Link>
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            className="border-white/20 bg-white/5"
                            onClick={() => copyFromProject(project)}
                          >
                            <Copy className="size-4" />
                            复制配置
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            className="border-white/20 bg-white/5"
                            onClick={() => beginEdit(project)}
                          >
                            <PencilLine className="size-4" />
                            编辑
                          </Button>
                          <Button
                            type="button"
                            variant="destructive"
                            onClick={() => void handleDelete(project.project_key)}
                          >
                            <Trash2 className="size-4" />
                            删除
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
              hasNext={offset + PAGE_SIZE < total}
              onPrev={() => setOffset((prev) => Math.max(0, prev - PAGE_SIZE))}
              onNext={() => setOffset((prev) => prev + PAGE_SIZE)}
            />
          </div>
        ) : null}
      </AdminCard>

      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>编辑项目</DialogTitle>
            <DialogDescription>在弹窗中修改项目信息并保存。</DialogDescription>
          </DialogHeader>

          <div className="grid gap-3">
            <ProjectFormFields
              form={editForm}
              setForm={setEditForm}
              minComparableError={editMinComparableError}
              maxComparableError={editMaxComparableError}
              theme="light"
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setEditDialogOpen(false)}>
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
    </section>
  )
}
