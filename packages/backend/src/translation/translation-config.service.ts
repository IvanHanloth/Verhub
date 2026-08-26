import { Injectable } from "@nestjs/common"

import { PrismaService } from "../database/prisma.service"
import { nowSeconds } from "../common/utils"
import { openSecret, sealSecret, secretFingerprint } from "../common/secret-box"
import { UpdateTranslationConfigDto } from "./dto/update-translation-config.dto"
import {
  BUILTIN_TRANSLATION_SYSTEM_PROMPT,
  TRANSLATION_PROMPT_VARIABLES,
} from "./translation-prompt"
import { resolveRequestUrl } from "./translation-provider"
import { type TranslationConfigView, type TranslationProvider } from "./types"

/** API key 加解密的用途标签，见 secret-box。改动会导致既有密文无法解开。 */
const API_KEY_PURPOSE = "translation-api-key"

const SINGLETON_ID = "default"

type ConfigRecord = {
  enabled: boolean
  provider: string
  baseUrl: string | null
  apiKeyEncrypted: string | null
  apiKeyFingerprint: string | null
  apiKeyUpdatedAt: number | null
  model: string | null
  customPrompt: boolean
  systemPrompt: string | null
  updatedAt: number
}

/** 供翻译服务使用的、解密后的可用配置。拿到它就说明配置齐全且总闸打开。 */
export type ResolvedTranslationConfig = {
  provider: TranslationProvider
  baseUrl: string
  apiKey: string | null
  model: string
  systemPrompt: string
}

@Injectable()
export class TranslationConfigService {
  constructor(private readonly prisma: PrismaService) {}

  async getView(): Promise<TranslationConfigView> {
    return toView(await this.find())
  }

  async update(dto: UpdateTranslationConfigDto): Promise<TranslationConfigView> {
    const data: Record<string, unknown> = { updatedAt: nowSeconds() }

    if (dto.enabled !== undefined) {
      data.enabled = dto.enabled
    }

    if (dto.provider !== undefined) {
      data.provider = dto.provider
    }

    if (dto.base_url !== undefined) {
      data.baseUrl = dto.base_url.trim() || null
    }

    if (dto.model !== undefined) {
      data.model = dto.model.trim() || null
    }

    if (dto.api_key !== undefined) {
      const key = dto.api_key.trim()
      data.apiKeyEncrypted = key ? sealSecret(key, API_KEY_PURPOSE) : null
      data.apiKeyFingerprint = key ? secretFingerprint(key) : null
      data.apiKeyUpdatedAt = key ? nowSeconds() : null
    }

    if (dto.custom_prompt !== undefined) {
      data.customPrompt = dto.custom_prompt
    }

    if (dto.system_prompt !== undefined) {
      data.systemPrompt = dto.system_prompt.trim() || null
    }

    const updated = await this.prisma.translationConfig.upsert({
      where: { id: SINGLETON_ID },
      create: { id: SINGLETON_ID, ...data },
      update: data,
    })

    return toView(updated)
  }

  /** 清空全部配置，总闸一并关掉。 */
  async clear(): Promise<TranslationConfigView> {
    const cleared = await this.prisma.translationConfig.upsert({
      where: { id: SINGLETON_ID },
      create: { id: SINGLETON_ID },
      update: {
        enabled: false,
        provider: "openai",
        baseUrl: null,
        apiKeyEncrypted: null,
        apiKeyFingerprint: null,
        apiKeyUpdatedAt: null,
        model: null,
        customPrompt: false,
        systemPrompt: null,
        updatedAt: nowSeconds(),
      },
    })

    return toView(cleared)
  }

  /**
   * 解出一份可直接发起请求的配置；总闸没开或配置不全返回 null，
   * 由调用方决定报什么错 —— 翻译端点要 400，测试连接要把原因写进结果里。
   */
  async resolve(): Promise<ResolvedTranslationConfig | null> {
    const record = await this.find()
    if (!record?.enabled || !isConfigured(record)) {
      return null
    }

    return {
      provider: toProvider(record.provider),
      baseUrl: record.baseUrl!,
      apiKey: record.apiKeyEncrypted ? openSecret(record.apiKeyEncrypted, API_KEY_PURPOSE) : null,
      model: record.model!,
      systemPrompt: effectivePrompt(record),
    }
  }

  private find(): Promise<ConfigRecord | null> {
    return this.prisma.translationConfig.findUnique({ where: { id: SINGLETON_ID } })
  }
}

/** 地址与模型齐全即算配置完成。api key 不是必需：自建服务常常无鉴权。 */
function isConfigured(record: ConfigRecord | null): boolean {
  return Boolean(record?.baseUrl && record.model)
}

/**
 * 生效的系统提示词。没打开自定义开关时直接返回内置提示词 —— 开关关掉即刻回到
 * 内置文案，不用管库里还留着什么旧值。
 */
function effectivePrompt(record: ConfigRecord): string {
  if (!record.customPrompt) {
    return BUILTIN_TRANSLATION_SYSTEM_PROMPT
  }
  return record.systemPrompt ?? BUILTIN_TRANSLATION_SYSTEM_PROMPT
}

/** 库里存的是字符串；取值超出枚举（改坏了或降级过）时回落到默认协议。 */
function toProvider(value: string | undefined): TranslationProvider {
  return value === "anthropic" ? "anthropic" : "openai"
}

function toView(record: ConfigRecord | null): TranslationConfigView {
  const provider = toProvider(record?.provider)

  return {
    configured: isConfigured(record),
    enabled: record?.enabled ?? false,
    provider,
    base_url: record?.baseUrl ?? null,
    model: record?.model ?? null,
    has_api_key: Boolean(record?.apiKeyEncrypted),
    api_key_fingerprint: record?.apiKeyFingerprint ?? null,
    api_key_updated_at: record?.apiKeyUpdatedAt ?? null,
    custom_prompt: record?.customPrompt ?? false,
    system_prompt: record?.systemPrompt ?? null,
    builtin_system_prompt: BUILTIN_TRANSLATION_SYSTEM_PROMPT,
    prompt_variables: [...TRANSLATION_PROMPT_VARIABLES],
    request_url: record?.baseUrl ? resolveRequestUrl(provider, record.baseUrl) : null,
    updated_at: record?.updatedAt ?? null,
  }
}
