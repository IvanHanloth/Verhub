import { Controller, Get, Param, Query } from "@nestjs/common"
import { PublicEndpoint } from "@prisma/client"

import { TrackEndpoint } from "../stats/track-endpoint.decorator"

import { QueryAnnouncementsDto } from "./dto/query-announcements.dto"
import { AnnouncementsService } from "./announcements.service"

@Controller("public/:projectKey/announcements")
export class AnnouncementsPublicController {
  constructor(private readonly announcementsService: AnnouncementsService) {}

  @Get()
  @TrackEndpoint(PublicEndpoint.ANNOUNCEMENT_LIST)
  async findAllByProjectKey(
    @Param("projectKey") projectKey: string,
    @Query() query: QueryAnnouncementsDto,
  ) {
    return this.announcementsService.findAllByProjectKey(projectKey, query)
  }

  @Get("latest")
  @TrackEndpoint(PublicEndpoint.ANNOUNCEMENT_LATEST)
  async findLatestByProjectKey(
    @Param("projectKey") projectKey: string,
    @Query() query: QueryAnnouncementsDto,
  ) {
    return this.announcementsService.findLatestByProjectKey(projectKey, query)
  }
}
