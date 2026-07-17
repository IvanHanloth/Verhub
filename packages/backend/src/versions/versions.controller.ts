import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Res,
  UseGuards,
} from "@nestjs/common"
import type { Response } from "express"

import { AdminOrApiKeyGuard } from "../auth/guards/admin-or-api-key.guard"
import { RequireApiScope } from "../auth/guards/api-scope.decorator"

import { CreateVersionDto } from "./dto/create-version.dto"
import { PreviewGithubReleaseDto } from "./dto/preview-github-release.dto"
import { QueryVersionsDto } from "./dto/query-versions.dto"
import { UpdateVersionDto } from "./dto/update-version.dto"
import { UpsertVersionDto } from "./dto/upsert-version.dto"
import { GithubReleaseService } from "./github-release.service"
import { VersionsService } from "./versions.service"

@Controller("admin/projects/:projectKey/versions")
@UseGuards(AdminOrApiKeyGuard)
export class VersionsController {
  constructor(
    private readonly versionsService: VersionsService,
    private readonly githubReleaseService: GithubReleaseService,
  ) {}

  @Get()
  @RequireApiScope("versions:read")
  async findAll(@Param("projectKey") projectKey: string, @Query() query: QueryVersionsDto) {
    return this.versionsService.findAll(projectKey, query)
  }

  @Get("_status")
  @RequireApiScope("versions:read")
  getModuleStatus(): { module: string; implemented: boolean } {
    return this.versionsService.getStatus()
  }

  @Get("github-release-preview")
  @RequireApiScope("versions:read")
  async previewFromGithubRelease(
    @Param("projectKey") projectKey: string,
    @Query() query: PreviewGithubReleaseDto,
  ) {
    return this.githubReleaseService.previewFromGithubRelease(projectKey, query)
  }

  @Post("github-release-import")
  @RequireApiScope("versions:write")
  async importFromGithubRelease(@Param("projectKey") projectKey: string) {
    return this.githubReleaseService.importFromGithubReleases(projectKey)
  }

  @Get(":id")
  @RequireApiScope("versions:read")
  async findOne(@Param("projectKey") projectKey: string, @Param("id") id: string) {
    return this.versionsService.findOne(projectKey, id)
  }

  @Post()
  @RequireApiScope("versions:write")
  async create(@Param("projectKey") projectKey: string, @Body() dto: CreateVersionDto) {
    return this.versionsService.create(projectKey, dto)
  }

  @Put("by-version/:version")
  @HttpCode(200)
  @RequireApiScope("versions:write")
  async upsertByVersion(
    @Param("projectKey") projectKey: string,
    @Param("version") version: string,
    @Body() dto: UpsertVersionDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { item, created } = await this.versionsService.upsertByVersion(projectKey, version, dto)
    res.status(created ? 201 : 200)
    return item
  }

  @Patch(":id")
  @RequireApiScope("versions:write")
  async update(
    @Param("projectKey") projectKey: string,
    @Param("id") id: string,
    @Body() dto: UpdateVersionDto,
  ) {
    return this.versionsService.update(projectKey, id, dto)
  }

  @Delete(":id")
  @RequireApiScope("versions:write")
  async remove(@Param("projectKey") projectKey: string, @Param("id") id: string) {
    await this.versionsService.remove(projectKey, id)
    return {
      success: true,
    }
  }
}
