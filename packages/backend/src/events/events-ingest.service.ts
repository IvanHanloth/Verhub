import { Injectable, Logger, NotFoundException } from "@nestjs/common"
import { Platform, Prisma } from "@prisma/client"

import { PrismaService } from "../database/prisma.service"
import { ProjectResolverService } from "../database/project-resolver.service"
import { nowSeconds } from "../common/utils"
import { toDayBucket, toHourBucket } from "../stats/bucket-utils"
import { UNKNOWN_REGION } from "../stats/request-stats.service"
import type { ClientOrigin } from "../geo/client-origin.service"
import { clampOccurredAt } from "./event-config"
import { normalizeEventName } from "./event-name"
import { applyEventIpStorage, resolveEventIpStorage } from "./ip-anonymize"
import type { IngestEventsDto } from "./dto/ingest-events.dto"

/**
 * 采集的返回体。
 *
 * 逐条回执而不是只回一个总数：客户端要据此决定队列里哪些条目可以丢弃。
 * `skipped` 里既有非法事件名，也有幂等键撞上的重复——两者对客户端是同一件事
 * （不必再发了），所以不区分。
 */
export type IngestResult = {
  accepted: number
  skipped: number
  /** 采集被关闭（项目开关或退出信号）时为 true，此时 accepted 恒为 0。 */
  suppressed: boolean
}

/** 服务端在事件明细里另行记录的来源，与 Log / Feedback 同源。 */
type ResolvedOrigin = ClientOrigin & { region: string; regionCode: string; cityCode: string }

@Injectable()
export class EventsIngestService {
  private readonly logger = new Logger(EventsIngestService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly projectResolver: ProjectResolverService,
  ) {}

  /**
   * 落一批事件。
   *
   * 顺序上先写明细再写汇总：明细是权威数据，汇总是可以重建的派生物。反过来的话
   * 汇总写成功而明细失败，会留下一个永远对不上账的计数。
   */
  async ingest(
    projectKey: string,
    dto: IngestEventsDto,
    origin: ClientOrigin,
    doNotTrack: boolean,
  ): Promise<IngestResult> {
    const normalizedProjectKey = await this.resolveProjectKey(projectKey)

    const project = await this.prisma.project.findUnique({
      where: { projectKey: normalizedProjectKey },
      select: { eventCollectionEnabled: true },
    })
    if (!project) {
      throw new NotFoundException("Project not found")
    }

    // 退出信号与项目开关都在做任何事之前检查：不入库、不计数、不解析地理位置。
    if (doNotTrack || !project.eventCollectionEnabled) {
      return { accepted: 0, skipped: dto.events.length, suppressed: true }
    }

    const receivedAt = nowSeconds()
    const storage = resolveEventIpStorage()
    const resolved: ResolvedOrigin = {
      ...origin,
      // 汇总表的维度列不接受 null，用与 ApiRequestStat 一致的哨兵。
      region: origin.countryCode ?? UNKNOWN_REGION,
      regionCode: "",
      cityCode: "",
    }

    const prepared = dto.events.flatMap((item) => {
      const name = normalizeEventName(item.name)
      return name ? [{ ...item, name }] : []
    })

    if (!prepared.length) {
      return { accepted: 0, skipped: dto.events.length, suppressed: false }
    }

    const rows = prepared.map((item) => ({
      projectKey: normalizedProjectKey,
      eventName: item.name,
      distinctId: dto.distinct_id,
      sessionId: dto.session_id ?? null,
      eventId: item.event_id,
      occurredAt: clampOccurredAt(item.occurred_at, receivedAt),
      receivedAt,
      properties: (item.properties ?? undefined) as Prisma.InputJsonValue | undefined,
      // 地理定位在 ClientOriginService 里已经用完整地址解析完了，这里只决定存什么。
      ip: applyEventIpStorage(origin.ip, storage),
      userAgent: origin.userAgent,
      countryCode: origin.countryCode,
      countryName: origin.countryName,
      regionName: origin.regionName,
      city: origin.city,
      platform: origin.platform,
      platformVersion: origin.platformVersion,
    }))

    const created = await this.prisma.eventRecord.createMany({ data: rows, skipDuplicates: true })

    // 只有真正入库的那部分才该进汇总，否则重试补发会把计数翻倍。整批都是重复时
    // 直接返回：后面的自增与登记都没有意义。
    if (created.count === 0) {
      return { accepted: 0, skipped: dto.events.length, suppressed: false }
    }

    // createMany 只回总数不回哪几条落了地。整批全新是绝大多数情况，此时按 rows
    // 统计是准的；部分重复时重新读一次拿到权威集合，宁可多一次查询也不写错计数。
    const persisted =
      created.count === rows.length ? rows : await this.readPersisted(normalizedProjectKey, rows)

    await this.registerDefinitions(normalizedProjectKey, persisted, receivedAt)
    this.recordRollupsSafely(normalizedProjectKey, persisted, resolved)

    return {
      accepted: created.count,
      skipped: dto.events.length - created.count,
      suppressed: false,
    }
  }

  /** 按 distinct_id 导出全部事件明细，供数据主体行使访问权与可携带权。 */
  async exportSubject(projectKey: string, distinctId: string) {
    const normalizedProjectKey = await this.resolveProjectKey(projectKey)

    const records = await this.prisma.eventRecord.findMany({
      where: { projectKey: normalizedProjectKey, distinctId },
      orderBy: { occurredAt: "asc" },
      select: {
        eventName: true,
        eventId: true,
        sessionId: true,
        occurredAt: true,
        receivedAt: true,
        properties: true,
        ip: true,
        userAgent: true,
        countryCode: true,
        countryName: true,
        regionName: true,
        city: true,
        platform: true,
        platformVersion: true,
      },
    })

    return {
      distinct_id: distinctId,
      total: records.length,
      data: records.map((record) => ({
        event_name: record.eventName,
        event_id: record.eventId,
        session_id: record.sessionId,
        occurred_at: record.occurredAt,
        received_at: record.receivedAt,
        properties: record.properties,
        ip: record.ip,
        user_agent: record.userAgent,
        country_code: record.countryCode,
        country_name: record.countryName,
        region_name: record.regionName,
        city: record.city,
        platform: record.platform,
        platform_version: record.platformVersion,
      })),
    }
  }

  /**
   * 按 distinct_id 删除全部可关联到该标识的数据。
   *
   * 只删明细与日活去重行。EventStat 不删：它是纯计数，不含任何标识符，时间精度
   * 为自然小时，无法回溯到具体设备或还原访问序列——按 GDPR Recital 26 属于匿名
   * 数据，不在个人数据的范围内。这条界线在隐私政策里有明示。
   */
  async deleteSubject(projectKey: string, distinctId: string): Promise<{ deleted: number }> {
    const normalizedProjectKey = await this.resolveProjectKey(projectKey)

    const [records] = await this.prisma.$transaction([
      this.prisma.eventRecord.deleteMany({
        where: { projectKey: normalizedProjectKey, distinctId },
      }),
      this.prisma.eventActiveUser.deleteMany({
        where: { projectKey: normalizedProjectKey, distinctId },
      }),
    ])

    return { deleted: records.count }
  }

  getStatus(): { module: string; implemented: boolean } {
    return { module: "events", implemented: true }
  }

  /** 部分重复时回读真正落库的那批，作为汇总的依据。 */
  private async readPersisted<T extends { eventId: string; receivedAt: number }>(
    projectKey: string,
    rows: T[],
  ): Promise<T[]> {
    const found = await this.prisma.eventRecord.findMany({
      where: { projectKey, eventId: { in: rows.map((row) => row.eventId) } },
      select: { eventId: true, receivedAt: true },
    })

    // 本次写入的行 receivedAt 就是这一批的时间戳，据此排掉早先已存在的同 eventId 行。
    const receivedAt = rows[0]?.receivedAt
    const fresh = new Set(
      found.filter((row) => row.receivedAt === receivedAt).map((row) => row.eventId),
    )
    return rows.filter((row) => fresh.has(row.eventId))
  }

  /**
   * 登记本批出现过的事件名，维护首末次出现时间。
   *
   * 这一步就是「注册」：客户端无需预先在后台建任何东西。用 upsert 而不是先查后写，
   * 并发的两个批次同时第一次报同一个事件时靠唯一索引兜底。
   */
  private async registerDefinitions(
    projectKey: string,
    rows: Array<{ eventName: string; occurredAt: number }>,
    receivedAt: number,
  ): Promise<void> {
    const names = new Map<string, number>()
    for (const row of rows) {
      names.set(row.eventName, Math.max(names.get(row.eventName) ?? 0, row.occurredAt))
    }

    for (const [name, lastSeenAt] of names) {
      try {
        await this.prisma.$executeRaw`
          INSERT INTO "EventDefinition" ("id", "projectKey", "name", "firstSeenAt", "lastSeenAt", "createdAt", "updatedAt")
          VALUES (gen_random_uuid()::text, ${projectKey}, ${name}, ${lastSeenAt}, ${lastSeenAt}, ${receivedAt}, ${receivedAt})
          ON CONFLICT ("projectKey", "name")
          DO UPDATE SET
            "firstSeenAt" = LEAST("EventDefinition"."firstSeenAt", ${lastSeenAt}),
            "lastSeenAt" = GREATEST("EventDefinition"."lastSeenAt", ${lastSeenAt}),
            "updatedAt" = ${receivedAt}
        `
      } catch (error: unknown) {
        // 登记只影响选择器里的显示，失败不该让已经落库的明细回滚。
        this.logger.warn(
          `Failed to register event definition ${projectKey}/${name}: ${message(error)}`,
        )
      }
    }
  }

  /**
   * 小时汇总与日活去重，尽力而为。
   *
   * 遥测失败不能让已经成功的上报请求失败——明细已经落库，汇总可以从明细重建。
   * 同 RequestStatsService 的 record*Safely。
   */
  private recordRollupsSafely(
    projectKey: string,
    rows: Array<{ eventName: string; occurredAt: number; distinctId: string }>,
    origin: ResolvedOrigin,
  ): void {
    void this.recordRollups(projectKey, rows, origin).catch((error: unknown) => {
      this.logger.warn(`Failed to record event rollups for ${projectKey}: ${message(error)}`)
    })
  }

  private async recordRollups(
    projectKey: string,
    rows: Array<{ eventName: string; occurredAt: number; distinctId: string }>,
    origin: ResolvedOrigin,
  ): Promise<void> {
    const distinctId = rows[0]?.distinctId
    if (!distinctId) {
      return
    }
    const platform = origin.platform ?? Platform.OTHERS

    // 先在内存里按 (事件名, 小时桶) 聚合再一桶一条 upsert。同一条语句里两行撞上
    // 同一个冲突目标会被 Postgres 拒绝（ON CONFLICT DO UPDATE 不能重复影响同一行），
    // 所以不能把整批直接展开成多值 INSERT。
    const buckets = new Map<string, { eventName: string; hourBucket: number; count: number }>()
    for (const row of rows) {
      const hourBucket = toHourBucket(row.occurredAt)
      const key = `${row.eventName} ${hourBucket}`
      const existing = buckets.get(key)
      if (existing) {
        existing.count += 1
      } else {
        buckets.set(key, { eventName: row.eventName, hourBucket, count: 1 })
      }
    }

    for (const bucket of buckets.values()) {
      await this.prisma.$executeRaw`
        INSERT INTO "EventStat" ("id", "projectKey", "eventName", "hourBucket", "platform", "region", "regionCode", "cityCode", "count")
        VALUES (
          gen_random_uuid()::text,
          ${projectKey},
          ${bucket.eventName},
          ${bucket.hourBucket},
          ${platform}::"Platform",
          ${origin.region},
          ${origin.regionCode},
          ${origin.cityCode},
          ${bucket.count}
        )
        ON CONFLICT ("projectKey", "eventName", "hourBucket", "platform", "region", "regionCode", "cityCode")
        DO UPDATE SET
          "count" = "EventStat"."count" + ${bucket.count},
          "updatedAt" = CAST(EXTRACT(EPOCH FROM now()) AS INTEGER)
      `
    }

    const days = new Set(rows.map((row) => toDayBucket(row.occurredAt)))
    for (const dayBucket of days) {
      await this.prisma.$executeRaw`
        INSERT INTO "EventActiveUser" ("id", "projectKey", "dayBucket", "distinctId")
        VALUES (gen_random_uuid()::text, ${projectKey}, ${dayBucket}, ${distinctId})
        ON CONFLICT ("projectKey", "dayBucket", "distinctId") DO NOTHING
      `
    }
  }

  /** 把外部 key 解析成当前项目的规范 key（含改名后的别名）；未命中抛 404。 */
  private resolveProjectKey(projectKey: string): Promise<string> {
    return this.projectResolver.resolveCanonicalKeyOrThrow(projectKey)
  }
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
