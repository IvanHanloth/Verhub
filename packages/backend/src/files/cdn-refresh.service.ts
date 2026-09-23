import { Injectable, Logger } from "@nestjs/common"

import { PrismaService } from "../database/prisma.service"
import { openSecret, sealSecret, secretFingerprint } from "../common/secret-box"
import { nowSeconds } from "../common/utils"
import { describeAliyunRefreshQuota, refreshAliyunUrls, type AliyunCredentials } from "./aliyun-cdn"
import { UpdateCdnConfigDto } from "./dto/cdn-config.dto"
import { buildDistUrl } from "./file-naming"
import { distBaseUrl } from "./files-config"
import { describeFetchError } from "./storage-drivers"
import type { CdnConfigView, CdnRefreshResult, CdnTestResult } from "./types"

/** AccessKey Secret 加解密的用途标签，见 secret-box。 */
const SECRET_PURPOSE = "cdn-aliyun-access-key-secret"

const SINGLETON_ID = "default"

type ConfigRecord = {
  enabled: boolean
  provider: string
  accessKeyId: string | null
  accessKeySecretEncrypted: string | null
  accessKeySecretFingerprint: string | null
  updatedAt: number
}

/** CDN 缓存刷新：实例级阿里云凭据配置与按 URL 刷新。 */
@Injectable()
export class CdnRefreshService {
  private readonly logger = new Logger(CdnRefreshService.name)

  constructor(private readonly prisma: PrismaService) {}

  async getView(): Promise<CdnConfigView> {
    return toView(await this.find())
  }

  async update(dto: UpdateCdnConfigDto): Promise<CdnConfigView> {
    const data: Record<string, unknown> = { updatedAt: nowSeconds() }
    if (dto.enabled !== undefined) {
      data.enabled = dto.enabled
    }
    if (dto.access_key_id !== undefined) {
      data.accessKeyId = dto.access_key_id.trim() || null
    }
    if (dto.access_key_secret !== undefined) {
      const secret = dto.access_key_secret.trim()
      data.accessKeySecretEncrypted = secret ? sealSecret(secret, SECRET_PURPOSE) : null
      data.accessKeySecretFingerprint = secret ? secretFingerprint(secret) : null
    }

    const updated = await this.prisma.cdnConfig.upsert({
      where: { id: SINGLETON_ID },
      create: { id: SINGLETON_ID, ...data },
      update: data,
    })
    return toView(updated)
  }

  /** 清空凭据并关闭刷新。 */
  async clear(): Promise<CdnConfigView> {
    const cleared = await this.prisma.cdnConfig.upsert({
      where: { id: SINGLETON_ID },
      create: { id: SINGLETON_ID },
      update: {
        enabled: false,
        accessKeyId: null,
        accessKeySecretEncrypted: null,
        accessKeySecretFingerprint: null,
        updatedAt: nowSeconds(),
      },
    })
    return toView(cleared)
  }

  /** 用已保存的凭据查询刷新余量。失败不抛异常，原因写在 error 里。 */
  async test(): Promise<CdnTestResult> {
    const started = Date.now()
    const credentials = this.credentialsOf(await this.find())
    if (!credentials) {
      return {
        ok: false,
        url_remain: null,
        url_quota: null,
        latency_ms: 0,
        error: "未填写 AccessKey",
      }
    }
    try {
      const quota = await describeAliyunRefreshQuota(credentials)
      return {
        ok: true,
        url_remain: quota.urlRemain,
        url_quota: quota.urlQuota,
        latency_ms: Date.now() - started,
        error: null,
      }
    } catch (error) {
      return {
        ok: false,
        url_remain: null,
        url_quota: null,
        latency_ms: Date.now() - started,
        error: describeFetchError(error),
      }
    }
  }

  /**
   * 刷新一组对象路径对应的直链缓存。
   * 未启用、凭据不全或未配置分发域名时返回 null；接口失败不抛异常，原因写在结果里。
   */
  async refreshObjects(objectKeys: string[]): Promise<CdnRefreshResult | null> {
    const base = distBaseUrl()
    const credentials = this.credentialsOf(await this.find(), true)
    if (!base || !credentials || objectKeys.length === 0) {
      return null
    }

    const urls = objectKeys.map((key) => buildDistUrl(base, key))
    try {
      const { taskIds } = await refreshAliyunUrls(credentials, urls)
      return { ok: true, urls, task_ids: taskIds, error: null }
    } catch (error) {
      const message = describeFetchError(error)
      this.logger.warn(`[cdn] refresh failed for ${urls.length} url(s): ${message}`)
      return { ok: false, urls, task_ids: [], error: message }
    }
  }

  private find(): Promise<ConfigRecord | null> {
    return this.prisma.cdnConfig.findUnique({ where: { id: SINGLETON_ID } })
  }

  private credentialsOf(
    record: ConfigRecord | null,
    requireEnabled = false,
  ): AliyunCredentials | null {
    if (!record?.accessKeyId || !record.accessKeySecretEncrypted) {
      return null
    }
    if (requireEnabled && !record.enabled) {
      return null
    }
    return {
      accessKeyId: record.accessKeyId,
      accessKeySecret: openSecret(record.accessKeySecretEncrypted, SECRET_PURPOSE),
    }
  }
}

function toView(record: ConfigRecord | null): CdnConfigView {
  return {
    provider: "aliyun",
    enabled: record?.enabled ?? false,
    configured: Boolean(record?.accessKeyId && record.accessKeySecretEncrypted),
    access_key_id: record?.accessKeyId ?? null,
    has_access_key_secret: Boolean(record?.accessKeySecretEncrypted),
    access_key_secret_fingerprint: record?.accessKeySecretFingerprint ?? null,
    dist_base_url: distBaseUrl(),
    updated_at: record?.updatedAt ?? null,
  }
}
