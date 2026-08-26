"use client"

import * as React from "react"
import { AlertTriangle, FlaskConical, Languages, Loader2, Save, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@workspace/ui/components/button"

import { isAuthError } from "@/lib/api-client"
import { formatTimestamp } from "@/lib/format"
import { getErrorMessage } from "@/lib/error-utils"
import { useConfirm } from "@/components/common/confirm-dialog"
import { AdminCard } from "@/components/admin/admin-card"
import { AdminPageHeader } from "@/components/admin/admin-page-header"
import { LoadingLine } from "@/components/common/skeleton"
import { FeaturePanel, SectionHeading } from "@/components/common/feature-panel"
import {
  ApiKeyField,
  EMPTY_API_KEY_STATE,
  hasApiKeyChange,
  toApiKeyPayload,
  type ApiKeyState,
} from "@/components/common/api-key-field"
import {
  LabeledField,
  MONO_FIELD_CLASS,
  SegmentedButton,
  SegmentedGroup,
  StatusBadge,
  TextField,
} from "@/components/common/settings-fields"
import { getSessionToken } from "@/lib/auth-session"
import {
  clearTranslationConfig,
  getTranslationConfig,
  testTranslation,
  updateTranslationConfig,
  type TranslationConfigView,
  type TranslationProvider,
  type TranslationTestResult,
} from "@/lib/translation-api"

/**
 * 各协议的填法指导。放在数据里而不是散在 JSX 中，将来加第三种协议只需加一条记录，
 * 「每个协议都给出地址样例」这条规则不会被漏掉。
 */
const PROVIDER_GUIDES: Array<{
  key: TranslationProvider
  label: string
  /** base_url 之后固定拼接的路径，与后端 PROVIDER_PATHS 一致。 */
  path: string
  baseUrlPlaceholder: string
  apiKeyPlaceholder: string
  modelPlaceholder: string
  note: string
}> = [
  {
    key: "openai",
    label: "OpenAI 兼容",
    path: "/chat/completions",
    baseUrlPlaceholder: "https://api.openai.com/v1",
    apiKeyPlaceholder: "sk-...",
    modelPlaceholder: "gpt-4o-mini",
    note: "OpenAI、DeepSeek、通义千问、各类中转站，以及自建的 Ollama、vLLM、one-api 都是这个格式。自建服务通常无需鉴权，API Key 可以留空。",
  },
  {
    key: "anthropic",
    label: "Anthropic Messages",
    path: "/v1/messages",
    baseUrlPlaceholder: "https://api.anthropic.com",
    apiKeyPlaceholder: "sk-ant-...",
    modelPlaceholder: "claude-sonnet-4-5",
    note: "Anthropic 官方 API 的原生格式，鉴权走 x-api-key 头。",
  },
]

export default function TranslationSettingsPage() {
  const confirm = useConfirm()
  const [token, setToken] = React.useState(() => getSessionToken().trim())
  const [config, setConfig] = React.useState<TranslationConfigView | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [busy, setBusy] = React.useState(false)
  const [testing, setTesting] = React.useState(false)
  const [testResult, setTestResult] = React.useState<TranslationTestResult | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  const [enabled, setEnabled] = React.useState(false)
  const [provider, setProvider] = React.useState<TranslationProvider>("openai")
  const [baseUrl, setBaseUrl] = React.useState("")
  const [apiKey, setApiKey] = React.useState<ApiKeyState>(EMPTY_API_KEY_STATE)
  const [model, setModel] = React.useState("")
  const [customPrompt, setCustomPrompt] = React.useState(false)
  const [systemPrompt, setSystemPrompt] = React.useState("")

  const applyConfig = React.useCallback((view: TranslationConfigView) => {
    setConfig(view)
    setEnabled(view.enabled)
    setProvider(view.provider)
    setBaseUrl(view.base_url ?? "")
    setModel(view.model ?? "")
    setCustomPrompt(view.custom_prompt)
    setSystemPrompt(view.system_prompt ?? view.builtin_system_prompt)
    setApiKey(EMPTY_API_KEY_STATE)
  }, [])

  React.useEffect(() => {
    if (!token) {
      setLoading(false)
      setError("请先登录后再配置。")
      return
    }

    const controller = new AbortController()
    getTranslationConfig(token, controller.signal)
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

  const guide = PROVIDER_GUIDES.find((item) => item.key === provider) ?? PROVIDER_GUIDES[0]!
  // 表单里的地址实时拼给管理员看，不必存一次才知道最终请求打到哪。
  const requestUrl = baseUrl.trim() ? `${baseUrl.trim().replace(/\/+$/, "")}${guide.path}` : ""

  async function handleSave() {
    if (!token) {
      toast.error("请先登录后再操作。")
      return
    }

    setBusy(true)
    try {
      const view = await updateTranslationConfig(token, {
        enabled,
        provider,
        base_url: baseUrl.trim(),
        model: model.trim(),
        // Key 没动过就不回传，动过才写：空串表示清除。
        ...(hasApiKeyChange(apiKey) ? { api_key: toApiKeyPayload(apiKey) ?? "" } : {}),
        custom_prompt: customPrompt,
        // 关掉自定义时不回传提示词：留着库里的旧值，重新打开开关还能接着改。
        ...(customPrompt ? { system_prompt: systemPrompt } : {}),
      })
      applyConfig(view)
      setTestResult(null)
      toast.success("AI 翻译配置已保存。")
    } catch (saveError) {
      toast.error(getErrorMessage(saveError))
    } finally {
      setBusy(false)
    }
  }

  async function handleTest() {
    if (!token) {
      return
    }

    setTesting(true)
    setTestResult(null)
    try {
      const result = await testTranslation(token)
      setTestResult(result)
      if (result.ok) {
        toast.success(`连接正常，耗时 ${result.latency_ms} 毫秒。`)
      }
    } catch (testError) {
      toast.error(getErrorMessage(testError))
    } finally {
      setTesting(false)
    }
  }

  async function handleClear() {
    if (!token) {
      return
    }
    const confirmed = await confirm({
      title: "清空 AI 翻译配置",
      description: "将删除 API 地址、Key、模型与自定义提示词，并关闭总开关。确认继续？",
      confirmLabel: "清空",
      destructive: true,
    })
    if (!confirmed) {
      return
    }

    setBusy(true)
    try {
      applyConfig(await clearTranslationConfig(token))
      setTestResult(null)
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
        title="AI 翻译设置"
        description="配置后，公告与项目的译文编辑处会出现「AI 翻译」按钮，一键把默认内容译成当前语言。"
        badge="Verhub Settings"
        icon={Languages}
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
              icon={<Languages className="size-4" />}
              title="上游模型"
              description="Verhub 不内置任何厂商的凭据，请填写自己的 API 地址与 Key。译文只会填进后台的编辑框，不会自动保存。"
              actions={
                config.enabled && config.configured ? (
                  <StatusBadge tone="ok">已启用</StatusBadge>
                ) : config.configured ? (
                  <StatusBadge tone="warn">已配置，未启用</StatusBadge>
                ) : (
                  <StatusBadge tone="warn">未完成配置</StatusBadge>
                )
              }
            />

            <label className="inline-flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(event) => setEnabled(event.target.checked)}
                className="size-4"
              />
              <span className="text-slate-700 dark:text-slate-300">
                启用 AI 翻译（关闭后后台不再显示翻译按钮）
              </span>
            </label>

            <div className="grid gap-3 md:max-w-2xl">
              <LabeledField as="div" label="接口协议" hint={guide.note}>
                <SegmentedGroup className="flex flex-wrap">
                  {PROVIDER_GUIDES.map((item) => (
                    <SegmentedButton
                      key={item.key}
                      active={provider === item.key}
                      onClick={() => setProvider(item.key)}
                      label={item.label}
                    />
                  ))}
                </SegmentedGroup>
              </LabeledField>

              <TextField
                label="API 地址"
                value={baseUrl}
                onChange={setBaseUrl}
                placeholder={guide.baseUrlPlaceholder}
                maxLength={512}
                mono
                hint={
                  requestUrl ? (
                    <>
                      实际请求：<code className="font-mono">{requestUrl}</code>
                    </>
                  ) : (
                    <>
                      只填到路径前缀，后缀 <code className="font-mono">{guide.path}</code>{" "}
                      由系统拼接
                    </>
                  )
                }
              />

              <ApiKeyField
                label="API Key"
                description="加密存储，保存后不再回读，只显示指纹。上游无需鉴权时可以留空。"
                fingerprint={config.api_key_fingerprint}
                configured={config.has_api_key}
                placeholder={guide.apiKeyPlaceholder}
                state={apiKey}
                onStateChange={setApiKey}
              />

              <TextField
                label="模型"
                value={model}
                onChange={setModel}
                placeholder={guide.modelPlaceholder}
                maxLength={128}
                mono
                hint={
                  config.api_key_updated_at
                    ? `Key 更新于 ${formatTimestamp(config.api_key_updated_at)}`
                    : undefined
                }
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
                  <>
                    <p className="mb-1 font-medium">
                      连接正常（{testResult.model}，{testResult.latency_ms} 毫秒）
                    </p>
                    <p>样例译文：{testResult.sample}</p>
                  </>
                ) : (
                  <>
                    <p className="mb-1 font-medium">连接失败</p>
                    <p className="break-all">{testResult.error}</p>
                  </>
                )}
              </div>
            ) : null}
          </AdminCard>

          <AdminCard as="section" className="space-y-4">
            <SectionHeading
              title="提示词"
              description="内置提示词已经要求模型保留 Markdown 结构与占位符、只输出 JSON。除非有特殊的术语或语气要求，一般不需要改。"
            />

            <FeaturePanel
              title="使用自定义提示词"
              description="关闭时一律使用内置提示词；改坏了关掉开关即可回到内置文案，不必逐字删回去。"
              checked={customPrompt}
              onCheckedChange={setCustomPrompt}
            >
              <LabeledField
                label="系统提示词"
                hint={
                  <>
                    可用变量：
                    {config.prompt_variables.map((name) => (
                      <code key={name} className="mr-1.5 font-mono">{`{{${name}}}`}</code>
                    ))}
                    。必须保留「只输出 JSON 对象」这条要求，否则服务端解析不了回包。
                  </>
                }
              >
                <textarea
                  value={systemPrompt}
                  onChange={(event) => setSystemPrompt(event.target.value)}
                  rows={14}
                  className={MONO_FIELD_CLASS}
                />
              </LabeledField>

              <Button
                type="button"
                variant="outline"
                onClick={() => setSystemPrompt(config.builtin_system_prompt)}
              >
                恢复内置提示词
              </Button>
            </FeaturePanel>
          </AdminCard>

          {/* 两张卡片是同一份配置，操作条只有一条：分别放按钮会让人以为各存各的。 */}
          <AdminCard as="section" className="flex flex-wrap items-center gap-2">
            <Button type="button" onClick={() => void handleSave()} disabled={busy}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
              保存配置
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => void handleTest()}
              disabled={testing || busy || !config.configured}
              title={config.configured ? undefined : "先填写 API 地址与模型并保存"}
            >
              {testing ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <FlaskConical className="size-4" />
              )}
              测试连接
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => void handleClear()}
              disabled={busy}
            >
              <Trash2 className="size-4" />
              清空配置
            </Button>
            {config.updated_at ? (
              <span className="ml-auto text-xs text-slate-500 dark:text-slate-400">
                更新于 {formatTimestamp(config.updated_at)}
              </span>
            ) : null}
          </AdminCard>
        </>
      ) : null}
    </section>
  )
}
