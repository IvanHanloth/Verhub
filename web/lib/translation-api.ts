import { requestJson } from "@/lib/api-client"

/**
 * 上游协议。
 * - `openai`：`POST {base_url}/chat/completions`，各类中转、Ollama、vLLM 同格式
 * - `anthropic`：`POST {base_url}/v1/messages`
 */
export type TranslationProvider = "openai" | "anthropic"

/** 可翻译的内容类型，决定允许的字段。 */
export type TranslationKind = "announcement" | "project" | "version"

export type TranslationConfigView = {
  /** base_url 与 model 齐全即为 true；API Key 不是必需（自建服务常无鉴权）。 */
  configured: boolean
  /** 总闸。关闭时翻译端点一律 400，后台也不显示翻译按钮。 */
  enabled: boolean
  provider: TranslationProvider
  base_url: string | null
  model: string | null
  has_api_key: boolean
  /** 已存 Key 的 SHA-256 前 16 位，用于区分是否换过 Key。完整 Key 永不回读。 */
  api_key_fingerprint: string | null
  api_key_updated_at: number | null
  /** 关闭时忽略 system_prompt，使用内置提示词。 */
  custom_prompt: boolean
  system_prompt: string | null
  /** 内置提示词原文，用作「自定义提示词」编辑器的初值。 */
  builtin_system_prompt: string
  prompt_variables: string[]
  /** 按当前协议拼出的完整请求地址，供核对 base_url 的填法。 */
  request_url: string | null
  updated_at: number | null
}

export type UpdateTranslationConfigInput = {
  enabled?: boolean
  provider?: TranslationProvider
  base_url?: string
  /** 只写不读；空字符串表示清除。 */
  api_key?: string
  model?: string
  custom_prompt?: boolean
  system_prompt?: string
}

/** 测试连接的结果。上游失败也是 200，原因在 error 里。 */
export type TranslationTestResult = {
  ok: boolean
  provider: TranslationProvider
  model: string | null
  request_url: string | null
  sample: string | null
  latency_ms: number
  error: string | null
}

export type TranslateInput = {
  kind: TranslationKind
  target_locale: string
  source_locale?: string | null
  /** 待译字段，值为空的会被后端丢弃。 */
  fields: Record<string, string>
}

export type TranslationResult = {
  /** 命中的注册语言主标签，未必等于请求里的写法。 */
  locale: string
  provider: TranslationProvider
  model: string
  fields: Record<string, string>
}

export async function getTranslationConfig(
  token: string,
  signal?: AbortSignal,
): Promise<TranslationConfigView> {
  return requestJson<TranslationConfigView>("/admin/translation", { token, signal })
}

export async function updateTranslationConfig(
  token: string,
  input: UpdateTranslationConfigInput,
): Promise<TranslationConfigView> {
  return requestJson<TranslationConfigView>("/admin/translation", {
    method: "PUT",
    token,
    body: input,
  })
}

export async function clearTranslationConfig(token: string): Promise<TranslationConfigView> {
  return requestJson<TranslationConfigView>("/admin/translation", { method: "DELETE", token })
}

/** 用当前配置译一句样例。失败不抛异常，原因在 error 字段里。 */
export async function testTranslation(token: string): Promise<TranslationTestResult> {
  return requestJson<TranslationTestResult>("/admin/translation/test", { method: "POST", token })
}

/** 译文只回不入库，调用方拿它填草稿。 */
export async function translateContent(
  token: string,
  projectKey: string,
  input: TranslateInput,
  signal?: AbortSignal,
): Promise<TranslationResult> {
  return requestJson<TranslationResult>(`/admin/projects/${projectKey}/translate`, {
    method: "POST",
    token,
    body: input,
    signal,
  })
}
