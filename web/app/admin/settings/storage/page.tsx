"use client"

import * as React from "react"
import {
  AlertTriangle,
  FlaskConical,
  HardDrive,
  Loader2,
  Pencil,
  Plus,
  Save,
  Star,
  Trash2,
  Zap,
} from "lucide-react"
import { toast } from "sonner"

import { Button } from "@workspace/ui/components/button"

import { AdminCard } from "@/components/admin/admin-card"
import { AdminFormDialog } from "@/components/admin/admin-form-dialog"
import { AdminPageHeader } from "@/components/admin/admin-page-header"
import {
  ApiKeyField,
  EMPTY_API_KEY_STATE,
  hasApiKeyChange,
  toApiKeyPayload,
  type ApiKeyState,
} from "@/components/common/api-key-field"
import { useConfirm } from "@/components/common/confirm-dialog"
import { CdnSettingsCard } from "@/components/files/cdn-settings-card"
import { SectionHeading } from "@/components/common/feature-panel"
import {
  CopyableUrl,
  FIELD_CLASS,
  LabeledField,
  StatusBadge,
  TextField,
} from "@/components/common/settings-fields"
import { LoadingLine } from "@/components/common/skeleton"
import { isAuthError } from "@/lib/api-client"
import { getSessionToken } from "@/lib/auth-session"
import { getErrorMessage } from "@/lib/error-utils"
import {
  createStorageBackend,
  deleteStorageBackend,
  formatBytes,
  getStorageOverview,
  testStorageBackend,
  updateStorageBackend,
  type StorageBackendView,
  type StorageOverview,
  type StorageProbeResult,
} from "@/lib/files-api"

type BackendFormState = {
  name: string
  base_url: string
  username: string
  password: ApiKeyState
  /** 分片大小（KB），空串表示整文件写入。 */
  part_size_kb: string
  is_default: boolean
}

const EMPTY_FORM: BackendFormState = {
  name: "",
  base_url: "",
  username: "",
  password: EMPTY_API_KEY_STATE,
  part_size_kb: "",
  is_default: false,
}

export default function StorageSettingsPage() {
  const confirm = useConfirm()
  const [token, setToken] = React.useState(() => getSessionToken().trim())
  const [overview, setOverview] = React.useState<StorageOverview | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [busyId, setBusyId] = React.useState<string | null>(null)
  const [probes, setProbes] = React.useState<Record<string, StorageProbeResult>>({})

  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<StorageBackendView | null>(null)
  const [form, setForm] = React.useState<BackendFormState>(EMPTY_FORM)
  const [saving, setSaving] = React.useState(false)

  const reload = React.useCallback(
    async (signal?: AbortSignal) => {
      if (!token) {
        setLoading(false)
        setError("请先登录后再配置。")
        return
      }
      try {
        setOverview(await getStorageOverview(token, signal))
        setError(null)
      } catch (loadError) {
        if (signal?.aborted) {
          return
        }
        if (isAuthError(loadError)) {
          setToken("")
        }
        setError(getErrorMessage(loadError))
      } finally {
        if (!signal?.aborted) {
          setLoading(false)
        }
      }
    },
    [token],
  )

  React.useEffect(() => {
    const controller = new AbortController()
    void reload(controller.signal)
    return () => controller.abort()
  }, [reload])

  function openCreate() {
    setEditing(null)
    setForm(EMPTY_FORM)
    setDialogOpen(true)
  }

  function openEdit(backend: StorageBackendView) {
    setEditing(backend)
    setForm({
      name: backend.name,
      base_url: backend.base_url ?? "",
      username: backend.username ?? "",
      password: EMPTY_API_KEY_STATE,
      part_size_kb: backend.part_size_kb ? String(backend.part_size_kb) : "",
      is_default: backend.is_default,
    })
    setDialogOpen(true)
  }

  async function handleSave() {
    if (!token) {
      return
    }
    const isLocal = editing?.kind === "local"
    if (!form.name.trim() || (!isLocal && !form.base_url.trim())) {
      toast.error(isLocal ? "请填写名称。" : "请填写名称与 WebDAV 地址。")
      return
    }
    const partSizeText = form.part_size_kb.trim()
    const partSize = partSizeText ? Number(partSizeText) : null
    if (partSize !== null && (!Number.isInteger(partSize) || partSize < 64 || partSize > 1048576)) {
      toast.error("分片大小需为 64 - 1048576 之间的整数（KB），或留空。")
      return
    }

    setSaving(true)
    try {
      if (editing) {
        await updateStorageBackend(token, editing.id, {
          name: form.name.trim(),
          ...(isLocal
            ? {}
            : {
                base_url: form.base_url.trim(),
                username: form.username.trim(),
                part_size_kb: partSize,
                ...(hasApiKeyChange(form.password)
                  ? { password: toApiKeyPayload(form.password) ?? "" }
                  : {}),
              }),
          ...(form.is_default && !editing.is_default ? { is_default: true as const } : {}),
        })
        toast.success("存储已更新。")
      } else {
        await createStorageBackend(token, {
          name: form.name.trim(),
          kind: "webdav",
          base_url: form.base_url.trim(),
          username: form.username.trim() || undefined,
          part_size_kb: partSize,
          password: toApiKeyPayload(form.password) || undefined,
          is_default: form.is_default,
        })
        toast.success("存储已添加，建议先测试连接。")
      }
      setDialogOpen(false)
      await reload()
    } catch (saveError) {
      toast.error(getErrorMessage(saveError))
    } finally {
      setSaving(false)
    }
  }

  async function handleTest(backend: StorageBackendView) {
    if (!token) {
      return
    }
    setBusyId(backend.id)
    try {
      const result = await testStorageBackend(token, backend.id)
      setProbes((current) => ({ ...current, [backend.id]: result }))
      if (result.ok) {
        toast.success(`${backend.name} 连接正常，耗时 ${result.latency_ms} 毫秒。`)
      }
    } catch (testError) {
      toast.error(getErrorMessage(testError))
    } finally {
      setBusyId(null)
    }
  }

  async function handleSetDefault(backend: StorageBackendView) {
    if (!token) {
      return
    }
    setBusyId(backend.id)
    try {
      await updateStorageBackend(token, backend.id, { is_default: true })
      toast.success(`已将 ${backend.name} 设为默认存储。`)
      await reload()
    } catch (updateError) {
      toast.error(getErrorMessage(updateError))
    } finally {
      setBusyId(null)
    }
  }

  async function handleDelete(backend: StorageBackendView) {
    if (!token) {
      return
    }
    const confirmed = await confirm({
      title: "删除存储",
      description: `将删除存储配置「${backend.name}」。存储里的文件不会被删除，但必须先在文件库中删除存放在此的全部文件。`,
      confirmLabel: "删除",
      destructive: true,
    })
    if (!confirmed) {
      return
    }
    setBusyId(backend.id)
    try {
      await deleteStorageBackend(token, backend.id)
      toast.success("存储已删除。")
      await reload()
    } catch (deleteError) {
      toast.error(getErrorMessage(deleteError))
    } finally {
      setBusyId(null)
    }
  }

  const distBase = overview?.dist_base_url ?? null

  return (
    <section className="space-y-5">
      <AdminPageHeader
        title="存储设置"
        description="配置文件分发使用的存储：本机磁盘或 WebDAV。所有存储的文件都通过同一个分发域名提供直链。"
        badge="Verhub Settings"
        icon={HardDrive}
        actions={
          <Button type="button" onClick={openCreate} disabled={!token}>
            <Plus className="size-4" />
            添加 WebDAV
          </Button>
        }
      />

      {error ? (
        <AdminCard className="flex items-center gap-2 text-sm text-rose-500 dark:text-rose-300">
          <AlertTriangle className="size-4" />
          {error}
        </AdminCard>
      ) : null}

      {loading ? (
        <AdminCard>
          <LoadingLine>正在读取配置...</LoadingLine>
        </AdminCard>
      ) : null}

      {!loading && overview ? (
        <>
          <AdminCard as="section" className="space-y-4">
            <SectionHeading
              title="分发域名"
              description="直链统一为 {分发域名}/f/{项目}/{文件 ID}/{文件名}，内容写入后永不改变，可放心让 CDN 长期缓存。"
              actions={
                distBase ? (
                  <StatusBadge tone="ok">已配置</StatusBadge>
                ) : (
                  <StatusBadge tone="warn">未配置</StatusBadge>
                )
              }
            />
            {distBase ? (
              <CopyableUrl label="分发域名" url={distBase} copiedMessage="分发域名已复制。" />
            ) : (
              <p className="text-sm text-amber-700 dark:text-amber-200">
                未设置环境变量 <code className="font-mono">VERHUB_DIST_BASE_URL</code>
                ：直链暂按当前站点地址访问，GitHub 附件镜像不可用。
              </p>
            )}
            <ul className="list-disc space-y-1 pl-5 text-xs text-slate-600 dark:text-slate-400">
              <li>
                分发域名在部署时通过 <code className="font-mono">VERHUB_DIST_BASE_URL</code>{" "}
                设置（如 <code className="font-mono">https://cdn.verhub.example.com</code>
                ），前后端容器都要配置，修改后需重启。配置后该域名只提供{" "}
                <code className="font-mono">/f/</code>
                ，主站域名不再提供直链。
              </li>
              <li>
                CDN 回源到本服务：缓存规则对 <code className="font-mono">/f/</code> 遵循源站
                Cache-Control（一年、immutable）， 忽略查询参数，并建议开启回源中间层 / 分层缓存与
                Range 回源。
              </li>
              <li>
                单个文件上限 {formatBytes(overview.upload_max_bytes)}（VERHUB_UPLOAD_MAX_MB）。
              </li>
            </ul>
          </AdminCard>

          <CdnSettingsCard token={token} />

          <AdminCard as="section" className="space-y-4">
            <SectionHeading
              title="存储后端"
              description="项目未单独指定存储时，新文件写入默认存储。切换存储只影响之后的文件，已有文件的直链不变。"
            />
            <ul className="space-y-3">
              {overview.backends.map((backend) => (
                <BackendRow
                  key={backend.id}
                  backend={backend}
                  distBase={distBase}
                  probe={probes[backend.id] ?? null}
                  busy={busyId === backend.id}
                  onTest={() => void handleTest(backend)}
                  onEdit={() => openEdit(backend)}
                  onSetDefault={() => void handleSetDefault(backend)}
                  onDelete={() => void handleDelete(backend)}
                />
              ))}
            </ul>
          </AdminCard>
        </>
      ) : null}

      <AdminFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title={editing ? `编辑存储：${editing.name}` : "添加 WebDAV 存储"}
        description={
          editing?.kind === "local"
            ? "本机存储的根目录由环境变量 VERHUB_STORAGE_DIR 决定。"
            : "文件会写入 {WebDAV 地址}/f/...，目录不存在时自动创建。"
        }
        submitLabel="保存"
        submitIcon={<Save className="size-4" />}
        submitting={saving}
        onSubmit={() => void handleSave()}
        formValue={form}
      >
        <TextField
          label="名称"
          value={form.name}
          onChange={(value) => setForm((prev) => ({ ...prev, name: value }))}
          placeholder="例如：坚果云"
          maxLength={64}
        />
        {editing?.kind === "local" ? null : (
          <>
            <TextField
              label="WebDAV 地址"
              value={form.base_url}
              onChange={(value) => setForm((prev) => ({ ...prev, base_url: value }))}
              placeholder="https://dav.example.com/remote.php/dav/files/user/verhub"
              maxLength={512}
              mono
              hint={
                editing && editing.file_count > 0
                  ? `已有 ${editing.file_count} 个文件存放在旧地址，修改地址不会迁移它们，请先自行把数据搬到新地址。`
                  : "填到存放文件的目录，末尾斜杠可有可无。"
              }
            />
            <TextField
              label="用户名"
              value={form.username}
              onChange={(value) => setForm((prev) => ({ ...prev, username: value }))}
              maxLength={256}
            />
            <ApiKeyField
              label="密码"
              description="加密存储，保存后不再回读，只显示指纹。网盘类服务请使用应用专用密码。"
              fingerprint={editing?.password_fingerprint ?? null}
              configured={editing?.has_password ?? false}
              placeholder="WebDAV 密码，无需鉴权可留空"
              state={form.password}
              onStateChange={(password) => setForm((prev) => ({ ...prev, password }))}
            />
            <LabeledField
              label="分片大小（KB，可选）"
              hint="单次上传请求体受限的服务（如宝塔 WAF、部分网盘）请填写，如 512。大于该值的文件拆成多个分片存放，读取时自动拼接，直链不变；设置后无法使用零带宽模式。留空为整文件写入。修改只影响之后的文件。"
            >
              <input
                type="number"
                min={64}
                max={1048576}
                step={64}
                value={form.part_size_kb}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, part_size_kb: event.target.value }))
                }
                placeholder="留空 = 整文件写入"
                className={FIELD_CLASS}
              />
            </LabeledField>
          </>
        )}
        <label className="inline-flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
          <input
            type="checkbox"
            checked={form.is_default}
            disabled={editing?.is_default}
            onChange={(event) => setForm((prev) => ({ ...prev, is_default: event.target.checked }))}
            className="size-4"
          />
          设为默认存储
        </label>
      </AdminFormDialog>
    </section>
  )
}

function BackendRow({
  backend,
  distBase,
  probe,
  busy,
  onTest,
  onEdit,
  onSetDefault,
  onDelete,
}: {
  backend: StorageBackendView
  distBase: string | null
  probe: StorageProbeResult | null
  busy: boolean
  onTest: () => void
  onEdit: () => void
  onSetDefault: () => void
  onDelete: () => void
}) {
  const [showCdn, setShowCdn] = React.useState(false)

  return (
    <li className="space-y-3 rounded-xl border border-slate-900/10 bg-white/60 p-4 dark:border-white/10 dark:bg-white/5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{backend.name}</span>
            <span className="rounded-md border border-slate-900/15 px-1.5 py-0.5 text-[11px] text-slate-600 uppercase dark:border-white/15 dark:text-slate-300">
              {backend.kind === "local" ? "本机" : "WebDAV"}
            </span>
            {backend.is_default ? <StatusBadge tone="ok">默认</StatusBadge> : null}
            {backend.part_size_kb ? (
              <span className="rounded-md border border-sky-500/30 bg-sky-500/10 px-1.5 py-0.5 text-[11px] text-sky-700 dark:text-sky-300">
                分片 {backend.part_size_kb} KB
              </span>
            ) : null}
            <span className="text-xs text-slate-500 dark:text-slate-400">
              {backend.file_count} 个文件
            </span>
          </div>
          {backend.base_url ? (
            <p className="truncate font-mono text-xs text-slate-500 dark:text-slate-400">
              {backend.username ? `${backend.username} @ ` : ""}
              {backend.base_url}
            </p>
          ) : (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              存放在服务器的 VERHUB_STORAGE_DIR 目录（容器内默认
              /var/lib/verhub/storage），请挂载持久卷。
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Button type="button" size="sm" variant="outline" onClick={onTest} disabled={busy}>
            {busy ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <FlaskConical className="size-4" />
            )}
            测试
          </Button>
          {!backend.is_default ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={onSetDefault}
              disabled={busy}
            >
              <Star className="size-4" />
              设为默认
            </Button>
          ) : null}
          <Button type="button" size="sm" variant="outline" onClick={onEdit} disabled={busy}>
            <Pencil className="size-4" />
            编辑
          </Button>
          {!backend.is_builtin ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={onDelete}
              disabled={busy || backend.is_default || backend.file_count > 0}
              title={
                backend.is_default
                  ? "默认存储不可删除"
                  : backend.file_count > 0
                    ? "存储中仍有文件"
                    : undefined
              }
            >
              <Trash2 className="size-4" />
              删除
            </Button>
          ) : null}
        </div>
      </div>

      {probe ? (
        <div
          className={`rounded-lg border p-3 text-xs ${
            probe.ok
              ? "border-emerald-500/30 bg-emerald-500/10 text-slate-700 dark:text-slate-300"
              : "border-rose-500/30 bg-rose-500/10 text-slate-700 dark:text-slate-300"
          }`}
        >
          {probe.ok ? (
            <>
              <p>
                读写正常（{probe.latency_ms} 毫秒）。
                {probe.range_supported === false
                  ? "该服务不支持 Range 读取：大文件的分片缓存与断点下载不可用，建议更换服务。"
                  : "支持 Range 读取。"}
                {probe.large_write_ok ? "大文件写入正常。" : null}
              </p>
              {probe.large_write_ok === false ? (
                <p className="mt-1 break-all text-amber-700 dark:text-amber-300">{probe.error}</p>
              ) : null}
            </>
          ) : (
            <p className="break-all">连接失败：{probe.error}</p>
          )}
        </div>
      ) : null}

      {backend.cdn_origin ? (
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => setShowCdn((value) => !value)}
            className="inline-flex items-center gap-1.5 text-xs text-sky-700 hover:underline dark:text-sky-300"
          >
            <Zap className="size-3.5" />
            {showCdn ? "收起" : "零带宽模式：让 CDN 直接回源这个 WebDAV"}
          </button>
          {showCdn ? <CdnOriginGuide backend={backend} distBase={distBase} /> : null}
        </div>
      ) : null}
    </li>
  )
}

/** CDN 直接回源 WebDAV 的配置参考，含在浏览器本地计算的 Basic 鉴权头。 */
function CdnOriginGuide({
  backend,
  distBase,
}: {
  backend: StorageBackendView
  distBase: string | null
}) {
  const origin = backend.cdn_origin!
  const [username, setUsername] = React.useState(backend.username ?? "")
  const [password, setPassword] = React.useState("")
  const authHeader = password ? `Basic ${encodeBase64(`${username}:${password}`)}` : ""

  return (
    <div className="space-y-3 rounded-lg border border-sky-500/25 bg-sky-500/5 p-3 text-xs text-slate-700 dark:text-slate-300">
      <p>
        在 CDN 上为分发域名{distBase ? <code className="mx-1 font-mono">{distBase}</code> : null}
        添加一条针对 <code className="font-mono">/f/</code>{" "}
        路径的回源规则，文件流量将不经过本服务器。
        直链里不含存储信息，这条规则会把匹配路径的请求全部发往此
        WebDAV，因此匹配范围内的文件必须都存放在这里：
        可以把它设为默认存储并不再使用其他存储，也可以只匹配部分项目的{" "}
        <code className="font-mono">/f/{"{项目}"}/</code> 路径。
      </p>
      <dl className="grid gap-x-4 gap-y-1.5 sm:grid-cols-[8rem_1fr]">
        <dt className="text-slate-500 dark:text-slate-400">回源协议</dt>
        <dd className="font-mono">{origin.scheme.toUpperCase()}</dd>
        <dt className="text-slate-500 dark:text-slate-400">回源地址</dt>
        <dd className="font-mono break-all">{origin.host}</dd>
        <dt className="text-slate-500 dark:text-slate-400">回源 Host</dt>
        <dd className="font-mono break-all">{origin.host.replace(/:\d+$/, "")}</dd>
        <dt className="text-slate-500 dark:text-slate-400">路径改写</dt>
        <dd className="font-mono break-all">
          {origin.path_prefix ? `/f/(.*) → ${origin.path_prefix}/f/$1` : "无需改写"}
        </dd>
        <dt className="text-slate-500 dark:text-slate-400">回源请求头</dt>
        <dd className="font-mono break-all">
          Authorization: {authHeader || "Basic base64(用户名:密码)"}
        </dd>
      </dl>
      <div className="grid gap-2 sm:grid-cols-2">
        <LabeledField label="用户名（仅用于在本地生成请求头）">
          <input
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            className={FIELD_CLASS}
          />
        </LabeledField>
        <LabeledField label="密码（不会发送到服务器）">
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className={FIELD_CLASS}
            autoComplete="off"
          />
        </LabeledField>
      </div>
      <p className="text-slate-500 dark:text-slate-400">
        同时在 CDN 上删除回源响应中的 <code className="font-mono">Set-Cookie</code>
        ，并对 <code className="font-mono">/f/</code> 设置较长的缓存时间（WebDAV
        通常不返回长缓存头）。
      </p>
    </div>
  )
}

function encodeBase64(value: string): string {
  const bytes = new TextEncoder().encode(value)
  let binary = ""
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary)
}
