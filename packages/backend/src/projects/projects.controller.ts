import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common"

import { AdminOrApiKeyGuard } from "../auth/guards/admin-or-api-key.guard"
import { RequireApiScope } from "../auth/guards/api-scope.decorator"

import { CreateProjectDto } from "./dto/create-project.dto"
import { PreviewGithubRepoDto } from "./dto/preview-github-repo.dto"
import { QueryProjectsDto } from "./dto/query-projects.dto"
import { UpdateProjectDto } from "./dto/update-project.dto"
import { ProjectsService } from "./projects.service"

@Controller("admin/projects")
@UseGuards(AdminOrApiKeyGuard)
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Get()
  @RequireApiScope("projects:read")
  async findAll(@Query() query: QueryProjectsDto) {
    return this.projectsService.findAll(query)
  }

  @Get("statistics")
  @RequireApiScope("projects:read")
  async getStatistics() {
    return this.projectsService.getStatistics()
  }

  @Get("github-repo-preview")
  @RequireApiScope("projects:read")
  async previewFromGithubRepo(@Query() query: PreviewGithubRepoDto) {
    return this.projectsService.previewFromGithubRepo(query.repo_url)
  }

  @Get(":projectKey")
  @RequireApiScope("projects:read")
  async findOne(@Param("projectKey") projectKey: string) {
    return this.projectsService.findOne(projectKey)
  }

  @Post()
  @RequireApiScope("projects:write")
  async create(@Body() dto: CreateProjectDto) {
    return this.projectsService.create(dto)
  }

  @Patch(":projectKey")
  @RequireApiScope("projects:write")
  async update(@Param("projectKey") projectKey: string, @Body() dto: UpdateProjectDto) {
    return this.projectsService.update(projectKey, dto)
  }

  @Delete(":projectKey")
  @RequireApiScope("projects:write")
  async remove(@Param("projectKey") projectKey: string) {
    await this.projectsService.remove(projectKey)
    return {
      success: true,
    }
  }

  @Get("_status")
  @RequireApiScope("projects:read")
  getModuleStatus(): { module: string; implemented: boolean } {
    return this.projectsService.getStatus()
  }
}
