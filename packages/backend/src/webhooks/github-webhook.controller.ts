import { Body, Controller, Headers, HttpCode, Param, Post, Req } from "@nestjs/common"
import type { RawBodyRequest } from "@nestjs/common"
import type { Request } from "express"

import { GithubWebhookService } from "./github-webhook.service"
import {
  GITHUB_DELIVERY_HEADER,
  GITHUB_EVENT_HEADER,
  GITHUB_SIGNATURE_HEADER,
} from "./github-signature"
import type { GithubWebhookResult } from "./types"

/**
 * Sits outside `/admin` and `/public` on purpose: it is neither guarded by the
 * admin credentials nor part of the client-facing API surface that request
 * statistics track. Its only credential is the project's webhook secret.
 */
@Controller("webhooks/github")
export class GithubWebhookController {
  constructor(private readonly githubWebhookService: GithubWebhookService) {}

  @Post(":projectKey")
  @HttpCode(200)
  async handleGithubDelivery(
    @Param("projectKey") projectKey: string,
    @Headers(GITHUB_EVENT_HEADER) event: string | undefined,
    @Headers(GITHUB_SIGNATURE_HEADER) signature: string | undefined,
    @Headers(GITHUB_DELIVERY_HEADER) deliveryId: string | undefined,
    @Req() request: RawBodyRequest<Request>,
    @Body() body: unknown,
  ): Promise<GithubWebhookResult> {
    return this.githubWebhookService.handleDelivery({
      projectKey,
      event,
      signature,
      deliveryId,
      rawBody: request.rawBody,
      body,
    })
  }
}
