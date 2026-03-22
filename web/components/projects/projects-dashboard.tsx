"use client"

import * as React from "react"
import {
  CheckCircle2,
  Copy,
  ExternalLink,
  Loader2,
  PencilLine,
  Plus,
  RefreshCcw,
  Trash2,
} from "lucide-react"
import Link from "next/link"

import { Button } from "@workspace/ui/components/button"

import { ApiError, isAuthError } from "@/lib/api-client"
import { getSessionToken } from "@/lib/auth-session"
import { AdminCard } from "@/components/admin/admin-card"
import { AdminListHeader, AdminPagination } from "@/components/admin/admin-list"
import { ManagementListItem } from "@/components/admin/management-list-item"
import { AdminPageHeader } from "@/components/admin/admin-page-header"
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

export function ProjectsDashboard() {
  const [projects, setProjects] = React.useState<ProjectItem[]>([])
  const [total, setTotal] = React.useState(0)
  const [offset, setOffset] = React.useState(0)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const [token, setToken] = React.useState("")
  const [authError, setAuthError] = React.useState<string | null>(null)

  const [form, setForm] = React.useState<FormState>(emptyForm)
  const [editingId, setEditingId] = React.useState<string | null>(null)
  const [submitLoading, setSubmitLoading] = React.useState(false)
  const [githubLoading, setGithubLoading] = React.useState(false)
  const [submitMessage, setSubmitMessage] = React.useState<string | null>(null)

  const hasToken = token.trim().length > 0
  const page = Math.floor(offset / PAGE_SIZE) + 1
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

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
    setEditingId(project.id)
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
    })
    setSubmitMessage(null)
  }

  function copyFromProject(project: ProjectItem) {
    setEditingId(null)
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
    })
    setSubmitMessage("已复制配置到表单，可直接创建新项目。")
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

    const payload = toMutationInput(form)
    if (!payload.project_key || !payload.name) {
      setSubmitMessage("project_key 与 name 为必填项。")
      return
    }

    setSubmitLoading(true)
    setSubmitMessage(null)

    try {
      if (editingId) {
        await updateProject(token, editingId, payload)
        setSubmitMessage("项目已更新。")
      } else {
        await createProject(token, payload)
        setSubmitMessage("项目已创建。")
      }

      resetForm()
      setOffset(0)
      await loadProjects(0)
    } catch (submitError) {
      setSubmitMessage(getErrorMessage(submitError))
    } finally {
      setSubmitLoading(false)
    }
  }

  async function handleDelete(id: string) {
    if (!token) {
      setError("请先登录后再删除项目。")
      return
    }

    const confirmed = window.confirm("确认删除这个项目吗？该操作不可撤销。")
    if (!confirmed) {
      return
    }

    try {
      await deleteProject(token, id)
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
      setSubmitMessage("请先登录后再操作。")
      return
    }

    const repoUrl = form.repo_url.trim()
    if (!repoUrl) {
      setSubmitMessage("请先填写 GitHub 仓库地址。")
      return
    }

    setGithubLoading(true)
    setSubmitMessage(null)
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
      setSubmitMessage("已从 GitHub 仓库自动填充项目信息。")
    } catch (error) {
      setSubmitMessage(getErrorMessage(error))
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
            <h2 className="text-lg font-semibold">创建或编辑项目</h2>
            <p className="text-sm text-slate-200/90">
              用于新增或修改项目信息。project_key 与 name 为必填项。
            </p>
          </div>

          {authError ? <p className="text-sm text-rose-300">{authError}</p> : null}

          <form className="grid gap-3" onSubmit={handleSubmit}>
            <label className="space-y-1 text-sm">
              <span className="text-slate-700 dark:text-slate-300">项目标识</span>
              <input
                type="text"
                placeholder="例如：verhub-admin"
                value={form.project_key}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, project_key: event.target.value }))
                }
                className="w-full rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-sm ring-cyan-300 transition outline-none focus:ring-2"
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
                className="w-full rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-sm ring-cyan-300 transition outline-none focus:ring-2"
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
                className="w-full rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-sm ring-cyan-300 transition outline-none focus:ring-2"
                maxLength={512}
              />
            </label>
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
            <label className="space-y-1 text-sm">
              <span className="text-slate-700 dark:text-slate-300">项目描述</span>
              <textarea
                placeholder="简要说明项目用途和范围"
                value={form.description}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, description: event.target.value }))
                }
                rows={4}
                className="w-full rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-sm ring-cyan-300 transition outline-none focus:ring-2"
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
                className="w-full rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-sm ring-cyan-300 transition outline-none focus:ring-2"
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
                className="w-full rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-sm ring-cyan-300 transition outline-none focus:ring-2"
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
                className="w-full rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-sm ring-cyan-300 transition outline-none focus:ring-2"
                maxLength={1024}
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-slate-700 dark:text-slate-300">官网</span>
              <input
                type="url"
                placeholder="https://example.com"
                value={form.website_url}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, website_url: event.target.value }))
                }
                className="w-full rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-sm ring-cyan-300 transition outline-none focus:ring-2"
                maxLength={512}
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
                className="w-full rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-sm ring-cyan-300 transition outline-none focus:ring-2"
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <Button
                type="submit"
                className="bg-emerald-300 text-emerald-950 hover:bg-emerald-200"
                disabled={submitLoading}
              >
                {submitLoading ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : editingId ? (
                  <PencilLine className="size-4" />
                ) : (
                  <Plus className="size-4" />
                )}
                {editingId ? "保存修改" : "创建项目"}
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
            {projects.map((project) => (
              <ManagementListItem
                key={project.id}
                title={project.name}
                subtitle={
                  <p className="font-mono text-xs text-slate-700 dark:text-cyan-100/90">
                    ID: {project.id}
                  </p>
                }
                meta={
                  <>
                    <p className="font-mono">{project.project_key}</p>
                    <p>创建于 {new Date(project.created_at * 1000).toLocaleString("zh-CN")}</p>
                  </>
                }
                content={
                  <>
                    {project.repo_url ? (
                      <a
                        className="text-cyan-700 underline-offset-2 hover:underline dark:text-cyan-200"
                        href={project.repo_url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {project.repo_url}
                      </a>
                    ) : null}
                    {project.author ? <p className="mt-1">作者：{project.author}</p> : null}
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
                    {project.description ? <p className="mt-1">{project.description}</p> : null}
                  </>
                }
                actions={
                  <>
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
                      onClick={() => void handleDelete(project.id)}
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
