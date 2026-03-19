import { Controller, Get, UseGuards } from "@nestjs/common"

import { JwtAdminGuard } from "../auth/guards/jwt-admin.guard"
import { VersionsService } from "./versions.service"

@Controller("admin/versions")
@UseGuards(JwtAdminGuard)
export class VersionsStatsController {
  constructor(private readonly versionsService: VersionsService) {}

  @Get("statistics")
  async getStatistics() {
    return this.versionsService.getStatistics()
  }
}
