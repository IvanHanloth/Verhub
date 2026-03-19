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

import { JwtAdminGuard } from "../auth/guards/jwt-admin.guard"
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

  @Get("admin/projects/:projectId/actions")
  @UseGuards(JwtAdminGuard)
  async findAllByProject(@Param("projectId") projectId: string, @Query() query: QueryActionsDto) {
    return this.actionsService.findAllByProject(projectId, query)
  }

  @Post("admin/projects/actions")
  @UseGuards(JwtAdminGuard)
  async create(@Body() dto: CreateActionDto) {
    return this.actionsService.create(dto)
  }

  @Get("admin/actions/record/:action_record_id")
  @UseGuards(JwtAdminGuard)
  async findRecord(@Param("action_record_id") recordId: string) {
    return this.actionsService.findRecord(recordId)
  }

  @Get("admin/actions/statistics")
  @UseGuards(JwtAdminGuard)
  async getActionStatistics() {
    return this.actionsService.getActionStatistics()
  }

  @Get("admin/actions/record/statistics")
  @UseGuards(JwtAdminGuard)
  async getActionRecordStatistics() {
    return this.actionsService.getActionRecordStatistics()
  }

  @Get("admin/actions/:action_id")
  @UseGuards(JwtAdminGuard)
  async findRecordsByAction(@Param("action_id") actionId: string, @Query() query: QueryActionsDto) {
    return this.actionsService.findRecordsByAction(actionId, query)
  }

  @Patch("admin/actions/:action_id")
  @UseGuards(JwtAdminGuard)
  async update(@Param("action_id") actionId: string, @Body() dto: UpdateActionDto) {
    return this.actionsService.update(actionId, dto)
  }

  @Delete("admin/actions/:action_id")
  @UseGuards(JwtAdminGuard)
  async remove(@Param("action_id") actionId: string) {
    await this.actionsService.remove(actionId)
    return { success: true }
  }

  @Post("public/:projectKey/actions")
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
