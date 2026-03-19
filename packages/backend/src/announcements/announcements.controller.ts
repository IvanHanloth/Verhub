import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common"

import { JwtAdminGuard } from "../auth/guards/jwt-admin.guard"

import { CreateAnnouncementDto } from "./dto/create-announcement.dto"
import { QueryAnnouncementsDto } from "./dto/query-announcements.dto"
import { UpdateAnnouncementDto } from "./dto/update-announcement.dto"
import { AnnouncementsService } from "./announcements.service"

@Controller("admin/projects/:projectId/announcements")
@UseGuards(JwtAdminGuard)
export class AnnouncementsController {
  constructor(private readonly announcementsService: AnnouncementsService) {}

  @Get()
  async findAll(@Param("projectId") projectId: string, @Query() query: QueryAnnouncementsDto) {
    return this.announcementsService.findAll(projectId, query)
  }

  @Get("_status")
  getModuleStatus(): { module: string; implemented: boolean } {
    return this.announcementsService.getStatus()
  }

  @Get(":id")
  async findOne(@Param("projectId") projectId: string, @Param("id") id: string) {
    return this.announcementsService.findOne(projectId, id)
  }

  @Post()
  async create(@Param("projectId") projectId: string, @Body() dto: CreateAnnouncementDto) {
    return this.announcementsService.create(projectId, dto)
  }

  @Patch(":id")
  async update(
    @Param("projectId") projectId: string,
    @Param("id") id: string,
    @Body() dto: UpdateAnnouncementDto,
  ) {
    return this.announcementsService.update(projectId, id, dto)
  }

  @Delete(":id")
  async remove(@Param("projectId") projectId: string, @Param("id") id: string) {
    await this.announcementsService.remove(projectId, id)
    return {
      success: true,
    }
  }
}
