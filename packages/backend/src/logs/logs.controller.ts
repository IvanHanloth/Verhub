import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common"

import { JwtAdminGuard } from "../auth/guards/jwt-admin.guard"

import { QueryLogsDto } from "./dto/query-logs.dto"
import { UploadLogDto } from "./dto/upload-log.dto"
import { LogsService } from "./logs.service"

@Controller()
export class LogsController {
  constructor(private readonly logsService: LogsService) {}

  @Get("admin/projects/:projectKey/logs")
  @UseGuards(JwtAdminGuard)
  async findAll(@Param("projectKey") projectKey: string, @Query() query: QueryLogsDto) {
    return this.logsService.findAll(projectKey, query)
  }

  @Post("public/:projectKey/logs")
  async createByProjectKey(@Param("projectKey") projectKey: string, @Body() dto: UploadLogDto) {
    return this.logsService.createByProjectKey(projectKey, dto)
  }

  @Get("admin/logs/statistics")
  @UseGuards(JwtAdminGuard)
  async getStatistics() {
    return this.logsService.getStatistics()
  }

  @Get("logs/_status")
  getModuleStatus(): { module: string; implemented: boolean } {
    return this.logsService.getStatus()
  }
}
