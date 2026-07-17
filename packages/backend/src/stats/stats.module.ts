import { Module } from "@nestjs/common"
import { APP_INTERCEPTOR } from "@nestjs/core"

import { AuthModule } from "../auth/auth.module"
import { RequestStatsController } from "./request-stats.controller"
import { RequestStatsInterceptor } from "./request-stats.interceptor"
import { RequestStatsService } from "./request-stats.service"
import { StatsRetentionService } from "./stats-retention.service"

@Module({
  imports: [AuthModule],
  controllers: [RequestStatsController],
  providers: [
    RequestStatsService,
    StatsRetentionService,
    // Registered globally so every route marked with @TrackEndpoint is counted,
    // regardless of which module declares it.
    {
      provide: APP_INTERCEPTOR,
      useClass: RequestStatsInterceptor,
    },
  ],
  exports: [RequestStatsService, StatsRetentionService],
})
export class StatsModule {}
