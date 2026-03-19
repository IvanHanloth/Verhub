import { Body, Controller, Delete, Param, Patch, UseGuards } from "@nestjs/common"

import { JwtAdminGuard } from "../auth/guards/jwt-admin.guard"
import { UpdateFeedbackDto } from "./dto/update-feedback.dto"
import { FeedbacksService } from "./feedbacks.service"

@Controller("admin")
@UseGuards(JwtAdminGuard)
export class FeedbacksCompatController {
  constructor(private readonly feedbacksService: FeedbacksService) {}

  @Patch("feedbacks/:feedback_id")
  async updateById(@Param("feedback_id") feedbackId: string, @Body() dto: UpdateFeedbackDto) {
    return this.feedbacksService.updateById(feedbackId, dto)
  }

  @Delete("feedbacks/:feedback_id")
  async removeById(@Param("feedback_id") feedbackId: string) {
    await this.feedbacksService.removeById(feedbackId)
    return { success: true }
  }
}
