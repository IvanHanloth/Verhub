"use client"

import * as React from "react"
import { AlertTriangle, Github, Loader2, Save, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@workspace/ui/components/button"

import { isAuthError, resolveApiUrl } from "@/lib/api-client"
import { formatTimestamp } from "@/lib/format"
import { getErrorMessage } from "@/lib/error-utils"
import { useConfirm } from "@/components/common/confirm-dialog"
import { AdminCard } from "@/components/admin/admin-card"
import { AdminPageHeader } from "@/components/admin/admin-page-header"
import { LoadingLine } from "@/components/common/skeleton"
import { FeaturePanel, SectionHeading } from "@/components/common/feature-panel"
import { IssueTemplateEditor } from "@/components/github/issue-template-editor"
import {
  CopyableUrl,
  LabeledField,
  MONO_FIELD_CLASS,
  StatusBadge,
  TextField,
} from "@/components/common/settings-fields"
import {
  EMPTY_SECRET_STATE,
  hasSecretChange,
  WebhookSecretField,
  type WebhookSecretState,
} from "@/components/github/webhook-secret-field"
import { getSessionToken } from "@/lib/auth-session"
import {
  clearGithubAppConfig,
  getGithubAppConfig,
  updateGithubAppConfig,
  type GithubAppConfigView,
  type GithubAppFeature,
} from "@/lib/github-app-api"

/**
 * 每个功能所需的 GitHub App 权限指导。放在数据里而不是散在 JSX 中，
 * 新功能加一条记录即可，保证「配置界面对每个功能给出明确权限指导」这条规则不被漏掉。
 */
const FEATURE_GUIDES: Array<{
  key: GithubAppFeature
  label: string
  description: string
  permissions: string[]
}> = [
  {
    key: "feedback_issue",
    label: "反馈转发 GitHub Issue",
    description:
      "允许把客户端提交的反馈转成 Issue。启用后还需到「项目管理 → GitHub 集成」为具体项目开放。",
    permissions: [
      "Repository permissions → Issues：Read and write（创建 Issue）",
      "Repository permissions → Contents：Read-only（项目模板来源选「仓库文件」时需要）",
      "Repository permissions → Metadata：Read-only（GitHub 自动要求）",
      "将 App 安装（Install）到目标仓库",
    ],
  },
  {
    key: "comment_commands",
    label: "评论命令触发工作流",
    description: `在 Issue / PR 评论首行输入 /verhub-<命令> <参数> 触发指定 workflow_dispatch，参数作为 workflow input 传入。命令与可触发来源在项目级配置。`,
    permissions: [
      "Repository permissions → Actions：Read and write（触发 workflow_dispatch）",
      "Subscribe to events：勾选 Issue comment",
      "在 App 设置中填写下方 Webhook URL 与 webhook secret",
      "将 App 安装（Install）到目标仓库",
    ],
  },
]

export default function GithubAppSettingsPage() {
  const confirm = useConfirm()
  const [token, setToken] = React.useState(() => getSessionToken().trim())
  const [config, setConfig] = React.useState<GithubAppConfigView | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const [appId, setAppId] = React.useState("")
  const [privateKey, setPrivateKey] = React.useState("")
  const [webhookSecret, setWebhookSecret] = React.useState<WebhookSecretState>(EMPTY_SECRET_STATE)
  const [features, setFeatures] = React.useState<GithubAppFeature[]>([])
  const [customTemplate, setCustomTemplate] = React.useState(false)
  const [titleTemplate, setTitleTemplate] = React.useState("")
  const [bodyTemplate, setBodyTemplate] = React.useState("")

  const applyConfig = React.useCallback((view: GithubAppConfigView) => {
    setConfig(view)
    setAppId(view.app_id ?? "")
    setFeatures(view.enabled_features)
    setCustomTemplate(view.feedback_issue_custom_template)
    setTitleTemplate(
      view.feedback_issue_title_template ?? view.builtin_feedback_issue_title_template,
    )
    setBodyTemplate(view.feedback_issue_body_template ?? view.builtin_feedback_issue_body_template)
    setPrivateKey("")
    setWebhookSecret(EMPTY_SECRET_STATE)
  }, [])

  React.useEffect(() => {
    if (!token) {
      setLoading(false)
      setError("请先登录后再配置。")
      return
    }

    const controller = new AbortController()
    getGithubAppConfig(token, controller.signal)
      .then((view) => applyConfig(view))
      .catch((loadError: unknown) => {
        if (controller.signal.aborted) {
          return
        }
        if (isAuthError(loadError)) {
          setToken("")
        }
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
  }, [token, applyConfig])

  const webhookUrl = config ? resolveApiUrl(config.webhook_payload_path) : ""

  function toggleFeature(feature: GithubAppFeature, enabled: boolean) {
    setFeatures((prev) =>
      enabled ? [...new Set([...prev, feature])] : prev.filter((item) => item !== feature),
    )
  }

  async function handleSave() {
    if (!token) {
      toast.error("请先登录后再操作。")
      return
    }

    setBusy(true)
    try {
      const view = await updateGithubAppConfig(token, {
        app_id: appId.trim(),
        // 留空表示"不改动"，与清除区分开 —— 清除机密走下面的按钮。
        ...(privateKey.trim() ? { private_key: privateKey.trim() } : {}),
        // secret 没动过就不回传，动过才写：空串表示清除。
        ...(hasSecretChange(webhookSecret) ? { webhook_secret: webhookSecret.draft.trim() } : {}),
        enabled_features: features,
        feedback_issue_custom_template: customTemplate,
        // 关掉自定义时不回传模板：留着库里的旧值，重新打开开关还能接着改。
        ...(customTemplate
          ? {
              feedback_issue_title_template: titleTemplate,
              feedback_issue_body_template: bodyTemplate,
            }
          : {}),
      })
      applyConfig(view)
      toast.success("GitHub App 配置已保存。")
    } catch (saveError) {
      toast.error(getErrorMessage(saveError))
    } finally {
      setBusy(false)
    }
  }

  async function handleClear() {
    if (!token) {
      return
    }
    const confirmed = await confirm({
      title: "清空 GitHub App 配置",
      description:
        "将删除 App 凭据、webhook secret、功能开关与模板，所有项目的 GitHub App 相关功能会立即失效。确认继续？",
      confirmLabel: "清空",
      destructive: true,
    })
    if (!confirmed) {
      return
    }

    setBusy(true)
    try {
      applyConfig(await clearGithubAppConfig(token))
      toast.success("配置已清空。")
    } catch (clearError) {
      toast.error(getErrorMessage(clearError))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="space-y-5">
      <AdminPageHeader
        title="GitHub APP 设置"
        description="接入 GitHub App 后可启用反馈转发 Issue、评论命令触发工作流等功能。"
        badge="Verhub Settings"
        icon={Github}
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

      {!loading && config ? (
        <>
          <AdminCard as="section" className="space-y-4">
            <SectionHeading
              icon={<Github className="size-4" />}
              title="App 凭据"
              description="在 GitHub → Settings → Developer settings → GitHub Apps 中创建 App 后，把 App ID 与生成的私钥填到这里。"
              actions={
                config.configured ? (
                  <StatusBadge tone="ok">已配置</StatusBadge>
                ) : (
                  <StatusBadge tone="warn">未完成配置</StatusBadge>
                )
              }
            />

            <p className="text-xs text-slate-600 dark:text-slate-400">
              {config.configured
                ? `私钥指纹 ${config.private_key_fingerprint}，更新于 ${formatTimestamp(config.private_key_updated_at)}`
                : ""}
            </p>

            <div className="grid gap-3 md:max-w-2xl">
              <TextField
                label="App ID"
                value={appId}
                onChange={setAppId}
                placeholder="例如：123456"
                maxLength={32}
              />

              <LabeledField
                label={`私钥（PEM，${config.has_private_key ? "已配置，粘贴新值可替换" : "未配置"}）`}
              >
                <textarea
                  value={privateKey}
                  onChange={(event) => setPrivateKey(event.target.value)}
                  placeholder="-----BEGIN RSA PRIVATE KEY-----"
                  rows={5}
                  className={MONO_FIELD_CLASS}
                />
              </LabeledField>

              <WebhookSecretField
                label="Webhook secret（评论命令功能必需）"
                hint={config.webhook_secret_hint}
                length={config.webhook_secret_length}
                configured={config.has_webhook_secret}
                state={webhookSecret}
                onStateChange={setWebhookSecret}
              />

              <CopyableUrl
                label="Webhook URL（填入 GitHub App 设置）"
                url={webhookUrl}
                copiedMessage="Webhook URL 已复制。"
              />
            </div>
          </AdminCard>

          <AdminCard as="section" className="space-y-4">
            <SectionHeading
              title="启用功能"
              description="功能先在这里启用，才能在「项目管理 → GitHub 集成」里为具体项目打开对应开关。请确保Github APP具备相应的权限。"
            />

            <div className="space-y-3">
              {FEATURE_GUIDES.map((guide) => (
                <FeaturePanel
                  key={guide.key}
                  title={guide.label}
                  description={guide.description}
                  checked={features.includes(guide.key)}
                  onCheckedChange={(checked) => toggleFeature(guide.key, checked)}
                >
                  <div className="rounded-lg border border-sky-500/25 bg-sky-500/10 p-3 text-xs text-slate-700 dark:text-slate-300">
                    <p className="mb-1 font-medium">所需 GitHub App 权限与设置：</p>
                    <ul className="list-disc space-y-0.5 pl-4">
                      {guide.permissions.map((permission) => (
                        <li key={permission}>{permission}</li>
                      ))}
                    </ul>
                  </div>
                </FeaturePanel>
              ))}
            </div>
          </AdminCard>

          <AdminCard as="section" className="space-y-4">
            <SectionHeading
              title="反馈转发模板（实例级）"
              description="项目未指定自己的模板时使用这里的模板"
            />

            <FeaturePanel
              title="自定义模板"
              description="关闭时使用内置模板"
              checked={customTemplate}
              onCheckedChange={setCustomTemplate}
            >
              <IssueTemplateEditor
                titleTemplate={titleTemplate}
                bodyTemplate={bodyTemplate}
                onTitleChange={setTitleTemplate}
                onBodyChange={setBodyTemplate}
                variables={config.feedback_issue_template_variables}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setTitleTemplate(config.builtin_feedback_issue_title_template)
                  setBodyTemplate(config.builtin_feedback_issue_body_template)
                }}
              >
                恢复内置模板内容
              </Button>
            </FeaturePanel>
          </AdminCard>

          <div className="flex flex-wrap gap-2">
            <Button type="button" disabled={busy || !token} onClick={() => void handleSave()}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
              保存配置
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={busy || !token}
              onClick={() => void handleClear()}
            >
              <Trash2 className="size-4" />
              清空配置
            </Button>
          </div>
        </>
      ) : null}
    </section>
  )
}
