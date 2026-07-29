import { BadRequestException, Injectable } from "@nestjs/common"

import { PrismaService } from "../database/prisma.service"
import { nowSeconds } from "../common/utils"
import { describeSecret, openSecret, sealSecret, secretFingerprint } from "../common/secret-box"
import { UpdateGithubAppConfigDto } from "./dto/update-github-app-config.dto"
import {
  BUILTIN_FEEDBACK_ISSUE_BODY_TEMPLATE,
  BUILTIN_FEEDBACK_ISSUE_TITLE_TEMPLATE,
  FEEDBACK_ISSUE_TEMPLATE_VARIABLES,
  type FeedbackIssueTemplate,
} from "./feedback-issue-template"
import { GITHUB_APP_FEATURES, type GithubAppConfigView, type GithubAppFeature } from "./types"

/** 私钥加解密的用途标签，见 secret-box。改动会导致既有密文无法解开。 */
const PRIVATE_KEY_PURPOSE = "github-app-private-key"

const SINGLETON_ID = "default"

type ConfigRecord = {
  appId: string | null
  privateKeyEncrypted: string | null
  privateKeyFingerprint: string | null
  privateKeyUpdatedAt: number | null
  webhookSecret: string | null
  webhookSecretUpdatedAt: number | null
  enabledFeatures: string[]
  feedbackIssueCustomTemplate: boolean
  feedbackIssueTitleTemplate: string | null
  feedbackIssueBodyTemplate: string | null
  updatedAt: number
}

@Injectable()
export class GithubAppConfigService {
  constructor(private readonly prisma: PrismaService) {}

  async getView(): Promise<GithubAppConfigView> {
    return toView(await this.find())
  }

  async update(dto: UpdateGithubAppConfigDto): Promise<GithubAppConfigView> {
    const data: Record<string, unknown> = { updatedAt: nowSeconds() }

    if (dto.app_id !== undefined) {
      data.appId = dto.app_id.trim() || null
    }

    if (dto.private_key !== undefined) {
      const pem = dto.private_key.trim()
      if (pem) {
        if (!pem.includes("PRIVATE KEY")) {
          throw new BadRequestException("private_key must be a PEM-encoded private key")
        }
        data.privateKeyEncrypted = sealSecret(pem, PRIVATE_KEY_PURPOSE)
        data.privateKeyFingerprint = secretFingerprint(pem)
      } else {
        data.privateKeyEncrypted = null
        data.privateKeyFingerprint = null
      }
      data.privateKeyUpdatedAt = pem ? nowSeconds() : null
    }

    if (dto.webhook_secret !== undefined) {
      const secret = dto.webhook_secret.trim()
      data.webhookSecret = secret || null
      data.webhookSecretUpdatedAt = secret ? nowSeconds() : null
    }

    if (dto.enabled_features !== undefined) {
      data.enabledFeatures = normalizeFeatures(dto.enabled_features)
    }

    if (dto.feedback_issue_custom_template !== undefined) {
      data.feedbackIssueCustomTemplate = dto.feedback_issue_custom_template
    }
    if (dto.feedback_issue_title_template !== undefined) {
      data.feedbackIssueTitleTemplate = dto.feedback_issue_title_template?.trim() || null
    }
    if (dto.feedback_issue_body_template !== undefined) {
      data.feedbackIssueBodyTemplate = dto.feedback_issue_body_template?.trim() || null
    }

    const updated = await this.prisma.githubAppConfig.upsert({
      where: { id: SINGLETON_ID },
      create: { id: SINGLETON_ID, ...data },
      update: data,
    })

    return toView(updated)
  }

  /** 清空全部配置。功能开关一并归零，项目级开关随即失效（active=false）。 */
  async clear(): Promise<GithubAppConfigView> {
    const cleared = await this.prisma.githubAppConfig.upsert({
      where: { id: SINGLETON_ID },
      create: { id: SINGLETON_ID },
      update: {
        appId: null,
        privateKeyEncrypted: null,
        privateKeyFingerprint: null,
        privateKeyUpdatedAt: null,
        webhookSecret: null,
        webhookSecretUpdatedAt: null,
        enabledFeatures: [],
        feedbackIssueCustomTemplate: false,
        feedbackIssueTitleTemplate: null,
        feedbackIssueBodyTemplate: null,
        updatedAt: nowSeconds(),
      },
    })
    return toView(cleared)
  }

  // ── 供其他服务消费的内部读取 ──

  async getRecord(): Promise<ConfigRecord | null> {
    return this.find()
  }

  /** App ID + 私钥齐全才算配置完成。 */
  async isConfigured(): Promise<boolean> {
    const record = await this.find()
    return isConfigured(record)
  }

  async isFeatureEnabled(feature: GithubAppFeature): Promise<boolean> {
    const record = await this.find()
    return Boolean(record && isConfigured(record) && record.enabledFeatures.includes(feature))
  }

  /**
   * 实例级生效模板。没打开自定义开关时直接返回内置模板 —— 开关关掉即刻回到
   * 内置文案，不用管库里还留着什么旧值。
   */
  async getInstanceTemplate(): Promise<FeedbackIssueTemplate> {
    const record = await this.find()
    if (!record?.feedbackIssueCustomTemplate) {
      return {
        title: BUILTIN_FEEDBACK_ISSUE_TITLE_TEMPLATE,
        body: BUILTIN_FEEDBACK_ISSUE_BODY_TEMPLATE,
      }
    }
    return {
      title: record.feedbackIssueTitleTemplate ?? BUILTIN_FEEDBACK_ISSUE_TITLE_TEMPLATE,
      body: record.feedbackIssueBodyTemplate ?? BUILTIN_FEEDBACK_ISSUE_BODY_TEMPLATE,
    }
  }

  /** 解出私钥原文，仅供 GithubAppClientService 签 JWT 用，不得进任何响应。 */
  async getPrivateKey(): Promise<string | null> {
    const record = await this.find()
    if (!record?.privateKeyEncrypted) {
      return null
    }
    return openSecret(record.privateKeyEncrypted, PRIVATE_KEY_PURPOSE)
  }

  private find(): Promise<ConfigRecord | null> {
    return this.prisma.githubAppConfig.findUnique({ where: { id: SINGLETON_ID } })
  }
}

function isConfigured(record: ConfigRecord | null): boolean {
  return Boolean(record?.appId && record.privateKeyEncrypted)
}

function normalizeFeatures(features: string[]): GithubAppFeature[] {
  const valid = new Set<string>(GITHUB_APP_FEATURES)
  const unknown = features.filter((feature) => !valid.has(feature))
  if (unknown.length > 0) {
    throw new BadRequestException(`Unknown GitHub App feature: ${unknown.join(", ")}`)
  }
  return [...new Set(features)] as GithubAppFeature[]
}

function toView(record: ConfigRecord | null): GithubAppConfigView {
  const webhookSecret = describeSecret(record?.webhookSecret)

  return {
    configured: isConfigured(record),
    app_id: record?.appId ?? null,
    has_private_key: Boolean(record?.privateKeyEncrypted),
    private_key_fingerprint: record?.privateKeyFingerprint ?? null,
    private_key_updated_at: record?.privateKeyUpdatedAt ?? null,
    has_webhook_secret: Boolean(record?.webhookSecret),
    webhook_secret_hint: webhookSecret.hint,
    webhook_secret_length: webhookSecret.length,
    webhook_secret_updated_at: record?.webhookSecretUpdatedAt ?? null,
    webhook_payload_path: "/api/v1/webhooks/github-app",
    enabled_features: (record?.enabledFeatures ?? []) as GithubAppFeature[],
    feedback_issue_custom_template: record?.feedbackIssueCustomTemplate ?? false,
    feedback_issue_title_template: record?.feedbackIssueTitleTemplate ?? null,
    feedback_issue_body_template: record?.feedbackIssueBodyTemplate ?? null,
    builtin_feedback_issue_title_template: BUILTIN_FEEDBACK_ISSUE_TITLE_TEMPLATE,
    builtin_feedback_issue_body_template: BUILTIN_FEEDBACK_ISSUE_BODY_TEMPLATE,
    feedback_issue_template_variables: [...FEEDBACK_ISSUE_TEMPLATE_VARIABLES],
    updated_at: record?.updatedAt ?? null,
  }
}
