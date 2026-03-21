import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common"

import { AdminOrApiKeyGuard } from "../auth/guards/admin-or-api-key.guard"
import { RequireApiScope } from "../auth/guards/api-scope.decorator"
import { JwtAdminGuard } from "../auth/guards/jwt-admin.guard"

import { CreateVersionDto } from "./dto/create-version.dto"
import { PreviewGithubReleaseDto } from "./dto/preview-github-release.dto"
import { QueryVersionsDto } from "./dto/query-versions.dto"
import { UpdateVersionDto } from "./dto/update-version.dto"
import { VersionsService } from "./versions.service"

@Controller("admin/projects/:projectKey/versions")
export class VersionsController {
  constructor(private readonly versionsService: VersionsService) {}

  @Get()
  @UseGuards(JwtAdminGuard)
  async findAll(@Param("projectKey") projectKey: string, @Query() query: QueryVersionsDto) {
    return this.versionsService.findAll(projectKey, query)
  }

  @Get("_status")
  @UseGuards(JwtAdminGuard)
  getModuleStatus(): { module: string; implemented: boolean } {
    return this.versionsService.getStatus()
  }

  @Get("github-release-preview")
  @UseGuards(JwtAdminGuard)
  async previewFromGithubRelease(
    @Param("projectKey") projectKey: string,
    @Query() query: PreviewGithubReleaseDto,
  ) {
    return this.versionsService.previewFromGithubRelease(projectKey, query)
  }

  @Get(":id")
  @UseGuards(JwtAdminGuard)
  async findOne(@Param("projectKey") projectKey: string, @Param("id") id: string) {
    return this.versionsService.findOne(projectKey, id)
  }

  @Post()
  @UseGuards(AdminOrApiKeyGuard)
  @RequireApiScope("versions:write")
  async create(@Param("projectKey") projectKey: string, @Body() dto: CreateVersionDto) {
    return this.versionsService.create(projectKey, dto)
  }

  @Patch(":id")
  @UseGuards(JwtAdminGuard)
  async update(
    @Param("projectKey") projectKey: string,
    @Param("id") id: string,
    @Body() dto: UpdateVersionDto,
  ) {
    return this.versionsService.update(projectKey, id, dto)
  }

  @Delete(":id")
  @UseGuards(JwtAdminGuard)
  async remove(@Param("projectKey") projectKey: string, @Param("id") id: string) {
    await this.versionsService.remove(projectKey, id)
    return {
      success: true,
    }
  }
}
