import { Module } from "@nestjs/common"

import { AuthModule } from "../auth/auth.module"
import { FeedbacksController } from "./feedbacks.controller"
import { FeedbacksService } from "./feedbacks.service"

@Module({
  imports: [AuthModule],
  controllers: [FeedbacksController],
  providers: [FeedbacksService],
  exports: [FeedbacksService],
})
export class FeedbacksModule {}
