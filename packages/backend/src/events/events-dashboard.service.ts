import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common"
import { Prisma } from "@prisma/client"
import { plainToInstance } from "class-transformer"
import { validateSync } from "class-validator"

import { PrismaService } from "../database/prisma.service"
import { ProjectResolverService } from "../database/project-resolver.service"
import { nowSeconds } from "../common/utils"
import { EventQueryDto } from "./dsl/schema"
import { FormulaError, validateFormula } from "./dsl/formula"
import type { CreateDashboardCardDto, UpdateDashboardCardDto } from "./dto/dashboard-card.dto"

export type DashboardCardItem = {
  card_id: string
  project_key: string
  title: string
  description: string | null
  query: Prisma.JsonValue
  layout: Prisma.JsonValue | null
  sort_order: number
  created_time: number
  updated_time: number
}

/**
 * 看板卡片的 CRUD。
 *
 * 存进去的 query 在写入时就完整校验一次（结构 + 公式），而不是等到渲染时才报错：
 * 一张存坏的卡片会在每次打开看板时炸一遍，且没人知道是哪张。
 */
@Injectable()
export class EventsDashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectResolver: ProjectResolverService,
  ) {}

  async findAll(projectKey: string): Promise<{ total: number; data: DashboardCardItem[] }> {
    const key = await this.projectResolver.resolveCanonicalKeyOrThrow(projectKey)

    const rows = await this.prisma.eventDashboardCard.findMany({
      where: { projectKey: key },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    })

    return { total: rows.length, data: rows.map((row) => this.toItem(row)) }
  }

  async create(projectKey: string, dto: CreateDashboardCardDto): Promise<DashboardCardItem> {
    const key = await this.projectResolver.resolveCanonicalKeyOrThrow(projectKey)
    this.assertValidQuery(dto.query)

    const created = await this.prisma.eventDashboardCard.create({
      data: {
        projectKey: key,
        title: dto.title,
        description: dto.description,
        query: dto.query as Prisma.InputJsonValue,
        layout: dto.layout as Prisma.InputJsonValue | undefined,
        sortOrder: dto.sort_order ?? 0,
      },
    })

    return this.toItem(created)
  }

  async update(cardId: string, dto: UpdateDashboardCardDto): Promise<DashboardCardItem> {
    const existing = await this.prisma.eventDashboardCard.findUnique({ where: { id: cardId } })
    if (!existing) {
      throw new NotFoundException("Dashboard card not found")
    }
    if (dto.query !== undefined) {
      this.assertValidQuery(dto.query)
    }

    const updated = await this.prisma.eventDashboardCard.update({
      where: { id: cardId },
      data: {
        title: dto.title,
        description: dto.description,
        query: dto.query as Prisma.InputJsonValue | undefined,
        layout: dto.layout as Prisma.InputJsonValue | undefined,
        sortOrder: dto.sort_order,
        updatedAt: nowSeconds(),
      },
    })

    return this.toItem(updated)
  }

  async remove(cardId: string): Promise<void> {
    const existing = await this.prisma.eventDashboardCard.findUnique({
      where: { id: cardId },
      select: { id: true },
    })
    if (!existing) {
      throw new NotFoundException("Dashboard card not found")
    }
    await this.prisma.eventDashboardCard.delete({ where: { id: cardId } })
  }

  /**
   * 校验一份 DSL。
   *
   * 手动跑 class-validator 而不是让 Nest 的管道处理：query 是 JSON 列里的
   * 任意对象，管道只看得到外层 DTO。
   */
  private assertValidQuery(query: unknown): void {
    const instance = plainToInstance(EventQueryDto, query, { enableImplicitConversion: false })
    const errors = validateSync(instance, { whitelist: true, forbidNonWhitelisted: false })
    if (errors.length) {
      const detail = errors
        .map((error) => Object.values(error.constraints ?? {}).join("; "))
        .filter(Boolean)
        .join("; ")
      throw new BadRequestException(`卡片查询定义不合法：${detail || "结构不符合指标 DSL"}`)
    }

    if (instance.formula) {
      try {
        validateFormula(
          instance.formula,
          instance.events.map((event) => event.alias),
        )
      } catch (error: unknown) {
        if (error instanceof FormulaError) {
          throw new BadRequestException(`卡片公式不合法：${error.message}`)
        }
        throw error
      }
    }
  }

  private toItem(row: {
    id: string
    projectKey: string
    title: string
    description: string | null
    query: Prisma.JsonValue
    layout: Prisma.JsonValue | null
    sortOrder: number
    createdAt: number
    updatedAt: number
  }): DashboardCardItem {
    return {
      card_id: row.id,
      project_key: row.projectKey,
      title: row.title,
      description: row.description,
      query: row.query,
      layout: row.layout,
      sort_order: row.sortOrder,
      created_time: row.createdAt,
      updated_time: row.updatedAt,
    }
  }
}
