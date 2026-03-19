import { Module } from "@nestjs/common"

import { AuthModule } from "../auth/auth.module"
import { AnnouncementsCompatController } from "./announcements-compat.controller"
import { AnnouncementsController } from "./announcements.controller"
import { AnnouncementsPublicController } from "./announcements-public.controller"
import { AnnouncementsStatsController } from "./announcements-stats.controller"
import { AnnouncementsService } from "./announcements.service"

@Module({
  imports: [AuthModule],
  controllers: [
    AnnouncementsController,
    AnnouncementsCompatController,
    AnnouncementsStatsController,
    AnnouncementsPublicController,
  ],
  providers: [AnnouncementsService],
  exports: [AnnouncementsService],
})
export class AnnouncementsModule {}
