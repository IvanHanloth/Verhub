"use client"

import * as React from "react"
import { Copy, PencilLine, Plus, RotateCcw, Trash2 } from "lucide-react"

import { Button } from "@workspace/ui/components/button"

import { AdminCard, AdminItemCard } from "@/components/admin/admin-card"
import { AdminPageHeader } from "@/components/admin/admin-page-header"
import {
  createApiKey,
  listApiKeys,
  listApiScopes,
  rotateApiKey,
  revokeApiKey,
  updateApiKey,
  type ApiKeyItem,
} from "@/lib/auth-api"
import { ApiError } from "@/lib/api-client"
import { getSessionToken } from "@/lib/auth-session"
import { listProjects, type ProjectItem } from "@/lib/projects-api"

function formatTimestamp(value: number | null | undefined): string {
  if (value === null || value === undefined) {
    return "永不过期"
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return "无效时间"
  }

  return date.toLocaleString("zh-CN")
}

export default function TokenManagementPage() {
  const [items, setItems] = React.useState<ApiKeyItem[]>([])
  const [loading, setLoading] = React.useState(false)
  const [availableScopes, setAvailableScopes] = React.useState<string[]>([])
  const [availableProjects, setAvailableProjects] = React.useState<ProjectItem[]>([])
  const [selectedScopes, setSelectedScopes] = React.useState<string[]>([])
  const [allProjects, setAllProjects] = React.useState(true)
  const [selectedProjectKeys, setSelectedProjectKeys] = React.useState<string[]>([])
  const [name, setName] = React.useState("")
  const [expiresInDays, setExpiresInDays] = React.useState(30)
  const [neverExpires, setNeverExpires] = React.useState(false)
  const [editingTokenId, setEditingTokenId] = React.useState<string | null>(null)
  const [newToken, setNewToken] = React.useState<string | null>(null)
  const [rotationToken, setRotationToken] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  const load = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const token = getSessionToken().trim()
      const [keysResponse, scopesResponse, projectResponse] = await Promise.all([
        listApiKeys(),
        listApiScopes(),
        token
          ? listProjects(token, { limit: 100, offset: 0 })
          : Promise.resolve({ data: [], total: 0 }),
      ])
      setItems(keysResponse.data)
      setAvailableScopes(scopesResponse.data)
      setAvailableProjects(projectResponse.data)
      setSelectedScopes((prev) => {
        if (prev.length > 0) {
          return prev
        }

        return scopesResponse.default
      })
    } catch (loadError) {
      if (loadError instanceof ApiError) {
        setError(loadError.message)
      } else if (loadError instanceof Error) {
        setError(loadError.message)
      } else {
        setError("加载 Token 列表失败")
      }
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    void load()
  }, [load])

  async function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (selectedScopes.length === 0) {
      setError("请至少选择一个权限范围")
      return
    }

    if (!allProjects && selectedProjectKeys.length === 0) {
      setError("请选择至少一个项目范围，或启用“作用于全部项目”。")
      return
    }

    try {
      const response = await createApiKey({
        name: name.trim(),
        scopes: selectedScopes,
        all_projects: allProjects,
        project_ids: allProjects ? [] : selectedProjectKeys,
        never_expires: neverExpires,
        expires_in_days: neverExpires ? undefined : expiresInDays,
      })
      setNewToken(response.token)
      setRotationToken(null)
      setName("")
      setSelectedProjectKeys([])
      setAllProjects(true)
      setNeverExpires(false)
      await load()
    } catch (createError) {
      if (createError instanceof Error) {
        setError(createError.message)
      } else {
        setError("创建 Token 失败")
      }
    }
  }

  async function handleRevoke(id: string) {
    const confirmed = window.confirm("确认撤销该 Token 吗？")
    if (!confirmed) {
      return
    }

    try {
      await revokeApiKey(id)
      await load()
    } catch (revokeError) {
      if (revokeError instanceof Error) {
        setError(revokeError.message)
      } else {
        setError("撤销 Token 失败")
      }
    }
  }

  async function copyNewToken() {
    const token = newToken ?? rotationToken
    if (!token) {
      return
    }

    await navigator.clipboard.writeText(token)
  }

  function toggleScope(scope: string) {
    setSelectedScopes((prev) => {
      if (prev.includes(scope)) {
        return prev.filter((item) => item !== scope)
      }

      return [...prev, scope]
    })
  }

  function toggleProject(projectKey: string) {
    setSelectedProjectKeys((prev) => {
      if (prev.includes(projectKey)) {
        return prev.filter((item) => item !== projectKey)
      }

      return [...prev, projectKey]
    })
  }

  function beginEdit(item: ApiKeyItem) {
    setEditingTokenId(item.id)
    setName(item.name)
    setSelectedScopes(item.scopes)
    setAllProjects(item.all_projects)
    setSelectedProjectKeys(item.project_ids)
    setNeverExpires(item.expires_at === null)
    setExpiresInDays(30)
    setError(null)
  }

  async function handleSaveEdit() {
    if (!editingTokenId) {
      return
    }

    if (selectedScopes.length === 0) {
      setError("请至少选择一个权限范围")
      return
    }

    if (!allProjects && selectedProjectKeys.length === 0) {
      setError("请选择至少一个项目范围，或启用“作用于全部项目”。")
      return
    }

    try {
      await updateApiKey(editingTokenId, {
        name: name.trim(),
        scopes: selectedScopes,
        all_projects: allProjects,
        project_ids: allProjects ? [] : selectedProjectKeys,
        never_expires: neverExpires,
        expires_in_days: neverExpires ? undefined : expiresInDays,
      })

      setEditingTokenId(null)
      await load()
    } catch (updateError) {
      if (updateError instanceof Error) {
        setError(updateError.message)
      } else {
        setError("更新 Token 失败")
      }
    }
  }

  async function handleRotate(itemId: string) {
    const input = window.prompt(
      "请输入旧 token 宽限期（分钟，0-10080）。例如 60 表示保留 1 小时。",
      "60",
    )
    if (input === null) {
      return
    }

    const minutes = Number(input)
    if (!Number.isInteger(minutes) || minutes < 0 || minutes > 10080) {
      setError("宽限期必须是 0-10080 的整数分钟")
      return
    }

    try {
      const response = await rotateApiKey(itemId, { grace_period_minutes: minutes })
      setRotationToken(response.token)
      setNewToken(null)
      await load()
    } catch (rotateError) {
      if (rotateError instanceof Error) {
        setError(rotateError.message)
      } else {
        setError("轮转 Token 失败")
      }
    }
  }

  return (
    <section className="space-y-5">
      <AdminPageHeader
        title="访问令牌管理"
        description="集中创建、撤销与审计 API Token，支持按权限范围配置，保障后台调用安全。"
        badge="Verhub Tokens"
      />

      <AdminCard>
        <form className="flex flex-col gap-3" onSubmit={handleCreate}>
          <label className="space-y-1 text-sm">
            <span className="text-slate-700 dark:text-slate-300">Token 名称</span>
            <input
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="w-full rounded-xl border border-slate-900/20 bg-white/80 px-3 py-2 text-sm dark:border-white/20 dark:bg-white/5"
              placeholder="例如：CI 部署密钥"
            />
          </label>
          <div className="rounded-xl border border-slate-900/20 bg-white/80 px-3 py-2 text-sm dark:border-white/20 dark:bg-white/5">
            <p className="mb-2 text-xs text-slate-700 dark:text-slate-300">权限范围（可多选）</p>
            <div className="grid max-h-36 grid-cols-2 gap-2 overflow-auto pr-1 text-xs">
              {availableScopes.map((scope) => (
                <label key={scope} className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={selectedScopes.includes(scope)}
                    onChange={() => toggleScope(scope)}
                  />
                  <span>{scope}</span>
                </label>
              ))}
            </div>
          </div>
          <label className="space-y-1 text-sm" htmlFor="expires-in-days">
            <span className="text-slate-700 dark:text-slate-300">有效期天数</span>
            <input
              id="expires-in-days"
              type="number"
              min={1}
              max={365}
              value={expiresInDays}
              onChange={(event) => setExpiresInDays(Number(event.target.value) || 30)}
              className="w-full rounded-xl border border-slate-900/20 bg-white/80 px-3 py-2 text-sm dark:border-white/20 dark:bg-white/5"
              title="有效期天数"
              disabled={neverExpires}
            />
          </label>
          <label className="inline-flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
            <input
              type="checkbox"
              checked={neverExpires}
              onChange={(event) => setNeverExpires(event.target.checked)}
            />
            永不过期
          </label>
          {neverExpires ? (
            <p className="rounded-lg border border-amber-400/40 bg-amber-300/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-200">
              提示：永不过期 token 风险较高，建议仅用于受控场景并定期轮转。
            </p>
          ) : null}

          <label className="inline-flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
            <input
              type="checkbox"
              checked={allProjects}
              onChange={(event) => setAllProjects(event.target.checked)}
            />
            作用于全部项目
          </label>

          {!allProjects ? (
            <div className="rounded-xl border border-slate-900/20 bg-white/80 px-3 py-2 text-sm dark:border-white/20 dark:bg-white/5">
              <p className="mb-2 text-xs text-slate-700 dark:text-slate-300">
                项目范围白名单（可多选）
              </p>
              <div className="grid max-h-36 grid-cols-2 gap-2 overflow-auto pr-1 text-xs">
                {availableProjects.map((project) => (
                  <label key={project.id} className="inline-flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={selectedProjectKeys.includes(project.id)}
                      onChange={() => toggleProject(project.id)}
                    />
                    <span>{project.name}</span>
                  </label>
                ))}
              </div>
            </div>
          ) : null}

          <Button type="submit" className="w-full">
            <Plus className="size-4" />
            生成 Token
          </Button>
        </form>

        {newToken || rotationToken ? (
          <div className="mt-4 rounded-xl border border-emerald-300/30 bg-emerald-300/10 p-3 text-sm">
            <p className="mb-2 font-medium">新 Token（仅展示一次）</p>
            <p className="font-mono text-xs break-all">{newToken ?? rotationToken}</p>
            <Button type="button" variant="outline" className="mt-3" onClick={copyNewToken}>
              <Copy className="size-4" />
              复制
            </Button>
          </div>
        ) : null}

        {error ? <p className="mt-3 text-sm text-rose-600 dark:text-rose-300">{error}</p> : null}
      </AdminCard>

      <AdminCard>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-medium">Token 列表</h3>
          <Button type="button" variant="outline" onClick={() => void load()} disabled={loading}>
            <RotateCcw className="size-4" />
            刷新
          </Button>
        </div>

        <div className="space-y-3">
          {items.map((item) => (
            <AdminItemCard
              key={item.id}
              as="div"
              className="text-sm dark:border-white/10 dark:bg-white/5"
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-medium">{item.name}</p>
                  <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                    scope: {item.scopes.join(", ") || "(空)"}
                  </p>
                  <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                    项目范围: {item.all_projects ? "全部项目" : item.project_ids.join(", ")}
                  </p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    过期: {formatTimestamp(item.expires_at)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button type="button" variant="outline" onClick={() => beginEdit(item)}>
                    <PencilLine className="size-4" />
                    编辑
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void handleRotate(item.id)}
                  >
                    <RotateCcw className="size-4" />
                    轮转
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void handleRevoke(item.id)}
                  >
                    <Trash2 className="size-4" />
                    撤销
                  </Button>
                </div>
              </div>
            </AdminItemCard>
          ))}
          {!items.length ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">暂无 Token</p>
          ) : null}
        </div>

        {editingTokenId ? (
          <div className="mt-4 rounded-xl border border-cyan-300/30 bg-cyan-300/10 p-3">
            <p className="mb-3 text-sm font-medium">
              正在编辑 Token 权限（在线生效，token 值不变）
            </p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={() => void handleSaveEdit()}>
                保存权限与范围
              </Button>
              <Button type="button" variant="outline" onClick={() => setEditingTokenId(null)}>
                取消
              </Button>
            </div>
          </div>
        ) : null}
      </AdminCard>
    </section>
  )
}
