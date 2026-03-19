"use client"

import * as React from "react"
import { Copy, Plus, RotateCcw, Trash2 } from "lucide-react"

import { Button } from "@workspace/ui/components/button"

import { createApiKey, listApiKeys, revokeApiKey, type ApiKeyItem } from "@/lib/auth-api"
import { ApiError } from "@/lib/api-client"

export default function TokenManagementPage() {
  const [items, setItems] = React.useState<ApiKeyItem[]>([])
  const [loading, setLoading] = React.useState(false)
  const [name, setName] = React.useState("")
  const [scopesText, setScopesText] = React.useState("versions:write")
  const [expiresInDays, setExpiresInDays] = React.useState(30)
  const [newToken, setNewToken] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  const load = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await listApiKeys()
      setItems(response.data)
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
    const scopes = scopesText
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)

    try {
      const response = await createApiKey({
        name: name.trim(),
        scopes,
        expires_in_days: expiresInDays,
      })
      setNewToken(response.token)
      setName("")
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

    await revokeApiKey(id)
    await load()
  }

  async function copyNewToken() {
    if (!newToken) {
      return
    }

    await navigator.clipboard.writeText(newToken)
  }

  return (
    <section className="space-y-5">
      <header className="rounded-3xl border border-white/10 bg-white/5 p-6">
        <h2 className="text-xl font-semibold">长期 Token 管理</h2>
        <p className="mt-2 text-sm text-slate-300">
          用于服务对接与自动化任务，支持 scope 与过期时间。
        </p>
      </header>

      <article className="rounded-2xl border border-white/10 bg-black/20 p-5">
        <form className="grid gap-3 md:grid-cols-4" onSubmit={handleCreate}>
          <input
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="rounded-xl border border-white/20 bg-white/5 px-3 py-2 text-sm"
            placeholder="Token 名称"
          />
          <input
            value={scopesText}
            onChange={(event) => setScopesText(event.target.value)}
            className="rounded-xl border border-white/20 bg-white/5 px-3 py-2 text-sm"
            placeholder="scope 列表，逗号分隔"
          />
          <label className="sr-only" htmlFor="expires-in-days">
            有效期天数
          </label>
          <input
            id="expires-in-days"
            type="number"
            min={1}
            max={365}
            value={expiresInDays}
            onChange={(event) => setExpiresInDays(Number(event.target.value) || 30)}
            className="rounded-xl border border-white/20 bg-white/5 px-3 py-2 text-sm"
            title="有效期天数"
          />
          <Button type="submit">
            <Plus className="size-4" />
            生成 Token
          </Button>
        </form>

        {newToken ? (
          <div className="mt-4 rounded-xl border border-emerald-300/30 bg-emerald-300/10 p-3 text-sm">
            <p className="mb-2 font-medium">新 Token（仅展示一次）</p>
            <p className="font-mono text-xs break-all">{newToken}</p>
            <Button type="button" variant="outline" className="mt-3" onClick={copyNewToken}>
              <Copy className="size-4" />
              复制
            </Button>
          </div>
        ) : null}

        {error ? <p className="mt-3 text-sm text-rose-300">{error}</p> : null}
      </article>

      <article className="rounded-2xl border border-white/10 bg-black/20 p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-medium">Token 列表</h3>
          <Button type="button" variant="outline" onClick={() => void load()} disabled={loading}>
            <RotateCcw className="size-4" />
            刷新
          </Button>
        </div>

        <div className="space-y-3">
          {items.map((item) => (
            <div key={item.id} className="rounded-xl border border-white/10 bg-white/5 p-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-medium">{item.name}</p>
                  <p className="mt-1 text-xs text-slate-300">
                    scope: {item.scopes.join(", ") || "(空)"}
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    过期: {item.expires_at ?? "永不过期"}
                  </p>
                </div>
                <Button type="button" variant="outline" onClick={() => void handleRevoke(item.id)}>
                  <Trash2 className="size-4" />
                  撤销
                </Button>
              </div>
            </div>
          ))}
          {!items.length ? <p className="text-sm text-slate-400">暂无 Token</p> : null}
        </div>
      </article>
    </section>
  )
}
