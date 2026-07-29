/**
 * GitHub App 的出站 API 客户端。
 *
 * 认证链路：App 私钥签 RS256 JWT → 换取仓库所在 installation 的 access token →
 * 用该 token 调 REST API。JWT 用 node:crypto 直接签，避免为一个算法引入依赖。
 *
 * installation 解析与 token 都带内存缓存：token 官方有效期 1 小时，留 5 分钟
 * 余量提前换新。缓存只在单进程内，多副本部署下各自换取，互不影响正确性。
 */

import { createSign } from "node:crypto"

import { Injectable, Logger, ServiceUnavailableException } from "@nestjs/common"

import { nowSeconds } from "../common/utils"
import { GithubAppConfigService } from "./github-app-config.service"

const GITHUB_API_BASE = "https://api.github.com"
const USER_AGENT = "verhub-github-app"
/** token 剩余寿命低于该值即换新，避免请求半路过期。 */
const TOKEN_RENEW_MARGIN_SECONDS = 300
/** installation 归属很少变化，缓存较久；换仓库/重装 App 最多等它过期。 */
const INSTALLATION_CACHE_SECONDS = 3600
const REQUEST_TIMEOUT_MS = 10_000

type InstallationToken = { token: string; expiresAt: number }

/** 建 Issue 的结果。GitHub 少给哪一项就留 null，调用方按有什么记什么。 */
export type CreatedIssue = { number: number | null; url: string | null }

@Injectable()
export class GithubAppClientService {
  private readonly logger = new Logger(GithubAppClientService.name)
  private readonly installationCache = new Map<string, { id: number; cachedAt: number }>()
  private readonly tokenCache = new Map<number, InstallationToken>()

  constructor(private readonly configService: GithubAppConfigService) {}

  /** 在仓库创建 Issue，返回编号与 html_url。 */
  async createIssue(
    repoFullName: string,
    input: { title: string; body: string; labels?: string[] },
  ): Promise<CreatedIssue> {
    const token = await this.getInstallationTokenForRepo(repoFullName)
    const response = await this.request(`/repos/${repoFullName}/issues`, {
      method: "POST",
      token,
      body: {
        title: input.title,
        body: input.body,
        ...(input.labels && input.labels.length > 0 ? { labels: input.labels } : {}),
      },
    })
    return {
      number: typeof response?.number === "number" ? response.number : null,
      url: typeof response?.html_url === "string" ? response.html_url : null,
    }
  }

  /**
   * 读取仓库中一个文本文件的内容（用于仓库托管的 Issue 模板）。
   *
   * 只接受 base64 编码的普通文件：目录、submodule、以及大于 1MB 被 GitHub 转成
   * 下载链接的文件都返回 null，交给调用方回退，不为一个模板去追第二跳。
   */
  async getFileContent(repoFullName: string, path: string, ref?: string): Promise<string | null> {
    const token = await this.getInstallationTokenForRepo(repoFullName)
    const query = ref?.trim() ? `?ref=${encodeURIComponent(ref.trim())}` : ""
    const encodedPath = path
      .split("/")
      .filter(Boolean)
      .map((segment) => encodeURIComponent(segment))
      .join("/")
    const response = await this.request(`/repos/${repoFullName}/contents/${encodedPath}${query}`, {
      method: "GET",
      token,
    })

    if (response?.encoding !== "base64" || typeof response.content !== "string") {
      return null
    }
    return Buffer.from(response.content, "base64").toString("utf8")
  }

  /** 触发 workflow_dispatch。GitHub 成功时返回 204，无响应体。 */
  async dispatchWorkflow(
    repoFullName: string,
    workflow: string,
    ref: string,
    inputs: Record<string, string>,
  ): Promise<void> {
    const token = await this.getInstallationTokenForRepo(repoFullName)
    await this.request(
      `/repos/${repoFullName}/actions/workflows/${encodeURIComponent(workflow)}/dispatches`,
      { method: "POST", token, body: { ref, inputs } },
    )
  }

  // ── 认证链路 ──

  private async getInstallationTokenForRepo(repoFullName: string): Promise<string> {
    const installationId = await this.resolveInstallationId(repoFullName)

    const cached = this.tokenCache.get(installationId)
    if (cached && cached.expiresAt - nowSeconds() > TOKEN_RENEW_MARGIN_SECONDS) {
      return cached.token
    }

    const jwt = await this.buildAppJwt()
    const response = await this.request(`/app/installations/${installationId}/access_tokens`, {
      method: "POST",
      token: jwt,
      tokenType: "Bearer",
    })
    const token = typeof response?.token === "string" ? response.token : null
    if (!token) {
      throw new ServiceUnavailableException("GitHub did not return an installation token")
    }

    const expiresAt =
      typeof response?.expires_at === "string"
        ? Math.floor(new Date(response.expires_at).getTime() / 1000)
        : nowSeconds() + 3600
    this.tokenCache.set(installationId, { token, expiresAt })
    return token
  }

  private async resolveInstallationId(repoFullName: string): Promise<number> {
    const cached = this.installationCache.get(repoFullName)
    if (cached && nowSeconds() - cached.cachedAt < INSTALLATION_CACHE_SECONDS) {
      return cached.id
    }

    const jwt = await this.buildAppJwt()
    const response = await this.request(`/repos/${repoFullName}/installation`, {
      method: "GET",
      token: jwt,
      tokenType: "Bearer",
    })
    const id = typeof response?.id === "number" ? response.id : null
    if (!id) {
      throw new ServiceUnavailableException(
        `GitHub App is not installed on ${repoFullName} — install the app on the repository first`,
      )
    }

    this.installationCache.set(repoFullName, { id, cachedAt: nowSeconds() })
    return id
  }

  /**
   * App 身份 JWT。iat 回拨 60 秒抵消时钟偏移（GitHub 官方建议），寿命 9 分钟
   * （上限 10 分钟）。每次现签，不缓存 —— 签名成本远低于一次网络请求。
   */
  private async buildAppJwt(): Promise<string> {
    const [record, privateKey] = await Promise.all([
      this.configService.getRecord(),
      this.configService.getPrivateKey(),
    ])
    if (!record?.appId || !privateKey) {
      throw new ServiceUnavailableException("GitHub App credentials are not configured")
    }

    const now = nowSeconds()
    const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }))
    const payload = base64Url(JSON.stringify({ iat: now - 60, exp: now + 540, iss: record.appId }))
    const signingInput = `${header}.${payload}`
    const signature = createSign("RSA-SHA256").update(signingInput).sign(privateKey)
    return `${signingInput}.${base64Url(signature)}`
  }

  private async request(
    path: string,
    options: { method: string; token: string; tokenType?: "Bearer" | "token"; body?: unknown },
  ): Promise<Record<string, unknown> | null> {
    const response = await fetch(`${GITHUB_API_BASE}${path}`, {
      method: options.method,
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `${options.tokenType ?? "token"} ${options.token}`,
        "User-Agent": USER_AGENT,
        "X-GitHub-Api-Version": "2022-11-28",
        ...(options.body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })

    if (!response.ok) {
      const detail = await response.text().catch(() => "")
      this.logger.warn(
        `[github-app] ${options.method} ${path} -> ${response.status} ${truncate(detail, 200)}`,
      )
      throw new ServiceUnavailableException(
        `GitHub API responded ${response.status} for ${options.method} ${path}`,
      )
    }

    if (response.status === 204) {
      return null
    }
    return (await response.json().catch(() => null)) as Record<string, unknown> | null
  }
}

function base64Url(input: string | Buffer): string {
  return Buffer.from(input).toString("base64url")
}

function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max)}…`
}
