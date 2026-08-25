import { Injectable, Logger } from "@nestjs/common"
import { Cron, CronExpression } from "@nestjs/schedule"

import { PrismaService } from "../database/prisma.service"
import { nowSeconds } from "../common/utils"
import { DAY_SECONDS, toHourBucket } from "./bucket-utils"

/** Hard ceiling on retention, matching the documented "at most one year" policy. */
export const MAX_STATS_RETENTION_DAYS = 365
export const MIN_STATS_RETENTION_DAYS = 1

/**
 * 事件明细的保留期上限，与统计分开。
 *
 * 明细带 distinctId，是可关联到个人的高频数据；GDPR Art.5(1)(e) 的存储限制原则
 * 要求它不该与纯计数用同一个窗口。上限仍留到一年，是为了让确有长周期留存分析
 * 需求的运营者能自行放宽，但默认值（schema 里的 90 天）不鼓励这么做。
 */
export const MAX_EVENT_RETENTION_DAYS = 365
export const MIN_EVENT_RETENTION_DAYS = 1

@Injectable()
export class StatsRetentionService {
  private readonly logger = new Logger(StatsRetentionService.name)

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Drop statistics older than each project's retention window.
   *
   * Retention is per-project, so this deletes project by project rather than
   * with one global cutoff.
   */
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async purgeExpiredStats(): Promise<number> {
    const projects = await this.prisma.project.findMany({
      select: { projectKey: true, statsRetentionDays: true, eventRetentionDays: true },
    })

    const now = nowSeconds()
    let deleted = 0

    for (const project of projects) {
      const retentionDays = this.clampRetentionDays(project.statsRetentionDays)
      const cutoff = toHourBucket(now - retentionDays * DAY_SECONDS)

      // Client version rollups age out on the same per-project window; leaving
      // them behind would keep telemetry past the retention the project declared.
      // 事件量汇总也是纯计数，同一个窗口。
      const [requests, clientVersions, platformVersions, eventStats] = await Promise.all([
        this.prisma.apiRequestStat.deleteMany({
          where: { projectKey: project.projectKey, hourBucket: { lt: cutoff } },
        }),
        this.prisma.clientVersionStat.deleteMany({
          where: { projectKey: project.projectKey, hourBucket: { lt: cutoff } },
        }),
        this.prisma.platformVersionStat.deleteMany({
          where: { projectKey: project.projectKey, hourBucket: { lt: cutoff } },
        }),
        this.prisma.eventStat.deleteMany({
          where: { projectKey: project.projectKey, hourBucket: { lt: cutoff } },
        }),
      ])
      deleted += requests.count + clientVersions.count + platformVersions.count + eventStats.count

      // 事件明细走独立的、更短的窗口——它带 distinctId，与纯计数不是一类数据。
      const eventCutoff =
        now - this.clampEventRetentionDays(project.eventRetentionDays) * DAY_SECONDS
      const [eventRecords, activeUsers] = await Promise.all([
        this.prisma.eventRecord.deleteMany({
          where: { projectKey: project.projectKey, occurredAt: { lt: eventCutoff } },
        }),
        this.prisma.eventActiveUser.deleteMany({
          where: { projectKey: project.projectKey, dayBucket: { lt: eventCutoff } },
        }),
      ])
      deleted += eventRecords.count + activeUsers.count
    }

    if (deleted > 0) {
      this.logger.log(`Purged ${deleted} expired stat rows`)
    }

    return deleted
  }

  private clampRetentionDays(days: number): number {
    if (!Number.isFinite(days)) {
      return MAX_STATS_RETENTION_DAYS
    }
    return Math.min(Math.max(Math.trunc(days), MIN_STATS_RETENTION_DAYS), MAX_STATS_RETENTION_DAYS)
  }

  private clampEventRetentionDays(days: number): number {
    if (!Number.isFinite(days)) {
      return MAX_EVENT_RETENTION_DAYS
    }
    return Math.min(Math.max(Math.trunc(days), MIN_EVENT_RETENTION_DAYS), MAX_EVENT_RETENTION_DAYS)
  }
}
