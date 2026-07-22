import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from "@nestjs/common"
import type { Request } from "express"

import { AdminOrApiKeyGuard } from "../auth/guards/admin-or-api-key.guard"
import { RequireApiScope } from "../auth/guards/api-scope.decorator"
import { PublicEndpoint } from "@prisma/client"

import { ClientOriginService } from "../geo/client-origin.service"
import { TrackEndpoint } from "../stats/track-endpoint.decorator"

import { CreateLogDto } from "./dto/create-log.dto"
import { QueryLogsDto } from "./dto/query-logs.dto"
import { UploadLogDto } from "./dto/upload-log.dto"
import { LogsService } from "./logs.service"

@Controller()
export class LogsController {
  constructor(
    private readonly logsService: LogsService,
    private readonly clientOriginService: ClientOriginService,
  ) {}

  @Get("admin/projects/:projectKey/logs")
  @UseGuards(AdminOrApiKeyGuard)
  @RequireApiScope("logs:read")
  async findAll(@Param("projectKey") projectKey: string, @Query() query: QueryLogsDto) {
    return this.logsService.findAll(projectKey, query)
  }

  @Post("admin/projects/:projectKey/logs")
  @UseGuards(AdminOrApiKeyGuard)
  @RequireApiScope("logs:write")
  async createByAdmin(@Param("projectKey") projectKey: string, @Body() dto: CreateLogDto) {
    return this.logsService.createByAdmin(projectKey, dto)
  }

  @Post("public/:projectKey/logs")
  @TrackEndpoint(PublicEndpoint.LOG_UPLOAD)
  async createByProjectKey(
    @Param("projectKey") projectKey: string,
    @Body() dto: UploadLogDto,
    @Req() request: Request,
  ) {
    // Awaited rather than fire-and-forget: the origin fields belong to the row
    // being written, and a log without them is the one you cannot triage.
    const origin = await this.clientOriginService.describe(request)
    return this.logsService.createByProjectKey(projectKey, dto, origin)
  }

  @Get("admin/logs/statistics")
  @UseGuards(AdminOrApiKeyGuard)
  @RequireApiScope("logs:read")
  async getStatistics() {
    return this.logsService.getStatistics()
  }

  @Get("logs/_status")
  getModuleStatus(): { module: string; implemented: boolean } {
    return this.logsService.getStatus()
  }
}
