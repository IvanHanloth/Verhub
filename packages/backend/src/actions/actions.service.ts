import { Injectable, NotFoundException } from "@nestjs/common"
import { ClientPlatform, Prisma } from "@prisma/client"

import { PrismaService } from "../database/prisma.service"
import { buildDedupHash, resolveDedupWindowSeconds, stableStringify } from "../common/dedup"
import { normalizeProjectKey, nowSeconds } from "../common/utils"
import { fromClientPlatform } from "../versions/version-mapping"
import type { ClientOrigin } from "../geo/client-origin.service"
import { CreateActionDto } from "./dto/create-action.dto"
import { CreateActionRecordDto } from "./dto/create-action-record.dto"
import { QueryActionsDto } from "./dto/query-actions.dto"
import { UpdateActionDto } from "./dto/update-action.dto"

type ActionItem = {
  action_id: string
  project_key: string
  name: string
  description: string
  custom_data: Prisma.JsonValue | null
  created_time: number
}

type ActionRecordItem = {
  action_record_id: string
  action_id: string
  created_time: number
  http: Prisma.JsonValue | null
  custom_data: Prisma.JsonValue | null
  ip: string | null
  user_agent: string | null
  country_code: string | null
  country_name: string | null
  region_name: string | null
  city: string | null
  platform: "ios" | "android" | "windows" | "mac" | "web" | null
}

type ActionRecordRecord = {
  id: string
  actionId: string
  http: Prisma.JsonValue | null
  customData: Prisma.JsonValue | null
  ip: string | null
  userAgent: string | null
  countryCode: string | null
  countryName: string | null
  regionName: string | null
  city: string | null
  platform: ClientPlatform | null
  createdAt: number
}

type ActionListResponse = {
  total: number
  data: ActionItem[]
}

type ActionRecordListResponse = {
  total: number
  data: ActionRecordItem[]
}

@Injectable()
export class ActionsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAllByProject(projectKey: string, query: QueryActionsDto): Promise<ActionListResponse> {
    const normalizedProjectKey = normalizeProjectKey(projectKey)
    await this.ensureProjectExistsByKey(normalizedProjectKey)

    const [total, data] = await this.prisma.$transaction([
      this.prisma.action.count({ where: { projectKey: normalizedProjectKey } }),
      this.prisma.action.findMany({
        where: { projectKey: normalizedProjectKey },
        take: query.limit,
        skip: query.offset,
        orderBy: { createdAt: "desc" },
        include: { project: { select: { projectKey: true } } },
      }),
    ])

    return {
      total,
      data: data.map((item) => this.toActionItem(item)),
    }
  }

  async create(dto: CreateActionDto): Promise<ActionItem> {
    const normalizedProjectKey = normalizeProjectKey(dto.project_key)
    const project = await this.prisma.project.findUnique({
      where: { projectKey: normalizedProjectKey },
      select: { projectKey: true },
    })
    if (!project) {
      throw new NotFoundException("Project not found")
    }

    const created = await this.prisma.action.create({
      data: {
        projectKey: project.projectKey,
        name: dto.name,
        description: dto.description,
        customData: dto.custom_data as Prisma.InputJsonValue | undefined,
      },
      include: { project: { select: { projectKey: true } } },
    })

    return this.toActionItem(created)
  }

  async update(actionId: string, dto: UpdateActionDto): Promise<ActionItem> {
    const action = await this.prisma.action.findUnique({
      where: { id: actionId },
      include: { project: { select: { projectKey: true } } },
    })
    if (!action) {
      throw new NotFoundException("Action not found")
    }

    const updated = await this.prisma.action.update({
      where: { id: actionId },
      data: {
        name: dto.name,
        description: dto.description,
        customData: dto.custom_data as Prisma.InputJsonValue | undefined,
        updatedAt: nowSeconds(),
      },
      include: { project: { select: { projectKey: true } } },
    })

    return this.toActionItem(updated)
  }

  async remove(actionId: string): Promise<void> {
    const action = await this.prisma.action.findUnique({
      where: { id: actionId },
      select: { id: true },
    })
    if (!action) {
      throw new NotFoundException("Action not found")
    }

    await this.prisma.action.delete({ where: { id: actionId } })
  }

  async findRecordsByAction(
    actionId: string,
    query: QueryActionsDto,
  ): Promise<ActionRecordListResponse> {
    const action = await this.prisma.action.findUnique({
      where: { id: actionId },
      select: { id: true },
    })
    if (!action) {
      throw new NotFoundException("Action not found")
    }

    const [total, data] = await this.prisma.$transaction([
      this.prisma.actionRecord.count({ where: { actionId } }),
      this.prisma.actionRecord.findMany({
        where: { actionId },
        take: query.limit,
        skip: query.offset,
        orderBy: { createdAt: "desc" },
      }),
    ])

    return {
      total,
      data: data.map((item) => this.toActionRecordItem(item)),
    }
  }

  async findRecord(recordId: string): Promise<ActionRecordItem> {
    const found = await this.prisma.actionRecord.findUnique({ where: { id: recordId } })
    if (!found) {
      throw new NotFoundException("Action record not found")
    }

    return this.toActionRecordItem(found)
  }

  async createRecordByProjectKey(
    projectKey: string,
    dto: CreateActionRecordDto,
    http: Record<string, unknown>,
    origin: ClientOrigin,
  ): Promise<ActionRecordItem> {
    const normalizedProjectKey = normalizeProjectKey(projectKey)
    const action = await this.prisma.action.findUnique({
      where: { id: dto.action_id },
      include: { project: { select: { projectKey: true } } },
    })
    if (!action || action.project.projectKey !== normalizedProjectKey) {
      throw new NotFoundException("Action not found")
    }

    // `http` is excluded from the fingerprint on purpose: it carries the full
    // header set, and a rotating header (trace id, cookie) would make every
    // retry look distinct and defeat the whole check.
    const dedupHash = buildDedupHash([
      action.id,
      origin.ip,
      origin.userAgent,
      stableStringify(dto.custom_data),
    ])

    const window = resolveDedupWindowSeconds()
    if (window > 0) {
      const duplicate = await this.prisma.actionRecord.findFirst({
        where: { dedupHash, createdAt: { gte: nowSeconds() - window } },
        orderBy: { createdAt: "desc" },
      })
      if (duplicate) {
        return this.toActionRecordItem(duplicate)
      }
    }

    const created = await this.prisma.actionRecord.create({
      data: {
        actionId: action.id,
        http: http as Prisma.InputJsonValue,
        customData: dto.custom_data as Prisma.InputJsonValue | undefined,
        ip: origin.ip,
        userAgent: origin.userAgent,
        countryCode: origin.countryCode,
        countryName: origin.countryName,
        regionName: origin.regionName,
        city: origin.city,
        platform: origin.platform,
        dedupHash,
      },
    })

    return this.toActionRecordItem(created)
  }

  async getActionStatistics(): Promise<{ count: number }> {
    const count = await this.prisma.action.count()
    return { count }
  }

  async getActionRecordStatistics(): Promise<{ count: number }> {
    const count = await this.prisma.actionRecord.count()
    return { count }
  }

  getStatus(): { module: string; implemented: boolean } {
    return {
      module: "actions",
      implemented: true,
    }
  }

  private async ensureProjectExistsByKey(projectKey: string): Promise<void> {
    const project = await this.prisma.project.findUnique({
      where: { projectKey },
      select: { projectKey: true },
    })
    if (!project) {
      throw new NotFoundException("Project not found")
    }
  }

  private toActionItem(action: {
    id: string
    name: string
    description: string
    customData: Prisma.JsonValue | null
    createdAt: number
    project: { projectKey: string }
  }): ActionItem {
    return {
      action_id: action.id,
      project_key: action.project.projectKey,
      name: action.name,
      description: action.description,
      custom_data: action.customData,
      created_time: action.createdAt,
    }
  }

  private toActionRecordItem(record: ActionRecordRecord): ActionRecordItem {
    return {
      action_record_id: record.id,
      action_id: record.actionId,
      created_time: record.createdAt,
      http: record.http,
      custom_data: record.customData,
      ip: record.ip,
      user_agent: record.userAgent,
      country_code: record.countryCode,
      country_name: record.countryName,
      region_name: record.regionName,
      city: record.city,
      platform: fromClientPlatform(record.platform),
    }
  }
}
