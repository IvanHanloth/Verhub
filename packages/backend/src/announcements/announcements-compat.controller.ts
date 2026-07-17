import { Body, Controller, Delete, Param, Patch, Post, UseGuards } from "@nestjs/common"

import { AdminOrApiKeyGuard } from "../auth/guards/admin-or-api-key.guard"
import { RequireApiScope } from "../auth/guards/api-scope.decorator"
import { CreateProjectAnnouncementDto } from "./dto/create-project-announcement.dto"
import { UpdateAnnouncementDto } from "./dto/update-announcement.dto"
import { AnnouncementsService } from "./announcements.service"

@Controller("admin")
@UseGuards(AdminOrApiKeyGuard)
export class AnnouncementsCompatController {
  constructor(private readonly announcementsService: AnnouncementsService) {}

  @Post("projects/announcements")
  @RequireApiScope("announcements:write")
  async createByProjectKey(@Body() dto: CreateProjectAnnouncementDto) {
    return this.announcementsService.createByProjectKey(dto.project_key, dto)
  }

  @Patch("announcements/:announcement_id")
  @RequireApiScope("announcements:write")
  async updateById(
    @Param("announcement_id") announcementId: string,
    @Body() dto: UpdateAnnouncementDto,
  ) {
    return this.announcementsService.updateById(announcementId, dto)
  }

  @Delete("announcements/:announcement_id")
  @RequireApiScope("announcements:write")
  async removeById(@Param("announcement_id") announcementId: string) {
    await this.announcementsService.removeById(announcementId)
    return { success: true }
  }
}
