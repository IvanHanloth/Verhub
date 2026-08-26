import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common"
import { PublicEndpoint } from "@prisma/client"

import { ClientIpThrottlerGuard } from "../common/client-ip-throttler.guard"
import { TrackEndpoint } from "../stats/track-endpoint.decorator"
import { CheckVersionUpdateDto } from "./dto/check-version-update.dto"
import { QueryVersionLocaleDto, QueryVersionsDto } from "./dto/query-versions.dto"
import { VersionUpdateCheckService } from "./version-update-check.service"
import { VersionsService } from "./versions.service"

@Controller("public/:projectKey/versions")
export class VersionsPublicController {
  constructor(
    private readonly versionsService: VersionsService,
    private readonly versionUpdateCheckService: VersionUpdateCheckService,
  ) {}

  @Get()
  @TrackEndpoint(PublicEndpoint.VERSION_LIST)
  async findAllByProjectKey(
    @Param("projectKey") projectKey: string,
    @Query() query: QueryVersionsDto,
  ) {
    return this.versionsService.findAllByProjectKey(projectKey, query)
  }

  @Get("latest")
  @TrackEndpoint(PublicEndpoint.VERSION_LATEST)
  async findLatestByProjectKey(
    @Param("projectKey") projectKey: string,
    @Query() query: QueryVersionLocaleDto,
  ) {
    return this.versionsService.findLatestByProjectKey(projectKey, query.locale)
  }

  @Get("latest-preview")
  @TrackEndpoint(PublicEndpoint.VERSION_LATEST_PREVIEW)
  async findLatestPreviewByProjectKey(
    @Param("projectKey") projectKey: string,
    @Query() query: QueryVersionLocaleDto,
  ) {
    return this.versionsService.findLatestPreviewByProjectKey(projectKey, query.locale)
  }

  @Get("by-version/:version")
  @TrackEndpoint(PublicEndpoint.VERSION_BY_VERSION)
  async findOneByVersion(
    @Param("projectKey") projectKey: string,
    @Param("version") version: string,
    @Query() query: QueryVersionLocaleDto,
  ) {
    return this.versionsService.findByVersionNumber(
      projectKey,
      decodeURIComponent(version),
      query.locale,
    )
  }

  @Post("check-update")
  @UseGuards(ClientIpThrottlerGuard)
  @TrackEndpoint(PublicEndpoint.VERSION_CHECK_UPDATE)
  async checkUpdate(@Param("projectKey") projectKey: string, @Body() dto: CheckVersionUpdateDto) {
    return this.versionUpdateCheckService.checkUpdateByProjectKey(projectKey, dto)
  }
}
