import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common"

import type { Prisma } from "@prisma/client"

import { PrismaService } from "../database/prisma.service"
import { ProjectResolverService } from "../database/project-resolver.service"
import { nowSeconds } from "../common/utils"
import { GithubAppConfigService } from "./github-app-config.service"
import { UpdateProjectGithubIntegrationDto } from "./dto/update-project-github-integration.dto"
import { FEEDBACK_TEMPLATE_SOURCES, type FeedbackTemplateSource } from "./feedback-issue-template"
import type {
  GithubAppFeature,
  GithubCommandDefinition,
  ProjectGithubIntegrationView,
} from "./types"

type IntegrationRecord = {
  projectKey: string
  repoFullName: string | null
  feedbackIssueEnabled: boolean
  feedbackIssueTemplateSource: string
  feedbackIssueTemplateRepoPath: string | null
  feedbackIssueTemplateRepoRef: string | null
  feedbackIssueTitleTemplate: string | null
  feedbackIssueBodyTemplate: string | null
  feedbackIssueLabels: string[]
  commentCommandsEnabled: boolean
  commandAllowedAssociations: string[]
  commandAllowedUsers: string[]
  commands: Prisma.JsonValue | null
  updatedAt: number
}

@Injectable()
export class ProjectGithubIntegrationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectResolver: ProjectResolverService,
    private readonly configService: GithubAppConfigService,
  ) {}

  async getView(projectKey: string): Promise<ProjectGithubIntegrationView> {
    const normalizedKey = await this.resolveProjectKey(projectKey)
    const record = await this.prisma.projectGithubIntegration.findUnique({
      where: { projectKey: normalizedKey },
    })
    return this.toView(normalizedKey, record)
  }

  async update(
    projectKey: string,
    dto: UpdateProjectGithubIntegrationDto,
  ): Promise<ProjectGithubIntegrationView> {
    const normalizedKey = await this.resolveProjectKey(projectKey)
    const existing = await this.prisma.projectGithubIntegration.findUnique({
      where: { projectKey: normalizedKey },
    })

    // 项目级开关只能在实例级功能已启用时打开 —— 这是「先在设置页启用功能，
    // 再到项目里开开关」这条产品规则的服务端兜底。关闭不受限制。
    if (dto.feedback_issue_enabled === true) {
      await this.assertFeatureEnabled("feedback_issue")
      this.assertRepoPresent(dto.repo_full_name ?? existing?.repoFullName)
    }
    if (dto.comment_commands_enabled === true) {
      await this.assertFeatureEnabled("comment_commands")
      this.assertRepoPresent(dto.repo_full_name ?? existing?.repoFullName)
    }

    const data: Record<string, unknown> = { updatedAt: nowSeconds() }
    if (dto.repo_full_name !== undefined) {
      const repo = dto.repo_full_name.trim()
      // 清仓库连带关闭依赖它的开关，避免留下永远打不出去的配置。
      if (!repo) {
        data.feedbackIssueEnabled = false
        data.commentCommandsEnabled = false
      }
      data.repoFullName = repo || null
    }
    if (dto.feedback_issue_enabled !== undefined) {
      data.feedbackIssueEnabled = dto.feedback_issue_enabled
    }
    if (dto.feedback_issue_template_source !== undefined) {
      data.feedbackIssueTemplateSource = dto.feedback_issue_template_source
    }
    if (dto.feedback_issue_template_repo_path !== undefined) {
      data.feedbackIssueTemplateRepoPath = dto.feedback_issue_template_repo_path.trim() || null
    }
    if (dto.feedback_issue_template_repo_ref !== undefined) {
      data.feedbackIssueTemplateRepoRef = dto.feedback_issue_template_repo_ref.trim() || null
    }
    // repo 来源没有路径就等于没有模板，宁可在保存时拒绝，也别等到转发时才发现。
    const templateSource =
      dto.feedback_issue_template_source ?? existing?.feedbackIssueTemplateSource ?? "inherit"
    if (templateSource === "repo") {
      const path =
        dto.feedback_issue_template_repo_path ?? existing?.feedbackIssueTemplateRepoPath ?? ""
      if (!path.trim()) {
        throw new BadRequestException(
          "feedback_issue_template_repo_path is required when the template source is the repository",
        )
      }
      this.assertRepoPresent(dto.repo_full_name ?? existing?.repoFullName)
    }
    if (dto.feedback_issue_title_template !== undefined) {
      data.feedbackIssueTitleTemplate = dto.feedback_issue_title_template.trim() || null
    }
    if (dto.feedback_issue_body_template !== undefined) {
      data.feedbackIssueBodyTemplate = dto.feedback_issue_body_template.trim() || null
    }
    if (dto.feedback_issue_labels !== undefined) {
      data.feedbackIssueLabels = dto.feedback_issue_labels
    }
    if (dto.comment_commands_enabled !== undefined) {
      data.commentCommandsEnabled = dto.comment_commands_enabled
    }
    if (dto.command_allowed_associations !== undefined) {
      data.commandAllowedAssociations = dto.command_allowed_associations
    }
    if (dto.command_allowed_users !== undefined) {
      data.commandAllowedUsers = dto.command_allowed_users
        .map((user) => user.trim())
        .filter(Boolean)
    }
    if (dto.commands !== undefined) {
      assertUniqueCommandNames(dto.commands.map((command) => command.name))
      data.commands = dto.commands as unknown as Prisma.InputJsonValue
    }

    const updated = await this.prisma.projectGithubIntegration.upsert({
      where: { projectKey: normalizedKey },
      create: { projectKey: normalizedKey, ...data },
      update: data,
    })

    return this.toView(normalizedKey, updated)
  }

  // ── 供运行时消费 ──

  /** 反馈转发是否实际生效（项目开 + 实例功能开 + 凭据齐 + 有仓库）。 */
  async isFeedbackIssueActive(projectKey: string): Promise<boolean> {
    const record = await this.prisma.projectGithubIntegration.findUnique({
      where: { projectKey },
      select: { feedbackIssueEnabled: true, repoFullName: true },
    })
    if (!record?.feedbackIssueEnabled || !record.repoFullName) {
      return false
    }
    return this.configService.isFeatureEnabled("feedback_issue")
  }

  async getRecord(projectKey: string): Promise<IntegrationRecord | null> {
    return this.prisma.projectGithubIntegration.findUnique({ where: { projectKey } })
  }

  /** comment 命令按仓库路由：找到把该仓库配置为目标且开了命令功能的项目。 */
  async findByRepoForCommands(repoFullName: string): Promise<IntegrationRecord | null> {
    return this.prisma.projectGithubIntegration.findFirst({
      where: {
        repoFullName: { equals: repoFullName, mode: "insensitive" },
        commentCommandsEnabled: true,
      },
    })
  }

  private async assertFeatureEnabled(feature: GithubAppFeature): Promise<void> {
    if (!(await this.configService.isFeatureEnabled(feature))) {
      throw new BadRequestException(
        `GitHub App feature "${feature}" is not enabled at the instance level — configure it in Settings → GitHub App first`,
      )
    }
  }

  private assertRepoPresent(repo: string | null | undefined): void {
    if (!repo?.trim()) {
      throw new BadRequestException("repo_full_name is required to enable this feature")
    }
  }

  private async resolveProjectKey(projectKey: string): Promise<string> {
    const canonicalKey = await this.projectResolver.resolveCanonicalKey(projectKey)
    if (!canonicalKey) {
      throw new NotFoundException("Project not found")
    }
    return canonicalKey
  }

  private async toView(
    projectKey: string,
    record: IntegrationRecord | null,
  ): Promise<ProjectGithubIntegrationView> {
    const config = await this.configService.getRecord()
    const configured = Boolean(config?.appId && config.privateKeyEncrypted)
    const features = new Set(config?.enabledFeatures ?? [])
    const hasRepo = Boolean(record?.repoFullName)

    return {
      project_key: projectKey,
      repo_full_name: record?.repoFullName ?? null,
      feedback_issue_enabled: record?.feedbackIssueEnabled ?? false,
      feedback_issue_active: Boolean(
        record?.feedbackIssueEnabled && hasRepo && configured && features.has("feedback_issue"),
      ),
      feedback_issue_template_source: normalizeTemplateSource(record?.feedbackIssueTemplateSource),
      feedback_issue_template_repo_path: record?.feedbackIssueTemplateRepoPath ?? null,
      feedback_issue_template_repo_ref: record?.feedbackIssueTemplateRepoRef ?? null,
      feedback_issue_title_template: record?.feedbackIssueTitleTemplate ?? null,
      feedback_issue_body_template: record?.feedbackIssueBodyTemplate ?? null,
      feedback_issue_labels: record?.feedbackIssueLabels ?? [],
      comment_commands_enabled: record?.commentCommandsEnabled ?? false,
      comment_commands_active: Boolean(
        record?.commentCommandsEnabled && hasRepo && configured && features.has("comment_commands"),
      ),
      command_allowed_associations: record?.commandAllowedAssociations ?? [
        "OWNER",
        "MEMBER",
        "COLLABORATOR",
      ],
      command_allowed_users: record?.commandAllowedUsers ?? [],
      commands: parseCommands(record?.commands ?? null),
      updated_at: record?.updatedAt ?? null,
    }
  }
}

/** 库里存的是自由文本列，取值超出枚举时退回 inherit 而不是把视图打成非法状态。 */
function normalizeTemplateSource(value: string | null | undefined): FeedbackTemplateSource {
  return FEEDBACK_TEMPLATE_SOURCES.includes(value as FeedbackTemplateSource)
    ? (value as FeedbackTemplateSource)
    : "inherit"
}

/** commands 列以 Json 存储；读出时做形状过滤，坏数据静默丢弃而不是 500。 */
export function parseCommands(value: Prisma.JsonValue | null): GithubCommandDefinition[] {
  if (!Array.isArray(value)) {
    return []
  }
  return value.flatMap((item) => {
    if (typeof item !== "object" || item === null || Array.isArray(item)) {
      return []
    }
    const command = item as Record<string, unknown>
    if (
      typeof command.name !== "string" ||
      typeof command.workflow !== "string" ||
      typeof command.ref !== "string"
    ) {
      return []
    }
    return [
      {
        name: command.name,
        workflow: command.workflow,
        ref: command.ref,
        ...(typeof command.input === "string" ? { input: command.input } : {}),
      },
    ]
  })
}

function assertUniqueCommandNames(names: string[]): void {
  const seen = new Set<string>()
  for (const name of names) {
    if (seen.has(name)) {
      throw new BadRequestException(`Duplicate command name: ${name}`)
    }
    seen.add(name)
  }
}
