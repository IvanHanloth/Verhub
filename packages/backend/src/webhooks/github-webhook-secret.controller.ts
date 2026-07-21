import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  UseGuards,
} from "@nestjs/common"

import { AdminOrApiKeyGuard } from "../auth/guards/admin-or-api-key.guard"
import { RequireApiScope } from "../auth/guards/api-scope.decorator"

import { SetGithubWebhookSecretDto } from "./dto/set-github-webhook-secret.dto"
import { GithubWebhookSecretService } from "./github-webhook-secret.service"

@Controller("admin/projects/:projectKey/github-webhook")
@UseGuards(AdminOrApiKeyGuard)
export class GithubWebhookSecretController {
  constructor(private readonly githubWebhookSecretService: GithubWebhookSecretService) {}

  @Get()
  @RequireApiScope("projects:read")
  async getSettings(@Param("projectKey") projectKey: string) {
    return this.githubWebhookSecretService.getSettings(projectKey)
  }

  @Post("regenerate")
  @HttpCode(200)
  @RequireApiScope("projects:write")
  async regenerate(@Param("projectKey") projectKey: string) {
    return this.githubWebhookSecretService.regenerate(projectKey)
  }

  @Put()
  @HttpCode(200)
  @RequireApiScope("projects:write")
  async setSecret(@Param("projectKey") projectKey: string, @Body() dto: SetGithubWebhookSecretDto) {
    return this.githubWebhookSecretService.setSecret(projectKey, dto.secret)
  }

  @Delete()
  @RequireApiScope("projects:write")
  async clearSecret(@Param("projectKey") projectKey: string) {
    return this.githubWebhookSecretService.clearSecret(projectKey)
  }
}
