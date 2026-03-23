import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common"

import { CheckVersionUpdateDto } from "./dto/check-version-update.dto"
import { QueryVersionsDto } from "./dto/query-versions.dto"
import { VersionsService } from "./versions.service"

@Controller("public/:projectKey/versions")
export class VersionsPublicController {
  constructor(private readonly versionsService: VersionsService) {}

  @Get()
  async findAllByProjectKey(
    @Param("projectKey") projectKey: string,
    @Query() query: QueryVersionsDto,
  ) {
    return this.versionsService.findAllByProjectKey(projectKey, query)
  }

  @Get("latest")
  async findLatestByProjectKey(@Param("projectKey") projectKey: string) {
    return this.versionsService.findLatestByProjectKey(projectKey)
  }

  @Get("latest-preview")
  async findLatestPreviewByProjectKey(@Param("projectKey") projectKey: string) {
    return this.versionsService.findLatestPreviewByProjectKey(projectKey)
  }

  @Get("by-version/:version")
  async findOneByVersion(
    @Param("projectKey") projectKey: string,
    @Param("version") version: string,
  ) {
    return this.versionsService.findByVersionNumber(projectKey, decodeURIComponent(version))
  }

  @Post("check-update")
  async checkUpdate(@Param("projectKey") projectKey: string, @Body() dto: CheckVersionUpdateDto) {
    return this.versionsService.checkUpdateByProjectKey(projectKey, dto)
  }
}
