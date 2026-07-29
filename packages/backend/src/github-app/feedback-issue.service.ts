/**
 * 反馈 → GitHub Issue 转发。
 *
 * 转发是逐条自选的：项目开了开关只代表「允许」，真正转不转由提交者在客户端勾选。
 * 因此联系方式必填、单 IP 限流这两条约束都只作用于「勾了转发」的请求，普通反馈
 * 一律照收 —— 不能因为项目接了 GitHub 就抬高所有人的提交门槛。
 *
 * 勾了转发时建 Issue 是提交成败的一部分：失败就抛错，由调用方连带撤掉这条反馈。
 * 「提交成功了但 Issue 没建上」会让用户以为问题已经报到仓库里，比直接报错更糟。
 */

import {
  BadRequestException,
  Injectable,
  Logger,
  HttpException,
  HttpStatus,
  ServiceUnavailableException,
} from "@nestjs/common"

import { PrismaService } from "../database/prisma.service"
import { nowSeconds } from "../common/utils"
import { FeedbackForwardThrottler } from "./feedback-forward-throttler"
import {
  BUILTIN_FEEDBACK_ISSUE_BODY_TEMPLATE,
  BUILTIN_FEEDBACK_ISSUE_TITLE_TEMPLATE,
  parseRepoTemplateFile,
  renderTemplate,
  type FeedbackIssueTemplate,
} from "./feedback-issue-template"
import { GithubAppClientService, type CreatedIssue } from "./github-app-client.service"
import { GithubAppConfigService } from "./github-app-config.service"
import { ProjectGithubIntegrationService } from "./project-github-integration.service"
import type { FeedbackIssueRepoTemplatePreview, PublicFeedbackOptions } from "./types"

/** 仓库模板的缓存寿命。仓库里改完模板最多等这么久生效，管理端可手动刷新。 */
const REPO_TEMPLATE_CACHE_SECONDS = 300

/**
 * 面向最终用户的拒绝文案。SDK 原样透传，所以每条都要说清「发生了什么 + 现在能怎么办」。
 * 提交前校验与真正建 Issue 时共用同一句，避免同一种情况被描述成两回事。
 */
const FORWARD_UNAVAILABLE_MESSAGE =
  "forward_to_github is not available for this project — submit the feedback without it"
const CONTACT_REQUIRED_MESSAGE =
  "contact is required: forwarding this feedback to a GitHub Issue needs a way to reach you"
const ISSUE_FAILED_MESSAGE =
  "failed to create the GitHub Issue — this feedback was not saved; retry later, or submit it without forwarding"

export type FeedbackForForwarding = {
  id: string
  content: string
  rating: number | null
  contact: string | null
  user_id: string | null
  platform: string | null
  platform_version: string | null
  created_at: number
}

/** 转发成功后拿到的 Issue 标识，落到反馈行上。 */
export type ForwardedIssue = CreatedIssue

type CachedRepoTemplate = { template: FeedbackIssueTemplate; fetchedAt: number }

@Injectable()
export class FeedbackIssueService {
  private readonly logger = new Logger(FeedbackIssueService.name)
  private readonly repoTemplateCache = new Map<string, CachedRepoTemplate>()

  constructor(
    private readonly prisma: PrismaService,
    private readonly integrationService: ProjectGithubIntegrationService,
    private readonly configService: GithubAppConfigService,
    private readonly client: GithubAppClientService,
    private readonly throttler: FeedbackForwardThrottler,
  ) {}

  /** 公开端的能力播报，客户端据此决定要不要显示「转发到 GitHub」这个勾选框。 */
  async getPublicOptions(projectKey: string): Promise<PublicFeedbackOptions> {
    const available = await this.integrationService.isFeedbackIssueActive(projectKey)
    return {
      project_key: projectKey,
      github_forward_available: available,
      contact_required_for_forward: available,
    }
  }

  /**
   * 校验一次「要求转发」的提交。在反馈落库前调用，错误信息面向最终用户措辞，
   * SDK 会原样透传：拒绝的原因必须让客户端能直接显示给人看。
   *
   * 没要求转发时直接放行 —— 限流与联系方式都不该拦到普通反馈。
   */
  async assertForwardAllowed(
    projectKey: string,
    input: { forward: boolean; contact?: string | null; ip?: string | null },
  ): Promise<void> {
    if (!input.forward) {
      return
    }
    if (!(await this.integrationService.isFeedbackIssueActive(projectKey))) {
      throw new BadRequestException(FORWARD_UNAVAILABLE_MESSAGE)
    }
    if (!input.contact?.trim()) {
      throw new BadRequestException(CONTACT_REQUIRED_MESSAGE)
    }

    const quota = this.throttler.consume(input.ip)
    if (!quota.allowed) {
      throw new HttpException(
        `too many GitHub forwards from this address (${quota.limit} per ${quota.windowSeconds}s) — submit the feedback without forwarding, or retry later`,
        HttpStatus.TOO_MANY_REQUESTS,
      )
    }
  }

  /**
   * 建 Issue。成功返回 Issue 标识，失败抛错 —— 调用方据此撤掉这条反馈。
   *
   * 校验与建 Issue 之间隔着一次外部请求，期间管理员可能刚好关掉转发，所以这里
   * 重新确认一次可用性，而不是信任 {@link assertForwardAllowed} 的结论。
   */
  async forward(projectKey: string, feedback: FeedbackForForwarding): Promise<ForwardedIssue> {
    const [active, integration] = await Promise.all([
      this.integrationService.isFeedbackIssueActive(projectKey),
      this.integrationService.getRecord(projectKey),
    ])
    if (!active || !integration?.repoFullName) {
      throw new BadRequestException(FORWARD_UNAVAILABLE_MESSAGE)
    }

    const template = await this.resolveTemplate(projectKey)
    const variables = await this.buildVariables(projectKey, feedback)
    const issue = await this.client
      .createIssue(integration.repoFullName, {
        title: renderTemplate(template.title, variables),
        body: renderTemplate(template.body, variables),
        // 仓库模板自带的 labels 优先：模板和标签同在一个文件里维护才不会对不上。
        labels: template.labels ?? integration.feedbackIssueLabels,
      })
      .catch((error: unknown) => {
        // GitHub 的原始报错（含仓库名、状态码）只进日志，回给客户端的是能照做的那句话。
        this.logger.warn(
          `[github-app] failed to forward feedback ${feedback.id} for ${projectKey}: ${String(error)}`,
        )
        throw new ServiceUnavailableException(ISSUE_FAILED_MESSAGE)
      })

    this.logger.log(
      `[github-app] feedback ${feedback.id} forwarded to ${integration.repoFullName}: ${issue.url ?? `#${issue.number ?? "?"}`}`,
    )
    return issue
  }

  /**
   * 解析项目实际使用的模板：repo → custom → inherit（实例）→ 内置。
   * 仓库来源拉取失败时静默退回实例模板，转发不该因为模板文件被删就整条丢掉。
   */
  async resolveTemplate(projectKey: string): Promise<FeedbackIssueTemplate> {
    const integration = await this.integrationService.getRecord(projectKey)
    const instance = await this.configService.getInstanceTemplate()
    if (!integration) {
      return instance
    }

    if (integration.feedbackIssueTemplateSource === "repo") {
      const fetched = await this.loadRepoTemplate(
        integration.repoFullName,
        integration.feedbackIssueTemplateRepoPath,
        integration.feedbackIssueTemplateRepoRef,
      ).catch((error: unknown) => {
        this.logger.warn(
          `[github-app] repo template unavailable for ${projectKey}: ${String(error)}`,
        )
        return null
      })
      if (fetched) {
        return fetched.template
      }
      return instance
    }

    if (integration.feedbackIssueTemplateSource === "custom") {
      return {
        title: integration.feedbackIssueTitleTemplate ?? BUILTIN_FEEDBACK_ISSUE_TITLE_TEMPLATE,
        body: integration.feedbackIssueBodyTemplate ?? BUILTIN_FEEDBACK_ISSUE_BODY_TEMPLATE,
      }
    }

    return instance
  }

  /**
   * 管理端预览仓库模板。与转发路径不同，这里要把失败原因显式返回：
   * 配置界面上「拉不到」和「拉到了但内容是空的」得让人一眼分得清。
   */
  async previewRepoTemplate(
    projectKey: string,
    options: { refresh?: boolean } = {},
  ): Promise<FeedbackIssueRepoTemplatePreview> {
    const integration = await this.integrationService.getRecord(projectKey)
    const path = integration?.feedbackIssueTemplateRepoPath ?? ""
    const ref = integration?.feedbackIssueTemplateRepoRef ?? null
    const empty: FeedbackIssueRepoTemplatePreview = {
      path,
      ref,
      fetched_at: null,
      title_template: null,
      body_template: null,
      labels: [],
      error: null,
    }

    if (!integration?.repoFullName || !path) {
      return { ...empty, error: "请先填写目标仓库与模板文件路径。" }
    }
    if (options.refresh) {
      this.repoTemplateCache.delete(cacheKey(integration.repoFullName, path, ref))
    }

    try {
      const fetched = await this.loadRepoTemplate(integration.repoFullName, path, ref)
      if (!fetched) {
        return { ...empty, error: `仓库中没有读到 ${path}（文件不存在或不是文本文件）。` }
      }
      return {
        ...empty,
        fetched_at: fetched.fetchedAt,
        title_template: fetched.template.title,
        body_template: fetched.template.body,
        labels: fetched.template.labels ?? [],
      }
    } catch (error) {
      return { ...empty, error: describeError(error) }
    }
  }

  private async loadRepoTemplate(
    repoFullName: string | null,
    path: string | null,
    ref: string | null,
  ): Promise<CachedRepoTemplate | null> {
    if (!repoFullName || !path) {
      return null
    }
    const key = cacheKey(repoFullName, path, ref)
    const cached = this.repoTemplateCache.get(key)
    if (cached && nowSeconds() - cached.fetchedAt < REPO_TEMPLATE_CACHE_SECONDS) {
      return cached
    }

    const raw = await this.client.getFileContent(repoFullName, path, ref ?? undefined)
    if (raw === null) {
      return null
    }

    const entry: CachedRepoTemplate = {
      template: parseRepoTemplateFile(raw),
      fetchedAt: nowSeconds(),
    }
    this.repoTemplateCache.set(key, entry)
    return entry
  }

  private async buildVariables(
    projectKey: string,
    feedback: FeedbackForForwarding,
  ): Promise<Record<string, string>> {
    const project = await this.prisma.project.findUnique({
      where: { projectKey },
      select: { name: true },
    })

    const content = feedback.content
    return {
      project_key: projectKey,
      project_name: project?.name ?? projectKey,
      feedback_id: feedback.id,
      content,
      content_head: content.length <= 60 ? content : `${content.slice(0, 60)}…`,
      rating: feedback.rating === null ? "未评分" : `${feedback.rating}/5`,
      contact: feedback.contact ?? "未留",
      user_id: feedback.user_id ?? "匿名",
      platform: feedback.platform ?? "未知平台",
      platform_version: feedback.platform_version ?? "",
      created_at: new Date(feedback.created_at * 1000).toISOString(),
    }
  }
}

function cacheKey(repoFullName: string, path: string, ref: string | null): string {
  return `${repoFullName} ${path} ${ref ?? ""}`
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export { renderTemplate }
