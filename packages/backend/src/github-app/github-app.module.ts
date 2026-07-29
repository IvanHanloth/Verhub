import { Module } from "@nestjs/common"

import { AuthModule } from "../auth/auth.module"
import { CommentCommandsService } from "./comment-commands.service"
import { FeedbackForwardThrottler } from "./feedback-forward-throttler"
import { FeedbackIssueService } from "./feedback-issue.service"
import { GithubAppClientService } from "./github-app-client.service"
import { GithubAppConfigController } from "./github-app-config.controller"
import { GithubAppConfigService } from "./github-app-config.service"
import { GithubAppWebhookController } from "./github-app-webhook.controller"
import { ProjectGithubIntegrationController } from "./project-github-integration.controller"
import { ProjectGithubIntegrationService } from "./project-github-integration.service"

@Module({
  imports: [AuthModule],
  controllers: [
    GithubAppConfigController,
    ProjectGithubIntegrationController,
    GithubAppWebhookController,
  ],
  providers: [
    GithubAppConfigService,
    GithubAppClientService,
    ProjectGithubIntegrationService,
    FeedbackForwardThrottler,
    FeedbackIssueService,
    CommentCommandsService,
  ],
  exports: [FeedbackIssueService],
})
export class GithubAppModule {}
