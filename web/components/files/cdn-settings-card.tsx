"use client"

import * as React from "react"
import { CloudCog, FlaskConical, Loader2, Save, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@workspace/ui/components/button"

import { AdminCard } from "@/components/admin/admin-card"
import {
  ApiKeyField,
  EMPTY_API_KEY_STATE,
  hasApiKeyChange,
  toApiKeyPayload,
  type ApiKeyState,
} from "@/components/common/api-key-field"
import { useConfirm } from "@/components/common/confirm-dialog"
import { SectionHeading } from "@/components/common/feature-panel"
import { StatusBadge, TextField } from "@/components/common/settings-fields"
import { getErrorMessage } from "@/lib/error-utils"
import {
  clearCdnConfig,
  getCdnConfig,
  testCdnConfig,
  updateCdnConfig,
  type CdnConfigView,
  type CdnTestResult,
} from "@/lib/files-api"
import { formatTimestamp } from "@/lib/format"

/** 存储设置页的「CDN 缓存刷新」卡片，目前只支持阿里云 CDN。 */
export function CdnSettingsCard({ token }: { token: string }) {
  const confirm = useConfirm()
  const [config, setConfig] = React.useState<CdnConfigView | null>(null)
  const [enabled, setEnabled] = React.useState(false)
  const [accessKeyId, setAccessKeyId] = React.useState("")
  const [secret, setSecret] = React.useState<ApiKeyState>(EMPTY_API_KEY_STATE)
  const [busy, setBusy] = React.useState(false)
  const [testing, setTesting] = React.useState(false)
  const [testResult, setTestResult] = React.useState<CdnTestResult | null>(null)

  const apply = React.useCallback((view: CdnConfigView) => {
    setConfig(view)
    setEnabled(view.enabled)
    setAccessKeyId(view.access_key_id ?? "")
    setSecret(EMPTY_API_KEY_STATE)
  }, [])

  React.useEffect(() => {
    if (!token) {
      return
    }
    const controller = new AbortController()
    getCdnConfig(token, controller.signal)
      .then(apply)
      .catch((loadError: unknown) => {
        if (!controller.signal.aborted) {
          toast.error(getErrorMessage(loadError))
        }
      })
    return () => controller.abort()
  }, [token, apply])

  async function handleSave() {
    setBusy(true)
    try {
      apply(
        await updateCdnConfig(token, {
          enabled,
          access_key_id: accessKeyId.trim(),
          ...(hasApiKeyChange(secret) ? { access_key_secret: toApiKeyPayload(secret) ?? "" } : {}),
        }),
      )
      setTestResult(null)
      toast.success("CDN 刷新配置已保存。")
    } catch (saveError) {
      toast.error(getErrorMessage(saveError))
    } finally {
      setBusy(false)
    }
  }

  async function handleTest() {
    setTesting(true)
    setTestResult(null)
    try {
      const result = await testCdnConfig(token)
      setTestResult(result)
      if (result.ok) {
        toast.success(`凭据可用，今日剩余 ${result.url_remain} 次 URL 刷新。`)
      }
    } catch (testError) {
      toast.error(getErrorMessage(testError))
    } finally {
      setTesting(false)
    }
  }

  async function handleClear() {
    const confirmed = await confirm({
      title: "清空 CDN 刷新配置",
      description: "将删除 AccessKey 并关闭 CDN 刷新。确认继续？",
      confirmLabel: "清空",
      destructive: true,
    })
    if (!confirmed) {
      return
    }
    setBusy(true)
    try {
      apply(await clearCdnConfig(token))
      setTestResult(null)
      toast.success("配置已清空。")
    } catch (clearError) {
      toast.error(getErrorMessage(clearError))
    } finally {
      setBusy(false)
    }
  }

  if (!config) {
    return null
  }

  return (
    <AdminCard as="section" className="space-y-4">
      <SectionHeading
        icon={<CloudCog className="size-4" />}
        title="CDN 缓存刷新（阿里云）"
        description="启用后删除文件会自动刷新该直链在 CDN 上的缓存，文件列表中也可手动刷新。"
        actions={
          config.enabled && config.configured ? (
            <StatusBadge tone="ok">已启用</StatusBadge>
          ) : config.configured ? (
            <StatusBadge tone="warn">已配置，未启用</StatusBadge>
          ) : (
            <StatusBadge tone="warn">未配置</StatusBadge>
          )
        }
      />

      {!config.dist_base_url ? (
        <p className="text-sm text-amber-700 dark:text-amber-200">
          未配置分发域名，刷新无从提交：请先设置 VERHUB_DIST_BASE_URL。
        </p>
      ) : null}

      <label className="inline-flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(event) => setEnabled(event.target.checked)}
          className="size-4"
        />
        <span className="text-slate-700 dark:text-slate-300">启用 CDN 缓存刷新</span>
      </label>

      <div className="grid gap-3 md:max-w-2xl">
        <TextField
          label="AccessKey ID"
          value={accessKeyId}
          onChange={setAccessKeyId}
          placeholder="LTAI..."
          maxLength={128}
          mono
          hint="建议为 RAM 用户单独创建 AccessKey，只授予 cdn:RefreshObjectCaches 与 cdn:DescribeRefreshQuota 权限。"
        />
        <ApiKeyField
          label="AccessKey Secret"
          description="加密存储，保存后不再回读，只显示指纹。"
          fingerprint={config.access_key_secret_fingerprint}
          configured={config.has_access_key_secret}
          placeholder="AccessKey Secret"
          state={secret}
          onStateChange={setSecret}
        />
      </div>

      {testResult ? (
        <div
          className={`rounded-lg border p-3 text-xs ${
            testResult.ok
              ? "border-emerald-500/30 bg-emerald-500/10 text-slate-700 dark:text-slate-300"
              : "border-rose-500/30 bg-rose-500/10 text-slate-700 dark:text-slate-300"
          }`}
        >
          {testResult.ok ? (
            <p>
              凭据可用（{testResult.latency_ms} 毫秒），今日 URL 刷新余量 {testResult.url_remain} /{" "}
              {testResult.url_quota}。
            </p>
          ) : (
            <p className="break-all">测试失败：{testResult.error}</p>
          )}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" onClick={() => void handleSave()} disabled={busy}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          保存
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => void handleTest()}
          disabled={testing || busy || !config.configured}
          title={config.configured ? undefined : "先填写 AccessKey 并保存"}
        >
          {testing ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <FlaskConical className="size-4" />
          )}
          测试凭据
        </Button>
        <Button type="button" variant="outline" onClick={() => void handleClear()} disabled={busy}>
          <Trash2 className="size-4" />
          清空
        </Button>
        {config.updated_at ? (
          <span className="ml-auto text-xs text-slate-500 dark:text-slate-400">
            更新于 {formatTimestamp(config.updated_at)}
          </span>
        ) : null}
      </div>
    </AdminCard>
  )
}
