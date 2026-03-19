import { Controller, Get, UseGuards } from "@nestjs/common"

import { JwtAdminGuard } from "../auth/guards/jwt-admin.guard"
import { AnnouncementsService } from "./announcements.service"

@Controller("admin/announcements")
@UseGuards(JwtAdminGuard)
export class AnnouncementsStatsController {
  constructor(private readonly announcementsService: AnnouncementsService) {}

  @Get("statistics")
  async getStatistics() {
    return this.announcementsService.getStatistics()
  }
}
