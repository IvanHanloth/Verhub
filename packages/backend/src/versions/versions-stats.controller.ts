import { Controller, Get, UseGuards } from "@nestjs/common"

import { AdminOrApiKeyGuard } from "../auth/guards/admin-or-api-key.guard"
import { RequireApiScope } from "../auth/guards/api-scope.decorator"
import { VersionsService } from "./versions.service"

@Controller("admin/versions")
@UseGuards(AdminOrApiKeyGuard)
export class VersionsStatsController {
  constructor(private readonly versionsService: VersionsService) {}

  @Get("statistics")
  @RequireApiScope("versions:read")
  async getStatistics() {
    return this.versionsService.getStatistics()
  }
}
