/**
 * 上游模型的协议适配：组装请求、取出回包里的文本、把失败归一成可读的错误。
 *
 * 两种协议的差别只在鉴权头、请求体形状和取文本的路径，其余（超时、错误处理、
 * 降级重试）共用一条路径，免得两边各写一遍后行为悄悄分叉。
 */

import { Logger, ServiceUnavailableException } from "@nestjs/common"

import { PROVIDER_PATHS, TRANSLATION_TIMEOUT_MS, type TranslationProvider } from "./types"

const logger = new Logger("TranslationProvider")

/**
 * anthropic 必须显式给 max_tokens。按输入字符数估算（中文近似 1 字符 1 token，
 * 英文更省），再夹在一个区间里：太小会把长正文的译文截断，太大则老模型直接拒收。
 */
const MIN_MAX_TOKENS = 4096
const MAX_MAX_TOKENS = 32_000

/** 上游因参数不被支持而 400 时，用这个保守值重试一次。 */
const FALLBACK_MAX_TOKENS = 4096

/** 回包片段带进错误信息的长度。够判断是地址填错还是模型不听话，又不至于刷屏。 */
const ERROR_DETAIL_LENGTH = 300

export type ProviderRequest = {
  provider: TranslationProvider
  baseUrl: string
  /** 自建服务常常无鉴权，null 即请求不带鉴权头。 */
  apiKey: string | null
  model: string
  systemPrompt: string
  userMessage: string
}

/** baseUrl 去尾斜杠后拼上协议的固定后缀。 */
export function resolveRequestUrl(provider: TranslationProvider, baseUrl: string): string {
  return `${baseUrl.trim().replace(/\/+$/, "")}${PROVIDER_PATHS[provider]}`
}

/**
 * 调一次上游，返回模型输出的原始文本（JSON 解析交给调用方）。
 *
 * 首次请求带上「让模型规矩输出」的可选参数（openai 的 response_format、
 * anthropic 按输入估的 max_tokens）；上游以 400 拒收时去掉/收窄这些参数重试一次 ——
 * 大量 OpenAI 兼容中转不认 response_format，老 anthropic 模型也不接受大 max_tokens。
 * 400 之外的失败不重试：那是地址、凭据或额度的问题，重试只是多等一轮。
 */
export async function callTranslationProvider(request: ProviderRequest): Promise<string> {
  const url = resolveRequestUrl(request.provider, request.baseUrl)

  const first = await postJson(url, request, buildBody(request, false))
  if (first.ok) {
    return extractText(request.provider, first.payload, url)
  }

  if (first.status !== 400) {
    throw upstreamError(url, first.status, first.detail)
  }

  logger.warn(`[translation] ${url} -> 400，去掉可选参数重试：${first.detail}`)
  const second = await postJson(url, request, buildBody(request, true))
  if (!second.ok) {
    throw upstreamError(url, second.status, second.detail)
  }

  return extractText(request.provider, second.payload, url)
}

type PostResult =
  | { ok: true; payload: unknown }
  | { ok: false; status: number | null; detail: string }

async function postJson(
  url: string,
  request: ProviderRequest,
  body: Record<string, unknown>,
): Promise<PostResult> {
  let response: Response

  try {
    response = await fetch(url, {
      method: "POST",
      headers: buildHeaders(request),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TRANSLATION_TIMEOUT_MS),
    })
  } catch (error) {
    // 连不上、DNS 解析不了、超时都落在这里，状态码无从谈起。
    return { ok: false, status: null, detail: describeFetchError(error) }
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => "")
    return { ok: false, status: response.status, detail: truncate(detail, ERROR_DETAIL_LENGTH) }
  }

  const payload = await response.json().catch(() => null)
  if (payload === null) {
    return { ok: false, status: response.status, detail: "上游返回的不是 JSON" }
  }

  return { ok: true, payload }
}

function buildHeaders(request: ProviderRequest): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" }

  if (request.provider === "anthropic") {
    headers["anthropic-version"] = "2023-06-01"
    if (request.apiKey) {
      headers["x-api-key"] = request.apiKey
    }
    return headers
  }

  if (request.apiKey) {
    headers.Authorization = `Bearer ${request.apiKey}`
  }
  return headers
}

/** conservative=true 时去掉上游可能不支持的可选参数。 */
function buildBody(request: ProviderRequest, conservative: boolean): Record<string, unknown> {
  if (request.provider === "anthropic") {
    return {
      model: request.model,
      max_tokens: conservative ? FALLBACK_MAX_TOKENS : estimateMaxTokens(request.userMessage),
      system: request.systemPrompt,
      messages: [{ role: "user", content: request.userMessage }],
    }
  }

  return {
    model: request.model,
    // 翻译要的是稳定复现，不是发挥。
    temperature: 0.2,
    messages: [
      { role: "system", content: request.systemPrompt },
      { role: "user", content: request.userMessage },
    ],
    ...(conservative ? {} : { response_format: { type: "json_object" } }),
  }
}

function estimateMaxTokens(userMessage: string): number {
  return Math.min(MAX_MAX_TOKENS, Math.max(MIN_MAX_TOKENS, userMessage.length))
}

/** 从两种回包形状里取出模型输出的文本。取不到即视为上游不兼容。 */
function extractText(provider: TranslationProvider, payload: unknown, url: string): string {
  const text = provider === "anthropic" ? readAnthropicText(payload) : readOpenAiText(payload)

  if (!text?.trim()) {
    throw new ServiceUnavailableException(`${url} 的响应里没有可用的文本，请确认协议与地址是否匹配`)
  }

  return text
}

function readOpenAiText(payload: unknown): string | null {
  const choices = asRecord(payload)?.choices
  if (!Array.isArray(choices)) {
    return null
  }

  const content = asRecord(asRecord(choices[0])?.message)?.content
  return typeof content === "string" ? content : null
}

function readAnthropicText(payload: unknown): string | null {
  const blocks = asRecord(payload)?.content
  if (!Array.isArray(blocks)) {
    return null
  }

  // 开了扩展思考的模型会先回若干 thinking 块，取的是全部 text 块而不是第一个块。
  const texts = blocks
    .map((block) => asRecord(block))
    .filter((block) => block?.type === "text")
    .map((block) => block?.text)
    .filter((text): text is string => typeof text === "string")

  return texts.length > 0 ? texts.join("") : null
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null
}

function upstreamError(url: string, status: number | null, detail: string): Error {
  const prefix = status === null ? `请求 ${url} 失败` : `${url} 返回 ${status}`
  return new ServiceUnavailableException(detail ? `${prefix}：${detail}` : prefix)
}

function describeFetchError(error: unknown): string {
  if (error instanceof Error) {
    return error.name === "TimeoutError"
      ? `上游 ${TRANSLATION_TIMEOUT_MS / 1000} 秒内没有响应`
      : error.message
  }
  return "未知错误"
}

function truncate(value: string, max: number): string {
  const collapsed = value.replace(/\s+/g, " ").trim()
  return collapsed.length <= max ? collapsed : `${collapsed.slice(0, max)}…`
}
