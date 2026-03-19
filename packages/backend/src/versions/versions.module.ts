import { Module } from "@nestjs/common"

import { AuthModule } from "../auth/auth.module"
import { VersionsCompatController } from "./versions-compat.controller"
import { VersionsController } from "./versions.controller"
import { VersionsPublicController } from "./versions-public.controller"
import { VersionsStatsController } from "./versions-stats.controller"
import { VersionsService } from "./versions.service"

@Module({
  imports: [AuthModule],
  controllers: [
    VersionsController,
    VersionsStatsController,
    VersionsCompatController,
    VersionsPublicController,
  ],
  providers: [VersionsService],
  exports: [VersionsService],
})
export class VersionsModule {}
