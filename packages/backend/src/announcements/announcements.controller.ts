import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common"

import { AdminOrApiKeyGuard } from "../auth/guards/admin-or-api-key.guard"
import { RequireApiScope } from "../auth/guards/api-scope.decorator"

import { CreateAnnouncementDto } from "./dto/create-announcement.dto"
import { QueryAnnouncementsDto } from "./dto/query-announcements.dto"
import { UpdateAnnouncementDto } from "./dto/update-announcement.dto"
import { AnnouncementsService } from "./announcements.service"

@Controller("admin/projects/:projectKey/announcements")
@UseGuards(AdminOrApiKeyGuard)
export class AnnouncementsController {
  constructor(private readonly announcementsService: AnnouncementsService) {}

  @Get()
  @RequireApiScope("announcements:read")
  async findAll(@Param("projectKey") projectKey: string, @Query() query: QueryAnnouncementsDto) {
    return this.announcementsService.findAll(projectKey, query)
  }

  @Get("_status")
  @RequireApiScope("announcements:read")
  getModuleStatus(): { module: string; implemented: boolean } {
    return this.announcementsService.getStatus()
  }

  @Get(":id")
  @RequireApiScope("announcements:read")
  async findOne(@Param("projectKey") projectKey: string, @Param("id") id: string) {
    return this.announcementsService.findOne(projectKey, id)
  }

  @Post()
  @RequireApiScope("announcements:write")
  async create(@Param("projectKey") projectKey: string, @Body() dto: CreateAnnouncementDto) {
    return this.announcementsService.create(projectKey, dto)
  }

  @Patch(":id")
  @RequireApiScope("announcements:write")
  async update(
    @Param("projectKey") projectKey: string,
    @Param("id") id: string,
    @Body() dto: UpdateAnnouncementDto,
  ) {
    return this.announcementsService.update(projectKey, id, dto)
  }

  @Delete(":id")
  @RequireApiScope("announcements:write")
  async remove(@Param("projectKey") projectKey: string, @Param("id") id: string) {
    await this.announcementsService.remove(projectKey, id)
    return {
      success: true,
    }
  }
}
