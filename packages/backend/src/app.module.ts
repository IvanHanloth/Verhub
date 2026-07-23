import { Module } from "@nestjs/common"
import { ConfigModule } from "@nestjs/config"
import { ScheduleModule } from "@nestjs/schedule"
import { ThrottlerModule } from "@nestjs/throttler"

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

/** 公开上报接口的限流窗口（毫秒）。 */
const PUBLIC_RATE_TTL_MS = 60_000

/**
 * 单 IP 每窗口允许的上报次数，来自 `VERHUB_PUBLIC_RATE_LIMIT`（默认 300/分钟）。
 *
 * 只挂在公开写接口上（见各 controller 的 ClientIpThrottlerGuard），不影响管理端
 * 与被 Next SSR 代理拉取的公开只读接口。默认值给得宽：单机洪泛是每秒上千级，
 * 300/分钟足以拦截，又不至于误伤共享出口 IP 后面的正常客户端。设 0 或非法值回退默认。
 */
function publicRateLimit(): number {
  const parsed = Number(process.env.VERHUB_PUBLIC_RATE_LIMIT)
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : 300
}

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ThrottlerModule.forRoot([{ ttl: PUBLIC_RATE_TTL_MS, limit: publicRateLimit() }]),
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
