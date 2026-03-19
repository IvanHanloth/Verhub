import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common"

import { JwtAdminGuard } from "../auth/guards/jwt-admin.guard"

import { CreateFeedbackDto } from "./dto/create-feedback.dto"
import { QueryFeedbacksDto } from "./dto/query-feedbacks.dto"
import { UpdateFeedbackDto } from "./dto/update-feedback.dto"
import { FeedbacksService } from "./feedbacks.service"

@Controller()
export class FeedbacksController {
  constructor(private readonly feedbacksService: FeedbacksService) {}

  @Get("admin/projects/:projectId/feedbacks")
  @UseGuards(JwtAdminGuard)
  async findAll(@Param("projectId") projectId: string, @Query() query: QueryFeedbacksDto) {
    return this.feedbacksService.findAll(projectId, query)
  }

  @Get("admin/projects/:projectId/feedbacks/:id")
  @UseGuards(JwtAdminGuard)
  async findOne(@Param("projectId") projectId: string, @Param("id") id: string) {
    return this.feedbacksService.findOne(projectId, id)
  }

  @Patch("admin/projects/:projectId/feedbacks/:id")
  @UseGuards(JwtAdminGuard)
  async update(
    @Param("projectId") projectId: string,
    @Param("id") id: string,
    @Body() dto: UpdateFeedbackDto,
  ) {
    return this.feedbacksService.update(projectId, id, dto)
  }

  @Delete("admin/projects/:projectId/feedbacks/:id")
  @UseGuards(JwtAdminGuard)
  async remove(@Param("projectId") projectId: string, @Param("id") id: string) {
    await this.feedbacksService.remove(projectId, id)
    return {
      success: true,
    }
  }

  @Post("public/:projectKey/feedbacks")
  async createByProjectKey(@Param("projectKey") projectKey: string, @Body() dto: CreateFeedbackDto) {
    return this.feedbacksService.createByProjectKey(projectKey, dto)
  }

  @Get("feedbacks/_status")
  getModuleStatus(): { module: string; implemented: boolean } {
    return this.feedbacksService.getStatus()
  }
}
