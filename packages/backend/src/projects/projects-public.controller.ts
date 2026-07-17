import { Controller, Get, Param } from "@nestjs/common"
import { PublicEndpoint } from "@prisma/client"

import { TrackEndpoint } from "../stats/track-endpoint.decorator"

import { ProjectsService } from "./projects.service"

@Controller("public")
export class ProjectsPublicController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Get(":projectKey")
  @TrackEndpoint(PublicEndpoint.PROJECT_DETAIL)
  async findOneByProjectKey(@Param("projectKey") projectKey: string) {
    return this.projectsService.findOneByProjectKey(projectKey)
  }
}
