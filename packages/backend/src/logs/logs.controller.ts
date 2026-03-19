import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common"

import { JwtAdminGuard } from "../auth/guards/jwt-admin.guard"

import { QueryLogsDto } from "./dto/query-logs.dto"
import { UploadLogDto } from "./dto/upload-log.dto"
import { LogsService } from "./logs.service"

@Controller()
export class LogsController {
  constructor(private readonly logsService: LogsService) {}

  @Get("admin/projects/:projectId/logs")
  @UseGuards(JwtAdminGuard)
  async findAll(@Param("projectId") projectId: string, @Query() query: QueryLogsDto) {
    return this.logsService.findAll(projectId, query)
  }

  @Post("public/:projectKey/logs")
  async createByProjectKey(@Param("projectKey") projectKey: string, @Body() dto: UploadLogDto) {
    return this.logsService.createByProjectKey(projectKey, dto)
  }

  @Get("logs/_status")
  getModuleStatus(): { module: string; implemented: boolean } {
    return this.logsService.getStatus()
  }
}
