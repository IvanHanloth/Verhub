import { Controller, Get, Param } from "@nestjs/common"

import { ProjectsService } from "./projects.service"

@Controller("public")
export class ProjectsPublicController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Get(":projectKey")
  async findOneByProjectKey(@Param("projectKey") projectKey: string) {
    return this.projectsService.findOneByProjectKey(projectKey)
  }
}
