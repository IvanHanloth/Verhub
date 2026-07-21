import { Module } from "@nestjs/common"

import { AuthModule } from "../auth/auth.module"
import { VersionsModule } from "../versions/versions.module"
import { GithubWebhookController } from "./github-webhook.controller"
import { GithubWebhookSecretController } from "./github-webhook-secret.controller"
import { GithubWebhookSecretService } from "./github-webhook-secret.service"
import { GithubWebhookService } from "./github-webhook.service"

@Module({
  imports: [AuthModule, VersionsModule],
  controllers: [GithubWebhookController, GithubWebhookSecretController],
  providers: [GithubWebhookService, GithubWebhookSecretService],
  exports: [GithubWebhookSecretService],
})
export class WebhooksModule {}
