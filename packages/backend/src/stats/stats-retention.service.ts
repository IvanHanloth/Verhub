import { Injectable, Logger } from "@nestjs/common"
import { Cron, CronExpression } from "@nestjs/schedule"

import { PrismaService } from "../database/prisma.service"
import { nowSeconds } from "../common/utils"
import { DAY_SECONDS, toHourBucket } from "./request-stats.service"

/** Hard ceiling on retention, matching the documented "at most one year" policy. */
export const MAX_STATS_RETENTION_DAYS = 365
export const MIN_STATS_RETENTION_DAYS = 1

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
      select: { projectKey: true, statsRetentionDays: true },
    })

    const now = nowSeconds()
    let deleted = 0

    for (const project of projects) {
      const retentionDays = this.clampRetentionDays(project.statsRetentionDays)
      const cutoff = toHourBucket(now - retentionDays * DAY_SECONDS)

      const result = await this.prisma.apiRequestStat.deleteMany({
        where: { projectKey: project.projectKey, hourBucket: { lt: cutoff } },
      })
      deleted += result.count
    }

    if (deleted > 0) {
      this.logger.log(`Purged ${deleted} expired request stat rows`)
    }

    return deleted
  }

  private clampRetentionDays(days: number): number {
    if (!Number.isFinite(days)) {
      return MAX_STATS_RETENTION_DAYS
    }
    return Math.min(Math.max(Math.trunc(days), MIN_STATS_RETENTION_DAYS), MAX_STATS_RETENTION_DAYS)
  }
}
