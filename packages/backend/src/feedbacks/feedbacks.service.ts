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
  created_at: string
}

type FeedbackListResponse = {
  total: number
  data: FeedbackItem[]
}

@Injectable()
export class FeedbacksService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(projectId: string, query: QueryFeedbacksDto): Promise<FeedbackListResponse> {
    await this.ensureProjectExistsById(projectId)

    const [total, data] = await this.prisma.$transaction([
      this.prisma.feedback.count({ where: { projectId } }),
      this.prisma.feedback.findMany({
        where: { projectId },
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

  async findOne(projectId: string, id: string): Promise<FeedbackItem> {
    const feedback = await this.prisma.feedback.findFirst({
      where: {
        id,
        projectId,
      },
    })
    if (!feedback) {
      throw new NotFoundException("Feedback not found")
    }

    return this.toFeedbackItem(feedback)
  }

  async createByProjectKey(projectKey: string, dto: CreateFeedbackDto): Promise<FeedbackItem> {
    const project = await this.prisma.project.findUnique({
      where: { projectKey },
      select: { id: true },
    })
    if (!project) {
      throw new NotFoundException("Project not found")
    }

    const created = await this.prisma.feedback.create({
      data: {
        projectId: project.id,
        userId: dto.user_id,
        rating: dto.rating,
        content: dto.content,
        platform: this.toClientPlatform(dto.platform),
        customData: dto.custom_data as Prisma.InputJsonValue | undefined,
      },
    })

    return this.toFeedbackItem(created)
  }

  async update(projectId: string, id: string, dto: UpdateFeedbackDto): Promise<FeedbackItem> {
    const existing = await this.prisma.feedback.findFirst({
      where: {
        id,
        projectId,
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

  async remove(projectId: string, id: string): Promise<void> {
    const existing = await this.prisma.feedback.findFirst({
      where: {
        id,
        projectId,
      },
    })
    if (!existing) {
      throw new NotFoundException("Feedback not found")
    }

    await this.prisma.feedback.delete({ where: { id } })
  }

  getStatus(): { module: string; implemented: boolean } {
    return {
      module: "feedbacks",
      implemented: true,
    }
  }

  private async ensureProjectExistsById(projectId: string): Promise<void> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true },
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
    createdAt: Date
  }): FeedbackItem {
    return {
      id: feedback.id,
      user_id: feedback.userId,
      rating: feedback.rating,
      content: feedback.content,
      platform: this.fromClientPlatform(feedback.platform),
      custom_data: feedback.customData,
      created_at: feedback.createdAt.toISOString(),
    }
  }
}
