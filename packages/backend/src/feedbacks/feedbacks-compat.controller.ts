import { Body, Controller, Delete, Param, Patch, UseGuards } from "@nestjs/common"

import { AdminOrApiKeyGuard } from "../auth/guards/admin-or-api-key.guard"
import { RequireApiScope } from "../auth/guards/api-scope.decorator"
import { UpdateFeedbackDto } from "./dto/update-feedback.dto"
import { FeedbacksService } from "./feedbacks.service"

@Controller("admin")
@UseGuards(AdminOrApiKeyGuard)
export class FeedbacksCompatController {
  constructor(private readonly feedbacksService: FeedbacksService) {}

  @Patch("feedbacks/:feedback_id")
  @RequireApiScope("feedbacks:write")
  async updateById(@Param("feedback_id") feedbackId: string, @Body() dto: UpdateFeedbackDto) {
    return this.feedbacksService.updateById(feedbackId, dto)
  }

  @Delete("feedbacks/:feedback_id")
  @RequireApiScope("feedbacks:write")
  async removeById(@Param("feedback_id") feedbackId: string) {
    await this.feedbacksService.removeById(feedbackId)
    return { success: true }
  }
}
