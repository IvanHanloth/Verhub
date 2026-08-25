import { Injectable, NotFoundException } from "@nestjs/common"
import { Prisma } from "@prisma/client"

import { PrismaService } from "../database/prisma.service"
import { ProjectResolverService } from "../database/project-resolver.service"
import { nowSeconds } from "../common/utils"
import { searchContains } from "../common/query-filters"
import { toHourBucket, type StatsRange } from "../stats/bucket-utils"
import type { QueryEventDefinitionsDto, UpdateEventDefinitionDto } from "./dto/query-events.dto"

export type EventDefinitionItem = {
  event_definition_id: string
  project_key: string
  name: string
  display_name: string | null
  description: string | null
  archived: boolean
  first_seen_time: number
  last_seen_time: number
  /** 查询区间内的上报量，供选择器把常用事件排在前面。 */
  range_count: number
}

/**
 * 事件定义的读写。
 *
 * 这里没有 create：定义由采集端自动发现（见 EventsIngestService.registerDefinitions）。
 * 管理端能做的只是补充显示名与描述、把停用的事件归档。删除也只删定义本身，
 * 明细与汇总保留——否则一次误删就抹掉了历史数据，而且下一次上报又会把定义建回来。
 */
@Injectable()
export class EventsDefinitionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectResolver: ProjectResolverService,
  ) {}

  async findAll(
    projectKey: string,
    query: QueryEventDefinitionsDto,
    range: StatsRange,
  ): Promise<{ total: number; data: EventDefinitionItem[] }> {
    const key = await this.projectResolver.resolveCanonicalKeyOrThrow(projectKey)

    const where: Prisma.EventDefinitionWhereInput = {
      projectKey: key,
      ...(query.include_archived ? {} : { archived: false }),
      ...(query.search
        ? {
            OR: [
              { name: searchContains(query.search) },
              { displayName: searchContains(query.search) },
              { description: searchContains(query.search) },
            ],
          }
        : {}),
    }

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.eventDefinition.count({ where }),
      this.prisma.eventDefinition.findMany({
        where,
        take: query.limit,
        skip: query.offset,
        orderBy: { lastSeenAt: "desc" },
      }),
    ])

    const counts = await this.rangeCounts(
      key,
      range,
      rows.map((row) => row.name),
    )

    return {
      total,
      data: rows.map((row) => ({
        event_definition_id: row.id,
        project_key: key,
        name: row.name,
        display_name: row.displayName,
        description: row.description,
        archived: row.archived,
        first_seen_time: row.firstSeenAt,
        last_seen_time: row.lastSeenAt,
        range_count: counts.get(row.name) ?? 0,
      })),
    }
  }

  async update(definitionId: string, dto: UpdateEventDefinitionDto): Promise<EventDefinitionItem> {
    const existing = await this.prisma.eventDefinition.findUnique({ where: { id: definitionId } })
    if (!existing) {
      throw new NotFoundException("Event definition not found")
    }

    const updated = await this.prisma.eventDefinition.update({
      where: { id: definitionId },
      data: {
        displayName: dto.display_name,
        description: dto.description,
        archived: dto.archived,
        updatedAt: nowSeconds(),
      },
    })

    return {
      event_definition_id: updated.id,
      project_key: updated.projectKey,
      name: updated.name,
      display_name: updated.displayName,
      description: updated.description,
      archived: updated.archived,
      first_seen_time: updated.firstSeenAt,
      last_seen_time: updated.lastSeenAt,
      range_count: 0,
    }
  }

  async remove(definitionId: string): Promise<void> {
    const existing = await this.prisma.eventDefinition.findUnique({
      where: { id: definitionId },
      select: { id: true },
    })
    if (!existing) {
      throw new NotFoundException("Event definition not found")
    }
    await this.prisma.eventDefinition.delete({ where: { id: definitionId } })
  }

  /** 一次把当页所有事件的区间计数查出来，避免每行一次查询。 */
  private async rangeCounts(
    projectKey: string,
    range: StatsRange,
    names: string[],
  ): Promise<Map<string, number>> {
    if (!names.length) {
      return new Map()
    }

    const rows = await this.prisma.eventStat.groupBy({
      by: ["eventName"],
      _sum: { count: true },
      where: {
        projectKey,
        eventName: { in: names },
        hourBucket: { gte: toHourBucket(range.startTime), lte: range.endTime },
      },
    })

    return new Map(rows.map((row) => [row.eventName, row._sum.count ?? 0]))
  }
}
