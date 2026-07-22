"use client"

import * as React from "react"
import { Copy, PencilLine, Plus, RotateCcw, Save, Trash2 } from "lucide-react"

import { Button } from "@workspace/ui/components/button"

import { AdminCard, AdminItemCard } from "@/components/admin/admin-card"
import { AdminFormDialog } from "@/components/admin/admin-form-dialog"
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

const DEFAULT_EXPIRES_IN_DAYS = 30

type TokenFormState = {
  name: string
  scopes: string[]
  allProjects: boolean
  /** 项目白名单，存的是项目 id（后端按 id 匹配）。 */
  projectIds: string[]
  neverExpires: boolean
  expiresInDays: number
}

const emptyForm: TokenFormState = {
  name: "",
  scopes: [],
  allProjects: true,
  projectIds: [],
  neverExpires: false,
  expiresInDays: DEFAULT_EXPIRES_IN_DAYS,
}

const FIELD_CLASS =
  "w-full rounded-xl border border-slate-900/20 bg-white/80 px-3 py-2 text-sm dark:border-white/20 dark:bg-white/5"

const PANEL_CLASS =
  "rounded-xl border border-slate-900/20 bg-white/80 px-3 py-2 text-sm dark:border-white/20 dark:bg-white/5"

/** 后端所有时间戳都是秒；直接喂给 Date 会当成毫秒，落在 1970 年。 */
function formatEpochSeconds(value: number): string {
  const date = new Date(value * 1000)
  return Number.isNaN(date.getTime()) ? "无效时间" : date.toLocaleString("zh-CN")
}

function formatExpiry(value: number | null | undefined): string {
  if (value === null || value === undefined) {
    return "永不过期"
  }

  return formatEpochSeconds(value)
}

function toggleValue(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value]
}

/** Token 字段。新建与编辑共用，权限和项目范围两处必须保持一致。 */
function TokenFormFields({
  form,
  setForm,
  availableScopes,
  availableProjects,
}: {
  form: TokenFormState
  setForm: React.Dispatch<React.SetStateAction<TokenFormState>>
  availableScopes: string[]
  availableProjects: ProjectItem[]
}) {
  const expiresFieldId = React.useId()

  return (
    <>
      <label className="space-y-1 text-sm">
        <span className="text-slate-700 dark:text-slate-300">Token 名称</span>
        <input
          required
          value={form.name}
          onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
          className={FIELD_CLASS}
          placeholder="例如：CI 部署密钥"
        />
      </label>

      <div className={PANEL_CLASS}>
        <p className="mb-2 text-xs text-slate-700 dark:text-slate-300">权限范围（可多选）</p>
        <div className="grid max-h-36 grid-cols-2 gap-2 overflow-auto pr-1 text-xs">
          {availableScopes.map((scope) => (
            <label key={scope} className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.scopes.includes(scope)}
                onChange={() =>
                  setForm((prev) => ({ ...prev, scopes: toggleValue(prev.scopes, scope) }))
                }
              />
              <span>{scope}</span>
            </label>
          ))}
        </div>
      </div>

      <label className="space-y-1 text-sm" htmlFor={expiresFieldId}>
        <span className="text-slate-700 dark:text-slate-300">有效期天数</span>
        <input
          id={expiresFieldId}
          type="number"
          min={1}
          max={365}
          value={form.expiresInDays}
          onChange={(event) =>
            setForm((prev) => ({
              ...prev,
              expiresInDays: Number(event.target.value) || DEFAULT_EXPIRES_IN_DAYS,
            }))
          }
          className={FIELD_CLASS}
          title="有效期天数"
          disabled={form.neverExpires}
        />
      </label>

      <label className="inline-flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
        <input
          type="checkbox"
          checked={form.neverExpires}
          onChange={(event) => setForm((prev) => ({ ...prev, neverExpires: event.target.checked }))}
        />
        永不过期
      </label>
      {form.neverExpires ? (
        <p className="rounded-lg border border-amber-400/40 bg-amber-300/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-200">
          提示：永不过期 token 风险较高，建议仅用于受控场景并定期轮转。
        </p>
      ) : null}

      <label className="inline-flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
        <input
          type="checkbox"
          checked={form.allProjects}
          onChange={(event) => setForm((prev) => ({ ...prev, allProjects: event.target.checked }))}
        />
        作用于全部项目
      </label>

      {!form.allProjects ? (
        <div className={PANEL_CLASS}>
          <p className="mb-2 text-xs text-slate-700 dark:text-slate-300">
            项目范围白名单（可多选）
          </p>
          <div className="grid max-h-36 grid-cols-2 gap-2 overflow-auto pr-1 text-xs">
            {availableProjects.map((project) => (
              <label key={project.id} className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.projectIds.includes(project.id)}
                  onChange={() =>
                    setForm((prev) => ({
                      ...prev,
                      projectIds: toggleValue(prev.projectIds, project.id),
                    }))
                  }
                />
                <span>{project.name}</span>
              </label>
            ))}
          </div>
        </div>
      ) : null}
    </>
  )
}

export default function TokenManagementPage() {
  const [items, setItems] = React.useState<ApiKeyItem[]>([])
  const [loading, setLoading] = React.useState(false)
  const [availableScopes, setAvailableScopes] = React.useState<string[]>([])
  const [defaultScopes, setDefaultScopes] = React.useState<string[]>([])
  const [availableProjects, setAvailableProjects] = React.useState<ProjectItem[]>([])

  const [createForm, setCreateForm] = React.useState<TokenFormState>(emptyForm)
  const [createDialogOpen, setCreateDialogOpen] = React.useState(false)
  const [creating, setCreating] = React.useState(false)

  const [editForm, setEditForm] = React.useState<TokenFormState>(emptyForm)
  const [editDialogOpen, setEditDialogOpen] = React.useState(false)
  const [editingTokenId, setEditingTokenId] = React.useState<string | null>(null)
  const [savingEdit, setSavingEdit] = React.useState(false)

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
      setDefaultScopes(scopesResponse.default)
      setAvailableProjects(projectResponse.data)
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

  /** 两个弹窗共用的提交前校验。 */
  function validate(form: TokenFormState): boolean {
    if (form.scopes.length === 0) {
      setError("请至少选择一个权限范围")
      return false
    }

    if (!form.allProjects && form.projectIds.length === 0) {
      setError("请选择至少一个项目范围，或启用“作用于全部项目”。")
      return false
    }

    return true
  }

  function openCreateDialog() {
    setCreateForm({ ...emptyForm, scopes: defaultScopes })
    setError(null)
    setCreateDialogOpen(true)
  }

  async function handleCreate() {
    if (!validate(createForm)) {
      return
    }

    setCreating(true)
    try {
      const response = await createApiKey({
        name: createForm.name.trim(),
        scopes: createForm.scopes,
        all_projects: createForm.allProjects,
        project_ids: createForm.allProjects ? [] : createForm.projectIds,
        never_expires: createForm.neverExpires,
        expires_in_days: createForm.neverExpires ? undefined : createForm.expiresInDays,
      })
      setNewToken(response.token)
      setRotationToken(null)
      setCreateDialogOpen(false)
      setCreateForm(emptyForm)
      await load()
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "创建 Token 失败")
    } finally {
      setCreating(false)
    }
  }

  function beginEdit(item: ApiKeyItem) {
    setEditingTokenId(item.id)
    setEditForm({
      name: item.name,
      scopes: item.scopes,
      allProjects: item.all_projects,
      projectIds: item.project_ids,
      neverExpires: item.expires_at === null,
      expiresInDays: DEFAULT_EXPIRES_IN_DAYS,
    })
    setError(null)
    setEditDialogOpen(true)
  }

  async function handleSaveEdit() {
    if (!editingTokenId || !validate(editForm)) {
      return
    }

    setSavingEdit(true)
    try {
      await updateApiKey(editingTokenId, {
        name: editForm.name.trim(),
        scopes: editForm.scopes,
        all_projects: editForm.allProjects,
        project_ids: editForm.allProjects ? [] : editForm.projectIds,
        never_expires: editForm.neverExpires,
        expires_in_days: editForm.neverExpires ? undefined : editForm.expiresInDays,
      })

      setEditDialogOpen(false)
      setEditingTokenId(null)
      await load()
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "更新 Token 失败")
    } finally {
      setSavingEdit(false)
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
      setError(revokeError instanceof Error ? revokeError.message : "撤销 Token 失败")
    }
  }

  async function copyNewToken() {
    const token = newToken ?? rotationToken
    if (!token) {
      return
    }

    await navigator.clipboard.writeText(token)
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
      setError(rotateError instanceof Error ? rotateError.message : "轮转 Token 失败")
    }
  }

  return (
    <section className="space-y-5">
      <AdminPageHeader
        title="访问令牌管理"
        description="创建与维护 API Token，按权限和项目范围控制后台访问。"
        badge="Verhub Tokens"
        actions={
          <>
            <Button type="button" variant="outline" onClick={() => void load()} disabled={loading}>
              <RotateCcw className="size-4" />
              刷新
            </Button>
            <Button type="button" onClick={openCreateDialog}>
              <Plus className="size-4" />
              新增 Token
            </Button>
          </>
        }
      />

      {newToken || rotationToken ? (
        <AdminCard className="border-emerald-300/30 bg-emerald-300/10 text-sm">
          <p className="mb-2 font-medium">新 Token（仅展示一次）</p>
          <p className="font-mono text-xs break-all">{newToken ?? rotationToken}</p>
          <Button type="button" variant="outline" className="mt-3" onClick={copyNewToken}>
            <Copy className="size-4" />
            复制
          </Button>
        </AdminCard>
      ) : null}

      {error ? <p className="text-sm text-rose-600 dark:text-rose-300">{error}</p> : null}

      <AdminCard>
        <h3 className="mb-3 font-medium">Token 列表</h3>

        <div className="space-y-3">
          {items.map((item) => {
            // 撤销是软删除：后端置 isActive=false 并记 revokedAt，行仍然留在列表里
            // 作为审计痕迹。所以这个状态必须显式画出来，否则点完撤销页面毫无变化，
            // 看上去就像按钮没生效。
            const revoked = item.revoked_at !== null || !item.is_active

            return (
              <AdminItemCard
                key={item.id}
                as="div"
                className={`text-sm dark:border-white/10 dark:bg-white/5 ${
                  revoked ? "opacity-60" : ""
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="flex flex-wrap items-center gap-2 font-medium">
                      <span className={revoked ? "line-through" : ""}>{item.name}</span>
                      {revoked ? (
                        <span className="rounded-full border border-rose-500/30 bg-rose-500/10 px-2 py-0.5 text-[11px] font-normal text-rose-600 dark:text-rose-300">
                          已撤销
                        </span>
                      ) : null}
                    </p>
                    <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                      scope: {item.scopes.join(", ") || "(空)"}
                    </p>
                    <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                      项目范围: {item.all_projects ? "全部项目" : item.project_ids.join(", ")}
                    </p>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      {revoked && item.revoked_at !== null
                        ? `撤销于 ${formatEpochSeconds(item.revoked_at)}`
                        : `过期: ${formatExpiry(item.expires_at)}`}
                    </p>
                  </div>
                  {/* 已撤销的 token 不能再编辑或轮转：改权限、换密钥对一把死掉的钥匙
                      都没有意义，留着按钮只会让人以为还能救回来。 */}
                  {revoked ? null : (
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
                  )}
                </div>
              </AdminItemCard>
            )
          })}
          {!items.length ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              暂无 Token，点击右上角“新增 Token”创建第一个。
            </p>
          ) : null}
        </div>
      </AdminCard>

      <AdminFormDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        title="新增 Token"
        description="生成的 token 只展示一次，请立即保存到安全位置。"
        submitLabel="生成 Token"
        submitIcon={<Plus className="size-4" />}
        submitting={creating}
        onSubmit={() => void handleCreate()}
        className="sm:max-w-2xl"
      >
        <TokenFormFields
          form={createForm}
          setForm={setCreateForm}
          availableScopes={availableScopes}
          availableProjects={availableProjects}
        />
      </AdminFormDialog>

      <AdminFormDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        title="编辑 Token"
        description="调整权限与项目范围，在线生效且 token 值不变。"
        submitLabel="保存权限与范围"
        submitIcon={<Save className="size-4" />}
        submitting={savingEdit}
        submitDisabled={!editingTokenId}
        onSubmit={() => void handleSaveEdit()}
        className="sm:max-w-2xl"
      >
        <TokenFormFields
          form={editForm}
          setForm={setEditForm}
          availableScopes={availableScopes}
          availableProjects={availableProjects}
        />
      </AdminFormDialog>
    </section>
  )
}
