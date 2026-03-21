import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common"

import { JwtAdminGuard } from "../auth/guards/jwt-admin.guard"

import { CreateAnnouncementDto } from "./dto/create-announcement.dto"
import { QueryAnnouncementsDto } from "./dto/query-announcements.dto"
import { UpdateAnnouncementDto } from "./dto/update-announcement.dto"
import { AnnouncementsService } from "./announcements.service"

@Controller("admin/projects/:projectKey/announcements")
@UseGuards(JwtAdminGuard)
export class AnnouncementsController {
  constructor(private readonly announcementsService: AnnouncementsService) {}

  @Get()
  async findAll(@Param("projectKey") projectKey: string, @Query() query: QueryAnnouncementsDto) {
    return this.announcementsService.findAll(projectKey, query)
  }

  @Get("_status")
  getModuleStatus(): { module: string; implemented: boolean } {
    return this.announcementsService.getStatus()
  }

  @Get(":id")
  async findOne(@Param("projectKey") projectKey: string, @Param("id") id: string) {
    return this.announcementsService.findOne(projectKey, id)
  }

  @Post()
  async create(@Param("projectKey") projectKey: string, @Body() dto: CreateAnnouncementDto) {
    return this.announcementsService.create(projectKey, dto)
  }

  @Patch(":id")
  async update(
    @Param("projectKey") projectKey: string,
    @Param("id") id: string,
    @Body() dto: UpdateAnnouncementDto,
  ) {
    return this.announcementsService.update(projectKey, id, dto)
  }

  @Delete(":id")
  async remove(@Param("projectKey") projectKey: string, @Param("id") id: string) {
    await this.announcementsService.remove(projectKey, id)
    return {
      success: true,
    }
  }
}
