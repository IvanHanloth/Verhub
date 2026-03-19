import { Module } from "@nestjs/common"
import { ConfigModule } from "@nestjs/config"

import { ActionsModule } from "./actions/actions.module"
import { AnnouncementsModule } from "./announcements/announcements.module"
import { AuthModule } from "./auth/auth.module"
import { DatabaseModule } from "./database/database.module"
import { FeedbacksModule } from "./feedbacks/feedbacks.module"
import { HealthModule } from "./health/health.module"
import { LogsModule } from "./logs/logs.module"
import { ProjectsModule } from "./projects/projects.module"
import { VersionsModule } from "./versions/versions.module"

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    DatabaseModule,
    HealthModule,
    AuthModule,
    ProjectsModule,
    VersionsModule,
    AnnouncementsModule,
    FeedbacksModule,
    LogsModule,
    ActionsModule,
  ],
})
export class AppModule {}
