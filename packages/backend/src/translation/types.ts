/** AI 翻译模块的共享类型与常量。 */

/**
 * 上游协议。两种覆盖了自部署场景下能拿到的绝大多数服务：
 * openai 兼容 `POST {baseUrl}/chat/completions`（含各类中转、Ollama、vLLM），
 * anthropic 走 `POST {baseUrl}/v1/messages`。
 */
export const TRANSLATION_PROVIDERS = ["openai", "anthropic"] as const

export type TranslationProvider = (typeof TRANSLATION_PROVIDERS)[number]

/** 各协议在 baseUrl 之后固定拼接的路径。baseUrl 只做去尾斜杠，不替管理员猜写法。 */
export const PROVIDER_PATHS: Record<TranslationProvider, string> = {
  openai: "/chat/completions",
  anthropic: "/v1/messages",
}

/** 可翻译的内容类型。决定允许的字段清单，以及提示词里对内容形态的说明。 */
export const TRANSLATION_KINDS = ["announcement", "project", "version"] as const

export type TranslationKind = (typeof TRANSLATION_KINDS)[number]

/**
 * 每种内容类型允许提交的字段。多余的 key 一律拒绝：请求体是后台表单拼的，
 * 放任未知字段等于把界面上的任意状态原样转发给上游。
 */
export const TRANSLATION_KIND_FIELDS: Record<TranslationKind, readonly string[]> = {
  announcement: ["title", "content"],
  project: ["name", "description"],
  version: ["title", "content"],
}

/**
 * 一次翻译请求里所有字段值加起来的字符数上限。
 *
 * 这**不是**入库校验——公告正文本身不限长度。它限的是往外发的付费请求：
 * 整本手册塞进去只会烧钱加超时，不如在这里说清楚哪一条太长。
 */
export const MAX_TRANSLATION_INPUT_CHARS = 32_000

/** 上游请求超时。翻译长正文比普通 API 慢得多，给足时间而不是让运营看到假失败。 */
export const TRANSLATION_TIMEOUT_MS = 60_000

/** 管理端可见的配置视图。API key 永不回读，只给指纹。 */
export type TranslationConfigView = {
  /** baseUrl 与 model 齐全即算配置完成；api key 不是必需（自建服务常常无鉴权）。 */
  configured: boolean
  /** 总闸。关掉时翻译端点一律拒绝，后台也不显示翻译按钮。 */
  enabled: boolean
  provider: TranslationProvider
  base_url: string | null
  model: string | null
  has_api_key: boolean
  api_key_fingerprint: string | null
  api_key_updated_at: number | null
  /** 关掉时忽略 system_prompt，一律用内置提示词。 */
  custom_prompt: boolean
  system_prompt: string | null
  /** 内置提示词原文，供管理端做「自定义提示词」输入框的初值与对照。 */
  builtin_system_prompt: string
  /** 提示词可用变量清单，UI 直接渲染，避免前端抄一份。 */
  prompt_variables: string[]
  /** 按当前 provider 与 base_url 拼出的完整请求地址，供管理员核对填法。 */
  request_url: string | null
  updated_at: number | null
}

/** 「测试连接」的结果。失败不抛异常，把原因带回给管理端展示。 */
export type TranslationTestResult = {
  ok: boolean
  provider: TranslationProvider
  model: string | null
  request_url: string | null
  /** 成功时是样例句子的译文，失败时为 null。 */
  sample: string | null
  latency_ms: number
  error: string | null
}

/** 翻译结果。fields 的键与请求一一对应。 */
export type TranslationResult = {
  /** 命中的注册语言主标签，未必等于请求里的写法。 */
  locale: string
  provider: TranslationProvider
  model: string
  fields: Record<string, string>
}
