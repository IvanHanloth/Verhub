import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common"

import { JwtAdminGuard } from "../auth/guards/jwt-admin.guard"

import { CreateProjectDto } from "./dto/create-project.dto"
import { PreviewGithubRepoDto } from "./dto/preview-github-repo.dto"
import { QueryProjectsDto } from "./dto/query-projects.dto"
import { UpdateProjectDto } from "./dto/update-project.dto"
import { ProjectsService } from "./projects.service"

@Controller("admin/projects")
@UseGuards(JwtAdminGuard)
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Get()
  async findAll(@Query() query: QueryProjectsDto) {
    return this.projectsService.findAll(query)
  }

  @Get("statistics")
  async getStatistics() {
    return this.projectsService.getStatistics()
  }

  @Get("github-repo-preview")
  async previewFromGithubRepo(@Query() query: PreviewGithubRepoDto) {
    return this.projectsService.previewFromGithubRepo(query.repo_url)
  }

  @Get(":projectKey")
  async findOne(@Param("projectKey") projectKey: string) {
    return this.projectsService.findOne(projectKey)
  }

  @Post()
  async create(@Body() dto: CreateProjectDto) {
    return this.projectsService.create(dto)
  }

  @Patch(":projectKey")
  async update(@Param("projectKey") projectKey: string, @Body() dto: UpdateProjectDto) {
    return this.projectsService.update(projectKey, dto)
  }

  @Delete(":projectKey")
  async remove(@Param("projectKey") projectKey: string) {
    await this.projectsService.remove(projectKey)
    return {
      success: true,
    }
  }

  @Get("_status")
  getModuleStatus(): { module: string; implemented: boolean } {
    return this.projectsService.getStatus()
  }
}
