import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common"

import { AdminOrApiKeyGuard } from "../auth/guards/admin-or-api-key.guard"
import { JwtAdminGuard } from "../auth/guards/jwt-admin.guard"

import { CreateVersionDto } from "./dto/create-version.dto"
import { QueryVersionsDto } from "./dto/query-versions.dto"
import { UpdateVersionDto } from "./dto/update-version.dto"
import { VersionsService } from "./versions.service"

@Controller("admin/projects/:projectId/versions")
export class VersionsController {
  constructor(private readonly versionsService: VersionsService) {}

  @Get()
  @UseGuards(JwtAdminGuard)
  async findAll(@Param("projectId") projectId: string, @Query() query: QueryVersionsDto) {
    return this.versionsService.findAll(projectId, query)
  }

  @Get("_status")
  @UseGuards(JwtAdminGuard)
  getModuleStatus(): { module: string; implemented: boolean } {
    return this.versionsService.getStatus()
  }

  @Get(":id")
  @UseGuards(JwtAdminGuard)
  async findOne(@Param("projectId") projectId: string, @Param("id") id: string) {
    return this.versionsService.findOne(projectId, id)
  }

  @Post()
  @UseGuards(AdminOrApiKeyGuard)
  async create(@Param("projectId") projectId: string, @Body() dto: CreateVersionDto) {
    return this.versionsService.create(projectId, dto)
  }

  @Patch(":id")
  @UseGuards(JwtAdminGuard)
  async update(
    @Param("projectId") projectId: string,
    @Param("id") id: string,
    @Body() dto: UpdateVersionDto,
  ) {
    return this.versionsService.update(projectId, id, dto)
  }

  @Delete(":id")
  @UseGuards(JwtAdminGuard)
  async remove(@Param("projectId") projectId: string, @Param("id") id: string) {
    await this.versionsService.remove(projectId, id)
    return {
      success: true,
    }
  }
}
