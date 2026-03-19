import { Body, Controller, Delete, Param, Patch, Post, UseGuards } from "@nestjs/common"

import { JwtAdminGuard } from "../auth/guards/jwt-admin.guard"
import { CreateProjectAnnouncementDto } from "./dto/create-project-announcement.dto"
import { UpdateAnnouncementDto } from "./dto/update-announcement.dto"
import { AnnouncementsService } from "./announcements.service"

@Controller("admin")
@UseGuards(JwtAdminGuard)
export class AnnouncementsCompatController {
  constructor(private readonly announcementsService: AnnouncementsService) {}

  @Post("projects/announcements")
  async createByProjectKey(@Body() dto: CreateProjectAnnouncementDto) {
    return this.announcementsService.createByProjectKey(dto.project_key, dto)
  }

  @Patch("announcements/:announcement_id")
  async updateById(
    @Param("announcement_id") announcementId: string,
    @Body() dto: UpdateAnnouncementDto,
  ) {
    return this.announcementsService.updateById(announcementId, dto)
  }

  @Delete("announcements/:announcement_id")
  async removeById(@Param("announcement_id") announcementId: string) {
    await this.announcementsService.removeById(announcementId)
    return { success: true }
  }
}
