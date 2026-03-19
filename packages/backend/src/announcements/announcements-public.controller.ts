import { Controller, Get, Param, Query } from "@nestjs/common"

import { QueryAnnouncementsDto } from "./dto/query-announcements.dto"
import { AnnouncementsService } from "./announcements.service"

@Controller("public/:projectKey/announcements")
export class AnnouncementsPublicController {
  constructor(private readonly announcementsService: AnnouncementsService) {}

  @Get()
  async findAllByProjectKey(
    @Param("projectKey") projectKey: string,
    @Query() query: QueryAnnouncementsDto,
  ) {
    return this.announcementsService.findAllByProjectKey(projectKey, query)
  }

  @Get("latest")
  async findLatestByProjectKey(@Param("projectKey") projectKey: string) {
    return this.announcementsService.findLatestByProjectKey(projectKey)
  }
}
