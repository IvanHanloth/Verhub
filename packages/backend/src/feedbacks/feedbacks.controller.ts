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
import type { Request } from "express"

import { AdminOrApiKeyGuard } from "../auth/guards/admin-or-api-key.guard"
import { RequireApiScope } from "../auth/guards/api-scope.decorator"
import { PublicEndpoint } from "@prisma/client"

import { ClientOriginService } from "../geo/client-origin.service"
import { ClientIpThrottlerGuard } from "../common/client-ip-throttler.guard"
import { TrackEndpoint } from "../stats/track-endpoint.decorator"

import { CreateFeedbackDto } from "./dto/create-feedback.dto"
import { QueryFeedbacksDto } from "./dto/query-feedbacks.dto"
import { UpdateFeedbackDto } from "./dto/update-feedback.dto"
import { FeedbacksService } from "./feedbacks.service"

@Controller()
export class FeedbacksController {
  constructor(
    private readonly feedbacksService: FeedbacksService,
    private readonly clientOriginService: ClientOriginService,
  ) {}

  @Get("admin/projects/:projectKey/feedbacks")
  @UseGuards(AdminOrApiKeyGuard)
  @RequireApiScope("feedbacks:read")
  async findAll(@Param("projectKey") projectKey: string, @Query() query: QueryFeedbacksDto) {
    return this.feedbacksService.findAll(projectKey, query)
  }

  @Get("admin/projects/:projectKey/feedbacks/:id")
  @UseGuards(AdminOrApiKeyGuard)
  @RequireApiScope("feedbacks:read")
  async findOne(@Param("projectKey") projectKey: string, @Param("id") id: string) {
    return this.feedbacksService.findOne(projectKey, id)
  }

  @Post("admin/projects/:projectKey/feedbacks")
  @UseGuards(AdminOrApiKeyGuard)
  @RequireApiScope("feedbacks:write")
  async createByAdmin(@Param("projectKey") projectKey: string, @Body() dto: CreateFeedbackDto) {
    return this.feedbacksService.createByAdmin(projectKey, dto)
  }

  @Patch("admin/projects/:projectKey/feedbacks/:id")
  @UseGuards(AdminOrApiKeyGuard)
  @RequireApiScope("feedbacks:write")
  async update(
    @Param("projectKey") projectKey: string,
    @Param("id") id: string,
    @Body() dto: UpdateFeedbackDto,
  ) {
    return this.feedbacksService.update(projectKey, id, dto)
  }

  @Delete("admin/projects/:projectKey/feedbacks/:id")
  @UseGuards(AdminOrApiKeyGuard)
  @RequireApiScope("feedbacks:write")
  async remove(@Param("projectKey") projectKey: string, @Param("id") id: string) {
    await this.feedbacksService.remove(projectKey, id)
    return {
      success: true,
    }
  }

  @Post("public/:projectKey/feedbacks")
  @UseGuards(ClientIpThrottlerGuard)
  @TrackEndpoint(PublicEndpoint.FEEDBACK_SUBMIT)
  async createByProjectKey(
    @Param("projectKey") projectKey: string,
    @Body() dto: CreateFeedbackDto,
    @Req() request: Request,
  ) {
    const origin = await this.clientOriginService.describe(request)
    return this.feedbacksService.createByProjectKey(projectKey, dto, origin)
  }

  @Get("admin/feedbacks/statistics")
  @UseGuards(AdminOrApiKeyGuard)
  @RequireApiScope("feedbacks:read")
  async getStatistics() {
    return this.feedbacksService.getStatistics()
  }

  @Get("feedbacks/_status")
  getModuleStatus(): { module: string; implemented: boolean } {
    return this.feedbacksService.getStatus()
  }
}
