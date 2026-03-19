import { Controller, Get, Param, Query } from "@nestjs/common"

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
}
