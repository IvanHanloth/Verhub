import { Body, Controller, Get, HttpCode, Param, Put, Query, UseGuards } from "@nestjs/common"

import { AdminOrApiKeyGuard } from "../auth/guards/admin-or-api-key.guard"
import { RequireApiScope } from "../auth/guards/api-scope.decorator"
import { UpdateProjectGithubIntegrationDto } from "./dto/update-project-github-integration.dto"
import { FeedbackIssueService } from "./feedback-issue.service"
import { ProjectGithubIntegrationService } from "./project-github-integration.service"

@Controller("admin/projects/:projectKey/github-integration")
@UseGuards(AdminOrApiKeyGuard)
export class ProjectGithubIntegrationController {
  constructor(
    private readonly integrationService: ProjectGithubIntegrationService,
    private readonly feedbackIssueService: FeedbackIssueService,
  ) {}

  @Get()
  @RequireApiScope("projects:read")
  async getIntegration(@Param("projectKey") projectKey: string) {
    return this.integrationService.getView(projectKey)
  }

  @Put()
  @HttpCode(200)
  @RequireApiScope("projects:write")
  async updateIntegration(
    @Param("projectKey") projectKey: string,
    @Body() dto: UpdateProjectGithubIntegrationDto,
  ) {
    return this.integrationService.update(projectKey, dto)
  }

  /**
   * 按已保存的路径拉一次仓库里的模板文件供预览。
   * refresh=true 会先作废缓存，用于「在仓库里改完模板想立刻看到效果」。
   */
  @Get("repo-template")
  @RequireApiScope("projects:read")
  async previewRepoTemplate(
    @Param("projectKey") projectKey: string,
    @Query("refresh") refresh?: string,
  ) {
    // 先解析一次 key（含改名别名），顺带把不存在的项目挡成 404。
    const view = await this.integrationService.getView(projectKey)
    return this.feedbackIssueService.previewRepoTemplate(view.project_key, {
      refresh: refresh === "true" || refresh === "1",
    })
  }
}
