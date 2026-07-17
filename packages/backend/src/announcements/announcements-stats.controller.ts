import { Controller, Get, UseGuards } from "@nestjs/common"

import { AdminOrApiKeyGuard } from "../auth/guards/admin-or-api-key.guard"
import { RequireApiScope } from "../auth/guards/api-scope.decorator"
import { AnnouncementsService } from "./announcements.service"

@Controller("admin/announcements")
@UseGuards(AdminOrApiKeyGuard)
export class AnnouncementsStatsController {
  constructor(private readonly announcementsService: AnnouncementsService) {}

  @Get("statistics")
  @RequireApiScope("announcements:read")
  async getStatistics() {
    return this.announcementsService.getStatistics()
  }
}
