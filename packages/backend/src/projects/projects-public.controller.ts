import { Controller, Get, Param, Query } from "@nestjs/common"
import { PublicEndpoint } from "@prisma/client"

import { TrackEndpoint } from "../stats/track-endpoint.decorator"

import { QueryPublicProjectDto } from "./dto/query-public-project.dto"
import { ProjectsService } from "./projects.service"

@Controller("public")
export class ProjectsPublicController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Get(":projectKey")
  @TrackEndpoint(PublicEndpoint.PROJECT_DETAIL)
  async findOneByProjectKey(
    @Param("projectKey") projectKey: string,
    @Query() query: QueryPublicProjectDto,
  ) {
    return this.projectsService.findOneByProjectKey(projectKey, query.locale)
  }
}
