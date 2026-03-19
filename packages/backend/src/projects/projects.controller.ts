import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common"

import { JwtAdminGuard } from "../auth/guards/jwt-admin.guard"

import { CreateProjectDto } from "./dto/create-project.dto"
import { QueryProjectsDto } from "./dto/query-projects.dto"
import { UpdateProjectDto } from "./dto/update-project.dto"
import { ProjectsService } from "./projects.service"

@Controller("admin/projects")
@UseGuards(JwtAdminGuard)
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Get()
  async findAll(@Query() query: QueryProjectsDto) {
    return this.projectsService.findAll(query)
  }

  @Get("statistics")
  async getStatistics() {
    return this.projectsService.getStatistics()
  }

  @Get(":id")
  async findOne(@Param("id") id: string) {
    return this.projectsService.findOne(id)
  }

  @Post()
  async create(@Body() dto: CreateProjectDto) {
    return this.projectsService.create(dto)
  }

  @Patch(":id")
  async update(@Param("id") id: string, @Body() dto: UpdateProjectDto) {
    return this.projectsService.update(id, dto)
  }

  @Delete(":id")
  async remove(@Param("id") id: string) {
    await this.projectsService.remove(id)
    return {
      success: true,
    }
  }

  @Get("_status")
  getModuleStatus(): { module: string; implemented: boolean } {
    return this.projectsService.getStatus()
  }
}
