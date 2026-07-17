import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common"

import { AdminOrApiKeyGuard } from "../auth/guards/admin-or-api-key.guard"
import { RequireApiScope } from "../auth/guards/api-scope.decorator"
import { PublicEndpoint } from "@prisma/client"

import { TrackEndpoint } from "../stats/track-endpoint.decorator"
import { CreateActionDto } from "./dto/create-action.dto"
import { CreateActionRecordDto } from "./dto/create-action-record.dto"
import { QueryActionsDto } from "./dto/query-actions.dto"
import { UpdateActionDto } from "./dto/update-action.dto"
import { ActionsService } from "./actions.service"

type PublicActionRequest = {
  headers: Record<string, string | string[] | undefined>
  method?: string
  body?: unknown
}

@Controller()
export class ActionsController {
  constructor(private readonly actionsService: ActionsService) {}

  @Get("admin/projects/:projectKey/actions")
  @UseGuards(AdminOrApiKeyGuard)
  @RequireApiScope("actions:read")
  async findAllByProject(@Param("projectKey") projectKey: string, @Query() query: QueryActionsDto) {
    return this.actionsService.findAllByProject(projectKey, query)
  }

  @Post("admin/projects/actions")
  @UseGuards(AdminOrApiKeyGuard)
  @RequireApiScope("actions:write")
  async create(@Body() dto: CreateActionDto) {
    return this.actionsService.create(dto)
  }

  @Get("admin/actions/statistics")
  @UseGuards(AdminOrApiKeyGuard)
  @RequireApiScope("actions:read")
  async getActionStatistics() {
    return this.actionsService.getActionStatistics()
  }

  @Get("admin/actions/record/statistics")
  @UseGuards(AdminOrApiKeyGuard)
  @RequireApiScope("actions:read")
  async getActionRecordStatistics() {
    return this.actionsService.getActionRecordStatistics()
  }

  @Get("admin/actions/record/:action_record_id")
  @UseGuards(AdminOrApiKeyGuard)
  @RequireApiScope("actions:read")
  async findRecord(@Param("action_record_id") recordId: string) {
    return this.actionsService.findRecord(recordId)
  }

  @Get("admin/actions/:action_id")
  @UseGuards(AdminOrApiKeyGuard)
  @RequireApiScope("actions:read")
  async findRecordsByAction(@Param("action_id") actionId: string, @Query() query: QueryActionsDto) {
    return this.actionsService.findRecordsByAction(actionId, query)
  }

  @Patch("admin/actions/:action_id")
  @UseGuards(AdminOrApiKeyGuard)
  @RequireApiScope("actions:write")
  async update(@Param("action_id") actionId: string, @Body() dto: UpdateActionDto) {
    return this.actionsService.update(actionId, dto)
  }

  @Delete("admin/actions/:action_id")
  @UseGuards(AdminOrApiKeyGuard)
  @RequireApiScope("actions:write")
  async remove(@Param("action_id") actionId: string) {
    await this.actionsService.remove(actionId)
    return { success: true }
  }

  @Post("public/:projectKey/actions")
  @TrackEndpoint(PublicEndpoint.ACTION_RECORD)
  async createRecordByProjectKey(
    @Param("projectKey") projectKey: string,
    @Body() dto: CreateActionRecordDto,
    @Req() request: PublicActionRequest,
  ) {
    const httpPayload = {
      method: request.method ?? null,
      ua: request.headers["user-agent"] ?? null,
      header: request.headers,
      body: request.body ?? null,
    }

    return this.actionsService.createRecordByProjectKey(projectKey, dto, httpPayload)
  }

  @Get("actions/_status")
  getModuleStatus(): { module: string; implemented: boolean } {
    return this.actionsService.getStatus()
  }
}
