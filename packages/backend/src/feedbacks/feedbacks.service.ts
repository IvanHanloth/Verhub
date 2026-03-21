import { Injectable, NotFoundException } from "@nestjs/common"

import { Prisma, ClientPlatform } from "@prisma/client"

import { PrismaService } from "../database/prisma.service"
import { CreateFeedbackDto } from "./dto/create-feedback.dto"
import { QueryFeedbacksDto } from "./dto/query-feedbacks.dto"
import { UpdateFeedbackDto } from "./dto/update-feedback.dto"

type FeedbackItem = {
  id: string
  user_id: string | null
  rating: number | null
  content: string
  platform: "ios" | "android" | "windows" | "mac" | "web" | null
  custom_data: Prisma.JsonValue | null
  created_at: number
}

type FeedbackListResponse = {
  total: number
  data: FeedbackItem[]
}

function normalizeProjectKey(projectKey: string): string {
  return projectKey.trim().toLowerCase()
}

@Injectable()
export class FeedbacksService {
  constructor(private readonly prisma: PrismaService) {}

  async getStatistics(): Promise<{ count: number; rate_count: number; rate_avg: number | null }> {
    const [count, rated] = await Promise.all([
      this.prisma.feedback.count(),
      this.prisma.feedback.findMany({
        where: { rating: { not: null } },
        select: { rating: true },
      }),
    ])

    const rateCount = rated.length
    const totalScore = rated.reduce((sum, item) => sum + (item.rating ?? 0), 0)
    const rateAvg = rateCount > 0 ? totalScore / rateCount : null

    return {
      count,
      rate_count: rateCount,
      rate_avg: rateAvg,
    }
  }

  async findAll(projectKey: string, query: QueryFeedbacksDto): Promise<FeedbackListResponse> {
    const normalizedProjectKey = normalizeProjectKey(projectKey)
    await this.ensureProjectExistsByKey(normalizedProjectKey)

    const [total, data] = await this.prisma.$transaction([
      this.prisma.feedback.count({ where: { projectKey: normalizedProjectKey } }),
      this.prisma.feedback.findMany({
        where: { projectKey: normalizedProjectKey },
        take: query.limit,
        skip: query.offset,
        orderBy: { createdAt: "desc" },
      }),
    ])

    return {
      total,
      data: data.map((feedback) => this.toFeedbackItem(feedback)),
    }
  }

  async findOne(projectKey: string, id: string): Promise<FeedbackItem> {
    const normalizedProjectKey = normalizeProjectKey(projectKey)
    const feedback = await this.prisma.feedback.findFirst({
      where: {
        id,
        projectKey: normalizedProjectKey,
      },
    })
    if (!feedback) {
      throw new NotFoundException("Feedback not found")
    }

    return this.toFeedbackItem(feedback)
  }

  async createByProjectKey(projectKey: string, dto: CreateFeedbackDto): Promise<FeedbackItem> {
    const normalizedProjectKey = normalizeProjectKey(projectKey)
    const project = await this.prisma.project.findUnique({
      where: { projectKey: normalizedProjectKey },
      select: { projectKey: true },
    })
    if (!project) {
      throw new NotFoundException("Project not found")
    }

    const created = await this.prisma.feedback.create({
      data: {
        projectKey: project.projectKey,
        userId: dto.user_id,
        rating: dto.rating,
        content: dto.content,
        platform: this.toClientPlatform(dto.platform),
        customData: dto.custom_data as Prisma.InputJsonValue | undefined,
      },
    })

    return this.toFeedbackItem(created)
  }

  async update(projectKey: string, id: string, dto: UpdateFeedbackDto): Promise<FeedbackItem> {
    const normalizedProjectKey = normalizeProjectKey(projectKey)
    const existing = await this.prisma.feedback.findFirst({
      where: {
        id,
        projectKey: normalizedProjectKey,
      },
    })
    if (!existing) {
      throw new NotFoundException("Feedback not found")
    }

    const updated = await this.prisma.feedback.update({
      where: { id },
      data: {
        userId: dto.user_id,
        rating: dto.rating,
        content: dto.content,
        platform: this.toClientPlatform(dto.platform),
        customData: dto.custom_data as Prisma.InputJsonValue | undefined,
      },
    })

    return this.toFeedbackItem(updated)
  }

  async remove(projectKey: string, id: string): Promise<void> {
    const normalizedProjectKey = normalizeProjectKey(projectKey)
    const existing = await this.prisma.feedback.findFirst({
      where: {
        id,
        projectKey: normalizedProjectKey,
      },
    })
    if (!existing) {
      throw new NotFoundException("Feedback not found")
    }

    await this.prisma.feedback.delete({ where: { id } })
  }

  async updateById(id: string, dto: UpdateFeedbackDto): Promise<FeedbackItem> {
    const feedback = await this.prisma.feedback.findUnique({
      where: { id },
      select: { projectKey: true },
    })
    if (!feedback) {
      throw new NotFoundException("Feedback not found")
    }

    return this.update(feedback.projectKey, id, dto)
  }

  async removeById(id: string): Promise<void> {
    const feedback = await this.prisma.feedback.findUnique({
      where: { id },
      select: { projectKey: true },
    })
    if (!feedback) {
      throw new NotFoundException("Feedback not found")
    }

    await this.remove(feedback.projectKey, id)
  }

  getStatus(): { module: string; implemented: boolean } {
    return {
      module: "feedbacks",
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

  private toClientPlatform(
    platform: "ios" | "android" | "windows" | "mac" | "web" | undefined,
  ): ClientPlatform | undefined {
    if (!platform) {
      return undefined
    }

    return platform.toUpperCase() as ClientPlatform
  }

  private fromClientPlatform(
    platform: ClientPlatform | null,
  ): "ios" | "android" | "windows" | "mac" | "web" | null {
    if (!platform) {
      return null
    }

    return platform.toLowerCase() as "ios" | "android" | "windows" | "mac" | "web"
  }

  private toFeedbackItem(feedback: {
    id: string
    userId: string | null
    rating: number | null
    content: string
    platform: ClientPlatform | null
    customData: Prisma.JsonValue | null
    createdAt: number
  }): FeedbackItem {
    return {
      id: feedback.id,
      user_id: feedback.userId,
      rating: feedback.rating,
      content: feedback.content,
      platform: this.fromClientPlatform(feedback.platform),
      custom_data: feedback.customData,
      created_at: feedback.createdAt,
    }
  }
}
