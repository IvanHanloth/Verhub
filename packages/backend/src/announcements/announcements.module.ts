import { Module } from "@nestjs/common"

import { AuthModule } from "../auth/auth.module"
import { AnnouncementsController } from "./announcements.controller"
import { AnnouncementsService } from "./announcements.service"

@Module({
  imports: [AuthModule],
  controllers: [AnnouncementsController],
  providers: [AnnouncementsService],
  exports: [AnnouncementsService],
})
export class AnnouncementsModule {}
