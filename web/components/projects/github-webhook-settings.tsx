"use client"

import * as React from "react"
import { Copy, KeyRound, Loader2, RefreshCcw, Save, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@workspace/ui/components/button"

import { API_BASE_URL } from "@/lib/api-client"
import { getErrorMessage } from "@/lib/error-utils"
import { useConfirm } from "@/components/common/confirm-dialog"
import {
  clearGithubWebhookSecret,
  getGithubWebhookSettings,
  regenerateGithubWebhookSecret,
  setGithubWebhookSecret,
  type GithubWebhookSettings as WebhookSettings,
} from "@/lib/projects-api"

const MIN_SECRET_LENGTH = 16

/**
 * `payload_path` is absolute-from-root, so it resolves against the backend
 * origin when the API is deployed separately and against the current origin
 * otherwise — which is exactly the URL that has to go into GitHub's form.
 */
function resolveWebhookUrl(payloadPath: string): string {
  if (typeof window === "undefined") {
    return payloadPath
  }

  const base = API_BASE_URL.startsWith("http") ? API_BASE_URL : window.location.origin
  return new URL(payloadPath, base).toString()
}

function formatTimestamp(seconds: number | null): string {
  if (!seconds) {
    return "从未设置"
  }
  return new Date(seconds * 1000).toLocaleString()
}

async function copyToClipboard(value: string, successMessage: string) {
  try {
    await navigator.clipboard.writeText(value)
    toast.success(successMessage)
  } catch {
    toast.error("复制失败，请手动选中复制。")
  }
}

export function GithubWebhookSettings({
  token,
  projectKey,
}: {
  token: string
  projectKey: string | null
}) {
  const confirm = useConfirm()
  const [settings, setSettings] = React.useState<WebhookSettings | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [manualSecret, setManualSecret] = React.useState("")
  // Held only until the dialog closes: the API never returns it again.
  const [revealedSecret, setRevealedSecret] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!token || !projectKey) {
      setSettings(null)
      return
    }

    const controller = new AbortController()
    setLoading(true)
    setError(null)
    setRevealedSecret(null)
    setManualSecret("")

    getGithubWebhookSettings(token, projectKey, controller.signal)
      .then((result) => setSettings(result))
      .catch((loadError: unknown) => {
        if (controller.signal.aborted) {
          return
        }
        setSettings(null)
        setError(getErrorMessage(loadError))
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false)
        }
      })

    return () => {
      controller.abort()
    }
  }, [token, projectKey])

  async function runMutation(action: () => Promise<WebhookSettings>, successMessage: string) {
    if (!token || !projectKey) {
      return
    }

    setBusy(true)
    try {
      const result = await action()
      setSettings(result)
      setRevealedSecret("secret" in result ? (result as { secret: string }).secret : null)
      toast.success(successMessage)
    } catch (mutationError) {
      toast.error(getErrorMessage(mutationError))
    } finally {
      setBusy(false)
    }
  }

  if (!projectKey) {
    return null
  }

  const webhookUrl = settings ? resolveWebhookUrl(settings.payload_path) : ""
  const manualSecretTooShort =
    manualSecret.trim().length > 0 && manualSecret.trim().length < MIN_SECRET_LENGTH

  return (
    <section className="space-y-3 rounded-xl border border-slate-900/15 bg-slate-50/60 p-4 dark:border-white/15 dark:bg-white/5">
      <header className="space-y-1">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <KeyRound className="size-4" />
          GitHub Release Webhook
        </h3>
        <p className="text-xs text-slate-600 dark:text-slate-400">
          在 GitHub 仓库的 Settings → Webhooks 里添加下面的地址，Content type 选
          <code className="mx-1">application/json</code>，事件勾选 Releases。 发布或编辑 Release
          后版本信息会自动同步，版本号已存在时按 GitHub 内容覆盖。
        </p>
      </header>

      {loading ? (
        <p className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
          <Loader2 className="size-3.5 animate-spin" />
          正在读取 Webhook 配置...
        </p>
      ) : null}

      {error ? <p className="text-xs text-rose-500">{error}</p> : null}

      {settings ? (
        <div className="space-y-3">
          <div className="space-y-1">
            <span className="text-xs text-slate-600 dark:text-slate-400">Payload URL</span>
            <div className="flex items-center gap-2">
              <code className="flex-1 truncate rounded-lg border border-slate-900/15 bg-white/70 px-2 py-1.5 text-xs dark:border-white/15 dark:bg-white/10">
                {webhookUrl}
              </code>
              <Button
                type="button"
                variant="outline"
                onClick={() => void copyToClipboard(webhookUrl, "Payload URL 已复制。")}
              >
                <Copy className="size-4" />
                复制
              </Button>
            </div>
          </div>

          <p className="text-xs text-slate-600 dark:text-slate-400">
            状态：
            {settings.enabled ? (
              <span className="text-emerald-600 dark:text-emerald-300">
                已启用（secret 末四位 {settings.secret_hint}，更新于{" "}
                {formatTimestamp(settings.secret_updated_at)}）
              </span>
            ) : (
              <span className="text-amber-600 dark:text-amber-300">
                未配置 secret，所有推送都会被拒绝
              </span>
            )}
          </p>

          {revealedSecret ? (
            <div className="space-y-1 rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3">
              <p className="text-xs font-medium text-emerald-700 dark:text-emerald-300">
                请立即复制并填入 GitHub，关闭弹窗后无法再次查看：
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 truncate rounded-lg bg-white/70 px-2 py-1.5 text-xs dark:bg-white/10">
                  {revealedSecret}
                </code>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void copyToClipboard(revealedSecret, "Secret 已复制。")}
                >
                  <Copy className="size-4" />
                  复制
                </Button>
              </div>
            </div>
          ) : null}

          <div className="space-y-1">
            <span className="text-xs text-slate-600 dark:text-slate-400">
              手动填写 secret（用于仓库上已配置好 webhook 的场景）
            </span>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={manualSecret}
                onChange={(event) => setManualSecret(event.target.value)}
                placeholder={`至少 ${MIN_SECRET_LENGTH} 个字符`}
                maxLength={256}
                className="w-full rounded-xl border border-slate-900/20 bg-white/80 px-3 py-2 text-sm dark:border-white/20 dark:bg-white/10"
              />
              <Button
                type="button"
                variant="outline"
                disabled={busy || manualSecret.trim().length < MIN_SECRET_LENGTH}
                onClick={() =>
                  void runMutation(
                    () => setGithubWebhookSecret(token, projectKey, manualSecret.trim()),
                    "Secret 已保存。",
                  ).then(() => setManualSecret(""))
                }
              >
                <Save className="size-4" />
                保存
              </Button>
            </div>
            {manualSecretTooShort ? (
              <p className="text-xs text-rose-500">secret 至少需要 {MIN_SECRET_LENGTH} 个字符。</p>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() =>
                void runMutation(
                  () => regenerateGithubWebhookSecret(token, projectKey),
                  "已生成新的 secret，请同步更新 GitHub。",
                )
              }
            >
              {busy ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <RefreshCcw className="size-4" />
              )}
              重新生成 Secret
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={busy || !settings.enabled}
              onClick={() => {
                void (async () => {
                  const confirmed = await confirm({
                    title: "清除 Webhook Secret",
                    description: "清除后该项目将不再接收 GitHub Release 推送，确认继续？",
                    confirmLabel: "清除",
                    destructive: true,
                  })
                  if (!confirmed) {
                    return
                  }
                  void runMutation(
                    () => clearGithubWebhookSecret(token, projectKey),
                    "Secret 已清除，Webhook 已停用。",
                  )
                })()
              }}
            >
              <Trash2 className="size-4" />
              清除 Secret
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  )
}
