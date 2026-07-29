/**
 * GitHub comment 命令：issue / PR 评论里的 `/verhub-<name> <args>` 触发
 * workflow_dispatch，args 作为 workflow input 传入。
 *
 * 事件从 GitHub App 的实例级 webhook 进来（不是项目级 release webhook），
 * 用 App 配置里的 webhook secret 验签，再按仓库路由到配置了该仓库的项目。
 *
 * 来源限制是硬性关卡：author_association 不在白名单、用户也不在放行名单里，
 * 命令直接忽略 —— 公开仓库里任何人都能留评论，没有这道门就是任意人触发 CI。
 */

import { ForbiddenException, Injectable, Logger, UnauthorizedException } from "@nestjs/common"

import { verifyGithubSignature } from "../webhooks/github-signature"
import { GithubAppClientService } from "./github-app-client.service"
import { GithubAppConfigService } from "./github-app-config.service"
import {
  parseCommands,
  ProjectGithubIntegrationService,
} from "./project-github-integration.service"
import type { GithubAppWebhookResult } from "./types"

/** 命令前缀。/verhub-release 3.2.0 → name=release, args="3.2.0"。 */
const COMMAND_PATTERN = /^\/verhub-([a-z0-9][a-z0-9-]*)(?:\s+(.*))?$/

type IssueCommentPayload = {
  action?: string
  comment?: {
    body?: string
    author_association?: string
    user?: { login?: string }
  }
  repository?: { full_name?: string }
}

@Injectable()
export class CommentCommandsService {
  private readonly logger = new Logger(CommentCommandsService.name)

  constructor(
    private readonly configService: GithubAppConfigService,
    private readonly integrationService: ProjectGithubIntegrationService,
    private readonly client: GithubAppClientService,
  ) {}

  async handleDelivery(input: {
    event: string | undefined
    signature: string | undefined
    deliveryId: string | undefined
    rawBody: Buffer | undefined
    body: unknown
  }): Promise<GithubAppWebhookResult> {
    const config = await this.configService.getRecord()
    if (!config?.webhookSecret) {
      throw new ForbiddenException("GitHub App webhook secret is not configured")
    }
    if (
      !input.rawBody ||
      !verifyGithubSignature(config.webhookSecret, input.rawBody, input.signature)
    ) {
      this.logger.warn(
        `[github-app][webhook] signature rejected delivery=${input.deliveryId ?? "unknown"}`,
      )
      throw new UnauthorizedException("Webhook signature could not be verified")
    }

    const event = input.event ?? ""
    if (event === "ping") {
      return { status: "pong", event }
    }
    if (event !== "issue_comment") {
      return { status: "ignored", reason: "unsupported_event", event }
    }

    if (!(await this.configService.isFeatureEnabled("comment_commands"))) {
      return { status: "ignored", reason: "feature_disabled", event }
    }

    const payload = (input.body ?? {}) as IssueCommentPayload
    // edited/deleted 不重放命令：编辑一条旧评论不应再次触发工作流。
    if (payload.action !== "created") {
      return { status: "ignored", reason: "unsupported_action", event }
    }

    const repoFullName = payload.repository?.full_name
    if (!repoFullName) {
      return { status: "ignored", reason: "missing_repository", event }
    }

    const parsed = parseCommand(payload.comment?.body)
    if (!parsed) {
      return { status: "ignored", reason: "no_command", event }
    }

    const integration = await this.integrationService.findByRepoForCommands(repoFullName)
    if (!integration) {
      return { status: "ignored", reason: "repo_not_configured", event }
    }

    if (!isAuthorAllowed(payload, integration)) {
      this.logger.warn(
        `[github-app][command] rejected /verhub-${parsed.name} from ${payload.comment?.user?.login ?? "unknown"} (${payload.comment?.author_association ?? "?"}) on ${repoFullName}`,
      )
      return { status: "ignored", reason: "author_not_allowed", event, command: parsed.name }
    }

    const command = parseCommands(integration.commands).find((item) => item.name === parsed.name)
    if (!command) {
      return { status: "ignored", reason: "unknown_command", event, command: parsed.name }
    }

    await this.client.dispatchWorkflow(repoFullName, command.workflow, command.ref, {
      [command.input ?? "args"]: parsed.args,
    })

    this.logger.log(
      `[github-app][command] dispatched ${command.workflow}@${command.ref} for /verhub-${parsed.name} on ${repoFullName} (project=${integration.projectKey})`,
    )

    return {
      status: "dispatched",
      event,
      command: parsed.name,
      project_key: integration.projectKey,
      workflow: command.workflow,
    }
  }
}

/** 只认评论首个非空行开头的命令，正文里引用别人的命令不会误触发。 */
export function parseCommand(body: string | undefined): { name: string; args: string } | null {
  const firstLine = (body ?? "")
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.length > 0)
  if (!firstLine) {
    return null
  }

  const match = COMMAND_PATTERN.exec(firstLine)
  if (!match?.[1]) {
    return null
  }
  return { name: match[1], args: match[2]?.trim() ?? "" }
}

function isAuthorAllowed(
  payload: IssueCommentPayload,
  integration: { commandAllowedAssociations: string[]; commandAllowedUsers: string[] },
): boolean {
  const association = payload.comment?.author_association ?? ""
  if (integration.commandAllowedAssociations.includes(association)) {
    return true
  }

  const login = payload.comment?.user?.login?.toLowerCase()
  return Boolean(
    login && integration.commandAllowedUsers.some((user) => user.toLowerCase() === login),
  )
}
