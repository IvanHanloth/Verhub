"use client"

import * as React from "react"
import { AlertTriangle, CheckCircle2, FolderKanban, Loader2, PencilLine, Plus, RefreshCcw, Trash2 } from "lucide-react"

import { Button } from "@workspace/ui/components/button"

import { ApiError, isAuthError } from "@/lib/api-client"
import {
  createProject,
  deleteProject,
  listProjects,
  loginAdmin,
  type ProjectItem,
  type ProjectMutationInput,
  updateProject,
} from "@/lib/projects-api"

const PAGE_SIZE = 10
const TOKEN_STORAGE_KEY = "verhub-admin-token"

type FormState = {
  project_key: string
  name: string
  repo_url: string
  description: string
}

const emptyForm: FormState = {
  project_key: "",
  name: "",
  repo_url: "",
  description: "",
}

function toMutationInput(form: FormState): ProjectMutationInput {
  return {
    project_key: form.project_key.trim(),
    name: form.name.trim(),
    repo_url: form.repo_url.trim() || undefined,
    description: form.description.trim() || undefined,
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
  const [tempToken, setTempToken] = React.useState("")
  const [username, setUsername] = React.useState("")
  const [password, setPassword] = React.useState("")
  const [loginLoading, setLoginLoading] = React.useState(false)
  const [authError, setAuthError] = React.useState<string | null>(null)

  const [form, setForm] = React.useState<FormState>(emptyForm)
  const [editingId, setEditingId] = React.useState<string | null>(null)
  const [submitLoading, setSubmitLoading] = React.useState(false)
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
          setTempToken("")
          window.localStorage.removeItem(TOKEN_STORAGE_KEY)
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
    const storedToken = window.localStorage.getItem(TOKEN_STORAGE_KEY) ?? ""
    if (storedToken) {
      setToken(storedToken)
      setTempToken(storedToken)
    }
  }, [])

  React.useEffect(() => {
    const controller = new AbortController()
    void loadProjects(offset, controller.signal)

    return () => {
      controller.abort()
    }
  }, [loadProjects, offset])

  async function handleLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoginLoading(true)
    setAuthError(null)

    try {
      const response = await loginAdmin(username.trim(), password)
      setToken(response.access_token)
      setTempToken(response.access_token)
      window.localStorage.setItem(TOKEN_STORAGE_KEY, response.access_token)
      setOffset(0)
      setPassword("")
    } catch (loginError) {
      setAuthError(getErrorMessage(loginError))
    } finally {
      setLoginLoading(false)
    }
  }

  function saveToken() {
    const nextToken = tempToken.trim()
    setToken(nextToken)
    setOffset(0)

    if (nextToken) {
      window.localStorage.setItem(TOKEN_STORAGE_KEY, nextToken)
      setAuthError(null)
      return
    }

    window.localStorage.removeItem(TOKEN_STORAGE_KEY)
    setProjects([])
    setTotal(0)
  }

  function beginEdit(project: ProjectItem) {
    setEditingId(project.id)
    setForm({
      project_key: project.project_key,
      name: project.name,
      repo_url: project.repo_url ?? "",
      description: project.description ?? "",
    })
    setSubmitMessage(null)
  }

  function resetForm() {
    setEditingId(null)
    setForm(emptyForm)
    setSubmitMessage(null)
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!token) {
      setSubmitMessage("请先登录或填写有效 JWT。")
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
      const nextOffset = projects.length === 1 && offset > 0 ? Math.max(0, offset - PAGE_SIZE) : offset
      setOffset(nextOffset)
      await loadProjects(nextOffset)
    } catch (deleteError) {
      if (isAuthError(deleteError)) {
        setToken("")
        setTempToken("")
        window.localStorage.removeItem(TOKEN_STORAGE_KEY)
        setAuthError("登录状态已过期，请重新登录。")
      }
      setError(getErrorMessage(deleteError))
    }
  }

  return (
    <main className="min-h-svh bg-[linear-gradient(145deg,#0f172a_0%,#1f2937_45%,#0b1224_100%)] text-slate-100">
      <div className="mx-auto w-full max-w-7xl space-y-6 px-4 py-8 sm:px-8 sm:py-10">
        <section className="rounded-3xl border border-cyan-200/20 bg-white/8 p-6 shadow-2xl backdrop-blur-md">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-2">
              <p className="inline-flex items-center gap-2 rounded-full border border-cyan-200/25 bg-cyan-200/10 px-3 py-1 text-xs tracking-[0.16em] text-cyan-100 uppercase">
                <FolderKanban className="size-3.5" />
                Verhub Projects
              </p>
              <h1 className="text-2xl font-semibold sm:text-3xl">项目管理工作台</h1>
              <p className="max-w-3xl text-sm text-slate-200/90 sm:text-base">
                在同一个界面完成登录、分页查看、创建、编辑与删除，帮助你快速维护版本管理平台的项目元数据。
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              className="border-white/30 bg-white/10 hover:bg-white/20"
              onClick={() => void loadProjects(offset)}
              disabled={!hasToken || loading}
            >
              {loading ? <Loader2 className="size-4 animate-spin" /> : <RefreshCcw className="size-4" />}
              刷新
            </Button>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.1fr_1.9fr]">
          <article className="space-y-6 rounded-3xl border border-white/15 bg-black/25 p-5 shadow-xl">
            <div className="space-y-2">
              <h2 className="text-lg font-semibold">管理员登录</h2>
              <p className="text-sm text-slate-300">支持账号密码换取 JWT，也可粘贴已有 token。</p>
            </div>

            <form className="space-y-3" onSubmit={handleLogin}>
              <input
                type="text"
                placeholder="用户名"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                className="w-full rounded-xl border border-white/20 bg-white/5 px-3 py-2 text-sm outline-none ring-cyan-300 transition focus:ring-2"
                required
              />
              <input
                type="password"
                placeholder="密码"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="w-full rounded-xl border border-white/20 bg-white/5 px-3 py-2 text-sm outline-none ring-cyan-300 transition focus:ring-2"
                required
              />
              <Button type="submit" className="w-full bg-cyan-200 text-slate-900 hover:bg-cyan-100" disabled={loginLoading}>
                {loginLoading ? <Loader2 className="size-4 animate-spin" /> : null}
                获取访问令牌
              </Button>
            </form>

            <div className="space-y-2">
              <label className="text-sm text-slate-300" htmlFor="token-input">
                JWT Token
              </label>
              <textarea
                id="token-input"
                value={tempToken}
                onChange={(event) => setTempToken(event.target.value)}
                rows={5}
                className="w-full rounded-xl border border-white/20 bg-white/5 px-3 py-2 text-xs outline-none ring-cyan-300 transition focus:ring-2"
                placeholder="Bearer 后面的 token"
              />
              <Button type="button" variant="secondary" className="w-full" onClick={saveToken}>
                保存并应用 Token
              </Button>
            </div>

            {authError ? (
              <p className="inline-flex items-center gap-2 text-sm text-rose-300">
                <AlertTriangle className="size-4" />
                {authError}
              </p>
            ) : null}
          </article>

          <article className="space-y-6 rounded-3xl border border-white/15 bg-white/8 p-5 shadow-xl backdrop-blur">
            <div className="space-y-2">
              <h2 className="text-lg font-semibold">创建或编辑项目</h2>
              <p className="text-sm text-slate-200/90">字段会按后端 DTO 校验规则提交，支持在同一表单切换编辑模式。</p>
            </div>

            <form className="grid gap-3" onSubmit={handleSubmit}>
              <input
                type="text"
                placeholder="project_key（例如 verhub-admin）"
                value={form.project_key}
                onChange={(event) => setForm((prev) => ({ ...prev, project_key: event.target.value }))}
                className="rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-sm outline-none ring-cyan-300 transition focus:ring-2"
                required
                maxLength={64}
              />
              <input
                type="text"
                placeholder="项目名称"
                value={form.name}
                onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                className="rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-sm outline-none ring-cyan-300 transition focus:ring-2"
                required
                maxLength={128}
              />
              <input
                type="url"
                placeholder="仓库地址（可选）"
                value={form.repo_url}
                onChange={(event) => setForm((prev) => ({ ...prev, repo_url: event.target.value }))}
                className="rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-sm outline-none ring-cyan-300 transition focus:ring-2"
                maxLength={512}
              />
              <textarea
                placeholder="项目描述（可选）"
                value={form.description}
                onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
                rows={4}
                className="rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-sm outline-none ring-cyan-300 transition focus:ring-2"
                maxLength={2048}
              />
              <div className="flex flex-wrap gap-2">
                <Button type="submit" className="bg-emerald-300 text-emerald-950 hover:bg-emerald-200" disabled={submitLoading}>
                  {submitLoading ? <Loader2 className="size-4 animate-spin" /> : editingId ? <PencilLine className="size-4" /> : <Plus className="size-4" />}
                  {editingId ? "保存修改" : "创建项目"}
                </Button>
                <Button type="button" variant="outline" className="border-white/25 bg-white/5" onClick={resetForm}>
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
          </article>
        </section>

        <section className="rounded-3xl border border-white/15 bg-black/25 p-5 shadow-xl">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">项目列表</h2>
            <p className="text-sm text-slate-300">
              共 {total} 条，当前第 {page}/{totalPages} 页
            </p>
          </div>

          {!hasToken ? (
            <div className="rounded-2xl border border-dashed border-cyan-200/30 bg-cyan-100/5 p-6 text-sm text-cyan-100">
              请先登录或填入 JWT Token 后查看项目数据。
            </div>
          ) : null}

          {hasToken && loading ? (
            <div className="flex items-center gap-2 rounded-2xl border border-white/15 bg-white/5 p-6 text-sm text-slate-200">
              <Loader2 className="size-4 animate-spin" />
              正在加载项目列表...
            </div>
          ) : null}

          {hasToken && !loading && error ? (
            <div className="rounded-2xl border border-rose-300/30 bg-rose-300/10 p-6 text-sm text-rose-200">{error}</div>
          ) : null}

          {hasToken && !loading && !error && projects.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/20 bg-white/5 p-6 text-sm text-slate-300">
              暂无项目，使用上方表单创建第一条项目记录。
            </div>
          ) : null}

          {hasToken && !loading && !error && projects.length > 0 ? (
            <div className="space-y-3">
              {projects.map((project) => (
                <article key={project.id} className="rounded-2xl border border-white/15 bg-white/8 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1">
                      <p className="text-base font-medium">{project.name}</p>
                      <p className="font-mono text-xs text-cyan-100/90">{project.project_key}</p>
                      <p className="text-xs text-slate-300">创建于 {new Date(project.created_at).toLocaleString("zh-CN")}</p>
                      {project.repo_url ? (
                        <a className="text-sm text-cyan-200 underline-offset-2 hover:underline" href={project.repo_url} target="_blank" rel="noreferrer">
                          {project.repo_url}
                        </a>
                      ) : null}
                      {project.description ? <p className="text-sm text-slate-200/90">{project.description}</p> : null}
                    </div>
                    <div className="flex gap-2">
                      <Button type="button" variant="outline" className="border-white/20 bg-white/5" onClick={() => beginEdit(project)}>
                        <PencilLine className="size-4" />
                        编辑
                      </Button>
                      <Button type="button" variant="destructive" onClick={() => void handleDelete(project.id)}>
                        <Trash2 className="size-4" />
                        删除
                      </Button>
                    </div>
                  </div>
                </article>
              ))}

              <div className="flex flex-wrap justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  className="border-white/20 bg-white/5"
                  disabled={offset === 0}
                  onClick={() => setOffset((prev) => Math.max(0, prev - PAGE_SIZE))}
                >
                  上一页
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="border-white/20 bg-white/5"
                  disabled={offset + PAGE_SIZE >= total}
                  onClick={() => setOffset((prev) => prev + PAGE_SIZE)}
                >
                  下一页
                </Button>
              </div>
            </div>
          ) : null}
        </section>
      </div>
    </main>
  )
}
