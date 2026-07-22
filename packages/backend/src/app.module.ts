import { Module } from "@nestjs/common"
import { ConfigModule } from "@nestjs/config"
import { ScheduleModule } from "@nestjs/schedule"

import { ActionsModule } from "./actions/actions.module"
import { AnnouncementsModule } from "./announcements/announcements.module"
import { AuthModule } from "./auth/auth.module"
import { DatabaseModule } from "./database/database.module"
import { FeedbacksModule } from "./feedbacks/feedbacks.module"
import { GeoModule } from "./geo/geo.module"
import { HealthModule } from "./health/health.module"
import { LogsModule } from "./logs/logs.module"
import { ProjectsModule } from "./projects/projects.module"
import { StatsModule } from "./stats/stats.module"
import { VersionsModule } from "./versions/versions.module"
import { WebhooksModule } from "./webhooks/webhooks.module"

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ScheduleModule.forRoot(),
    DatabaseModule,
    GeoModule,
    HealthModule,
    AuthModule,
    ProjectsModule,
    VersionsModule,
    AnnouncementsModule,
    FeedbacksModule,
    LogsModule,
    ActionsModule,
    StatsModule,
    WebhooksModule,
  ],
})
export class AppModule {}
