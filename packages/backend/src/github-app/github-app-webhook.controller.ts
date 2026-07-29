import { Body, Controller, Headers, HttpCode, Post, Req } from "@nestjs/common"
import type { RawBodyRequest } from "@nestjs/common"
import type { Request } from "express"

import {
  GITHUB_DELIVERY_HEADER,
  GITHUB_EVENT_HEADER,
  GITHUB_SIGNATURE_HEADER,
} from "../webhooks/github-signature"
import { CommentCommandsService } from "./comment-commands.service"
import type { GithubAppWebhookResult } from "./types"

/**
 * GitHub App 的实例级事件入口（配置在 App 设置的 Webhook URL 上）。
 * 与项目级 /webhooks/github/:projectKey 是两条通道：那边收 release、
 * 用项目 secret 验签；这边收 App 订阅的事件（目前只消费 issue_comment），
 * 用 App 配置里的 webhook secret 验签。
 */
@Controller("webhooks/github-app")
export class GithubAppWebhookController {
  constructor(private readonly commentCommandsService: CommentCommandsService) {}

  @Post()
  @HttpCode(200)
  async handleDelivery(
    @Headers(GITHUB_EVENT_HEADER) event: string | undefined,
    @Headers(GITHUB_SIGNATURE_HEADER) signature: string | undefined,
    @Headers(GITHUB_DELIVERY_HEADER) deliveryId: string | undefined,
    @Req() request: RawBodyRequest<Request>,
    @Body() body: unknown,
  ): Promise<GithubAppWebhookResult> {
    return this.commentCommandsService.handleDelivery({
      event,
      signature,
      deliveryId,
      rawBody: request.rawBody,
      body,
    })
  }
}
