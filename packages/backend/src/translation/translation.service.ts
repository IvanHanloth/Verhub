import { BadGatewayException, BadRequestException, Injectable } from "@nestjs/common"

import { PrismaService } from "../database/prisma.service"
import { ProjectResolverService } from "../database/project-resolver.service"
import { matchRegisteredLocale } from "../common/locale"
import { renderTemplate } from "../common/template"
import { TranslateDto } from "./dto/translate.dto"
import { TranslationConfigService } from "./translation-config.service"
import { buildUserMessage, TRANSLATION_TEST_SAMPLE } from "./translation-prompt"
import { callTranslationProvider, resolveRequestUrl } from "./translation-provider"
import {
  MAX_TRANSLATION_INPUT_CHARS,
  TRANSLATION_KIND_FIELDS,
  type TranslationKind,
  type TranslationResult,
  type TranslationTestResult,
} from "./types"

@Injectable()
export class TranslationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectResolver: ProjectResolverService,
    private readonly configService: TranslationConfigService,
  ) {}

  /**
   * 把一条内容的若干字段译成目标语言。结果只回给调用方，不写库 ——
   * 机器译文得由人过一眼再保存，后台按钮拿它填草稿。
   */
  async translate(projectKey: string, dto: TranslateDto): Promise<TranslationResult> {
    const canonicalKey = await this.projectResolver.resolveCanonicalKeyOrThrow(projectKey)
    const target = await this.resolveTargetLocale(canonicalKey, dto.target_locale)
    const fields = normalizeFields(dto.kind, dto.fields)

    const config = await this.configService.resolve()
    if (!config) {
      throw new BadRequestException("AI translation is not configured or not enabled")
    }

    const systemPrompt = renderTemplate(config.systemPrompt, {
      target_locale: target.locale,
      target_label: target.label ?? target.locale,
      source_locale: dto.source_locale?.trim() || "未指定",
    })

    const text = await callTranslationProvider({
      provider: config.provider,
      baseUrl: config.baseUrl,
      apiKey: config.apiKey,
      model: config.model,
      systemPrompt,
      userMessage: buildUserMessage({
        kind: dto.kind,
        fields,
        sourceLocale: dto.source_locale?.trim() || null,
      }),
    })

    return {
      locale: target.locale,
      provider: config.provider,
      model: config.model,
      fields: parseTranslated(text, Object.keys(fields)),
    }
  }

  /**
   * 用当前配置译一句样例，验证地址、凭据与模型是否配得通。
   *
   * 失败不抛异常：管理员正在设置页上调参数，把原因显示在页面里比丢一个
   * 500 有用得多。
   */
  async test(): Promise<TranslationTestResult> {
    const view = await this.configService.getView()
    const base: TranslationTestResult = {
      ok: false,
      provider: view.provider,
      model: view.model,
      request_url: view.request_url,
      sample: null,
      latency_ms: 0,
      error: null,
    }

    const config = await this.configService.resolve()
    if (!config) {
      return {
        ...base,
        error: view.enabled ? "API 地址与模型尚未填写完整" : "AI 翻译尚未启用",
      }
    }

    const startedAt = Date.now()

    try {
      const systemPrompt = renderTemplate(config.systemPrompt, {
        target_locale: "en",
        target_label: "English",
        source_locale: "zh-CN",
      })

      const text = await callTranslationProvider({
        provider: config.provider,
        baseUrl: config.baseUrl,
        apiKey: config.apiKey,
        model: config.model,
        systemPrompt,
        userMessage: buildUserMessage({
          kind: "announcement",
          fields: { content: TRANSLATION_TEST_SAMPLE },
          sourceLocale: "zh-CN",
        }),
      })

      return {
        ...base,
        ok: true,
        request_url: resolveRequestUrl(config.provider, config.baseUrl),
        sample: parseTranslated(text, ["content"]).content ?? null,
        latency_ms: Date.now() - startedAt,
      }
    } catch (error) {
      return {
        ...base,
        latency_ms: Date.now() - startedAt,
        error: error instanceof Error ? error.message : "未知错误",
      }
    }
  }

  /** 目标语言必须命中项目的注册表，返回主标签与展示名（后者喂给提示词）。 */
  private async resolveTargetLocale(
    canonicalKey: string,
    wanted: string,
  ): Promise<{ locale: string; label: string | null }> {
    const registered = await this.prisma.projectLocale.findMany({
      where: { projectKey: canonicalKey },
      select: { locale: true, aliases: true, label: true },
    })

    const matched = matchRegisteredLocale(registered, wanted)
    if (!matched) {
      throw new BadRequestException(`Locale ${wanted} is not registered for this project`)
    }

    const hit = registered.find((item) => item.locale === matched)
    return { locale: matched, label: hit?.label ?? null }
  }
}

/** 校验字段清单并去掉空值。返回的对象即将原样发给模型。 */
function normalizeFields(
  kind: TranslationKind,
  fields: Record<string, unknown>,
): Record<string, string> {
  const allowed = TRANSLATION_KIND_FIELDS[kind]
  const result: Record<string, string> = {}
  let total = 0

  for (const [key, value] of Object.entries(fields)) {
    if (!allowed.includes(key)) {
      throw new BadRequestException(
        `Field ${key} is not translatable for ${kind}; allowed: ${allowed.join(", ")}`,
      )
    }
    if (typeof value !== "string") {
      throw new BadRequestException(`Field ${key} must be a string`)
    }

    const trimmed = value.trim()
    if (!trimmed) {
      // 空字段没什么可译的，送出去只会换回一个空串，白花一次调用。
      continue
    }

    result[key] = trimmed
    total += trimmed.length
  }

  if (Object.keys(result).length === 0) {
    throw new BadRequestException("No non-empty field to translate")
  }

  if (total > MAX_TRANSLATION_INPUT_CHARS) {
    throw new BadRequestException(
      `Text to translate is ${total} characters, over the ${MAX_TRANSLATION_INPUT_CHARS} limit`,
    )
  }

  return result
}

/**
 * 解析模型回包。先剥掉代码围栏 —— 不支持 JSON 模式的服务几乎一定会把 JSON
 * 包在 ```json 里，为这个失败一次不值得。
 */
function parseTranslated(text: string, expectedKeys: string[]): Record<string, string> {
  const parsed = tryParseObject(stripCodeFence(text))
  if (!parsed) {
    throw new BadGatewayException(`模型没有返回 JSON 对象：${preview(text)}`)
  }

  const result: Record<string, string> = {}

  for (const key of expectedKeys) {
    const value = parsed[key]
    if (typeof value !== "string") {
      throw new BadGatewayException(`模型的回包缺少字段 ${key}：${preview(text)}`)
    }
    result[key] = value
  }

  return result
}

function stripCodeFence(text: string): string {
  const trimmed = text.trim()
  const fenced = /^```(?:json)?\s*\n([\s\S]*?)\n?```$/i.exec(trimmed)
  return fenced?.[1]?.trim() ?? trimmed
}

function tryParseObject(text: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(text)
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null
  } catch {
    return null
  }
}

function preview(text: string): string {
  const collapsed = text.replace(/\s+/g, " ").trim()
  return collapsed.length <= 200 ? collapsed : `${collapsed.slice(0, 200)}…`
}
