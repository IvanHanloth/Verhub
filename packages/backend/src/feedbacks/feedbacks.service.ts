import { Injectable, NotFoundException } from "@nestjs/common"

import { Prisma, Platform } from "@prisma/client"

import { PrismaService } from "../database/prisma.service"
import { buildDedupHash, resolveDedupWindowSeconds, stableStringify } from "../common/dedup"
import { normalizeProjectKey, nowSeconds } from "../common/utils"
import { fromPlatform, toPlatform, type PlatformValue } from "../common/platform"
import type { ClientOrigin } from "../geo/client-origin.service"
import { CreateFeedbackDto } from "./dto/create-feedback.dto"
import { QueryFeedbacksDto } from "./dto/query-feedbacks.dto"
import { UpdateFeedbackDto } from "./dto/update-feedback.dto"

type FeedbackItem = {
  id: string
  user_id: string | null
  rating: number | null
  content: string
  platform: PlatformValue | null
  platform_version: string | null
  custom_data: Prisma.JsonValue | null
  ip: string | null
  user_agent: string | null
  country_code: string | null
  country_name: string | null
  region_name: string | null
  city: string | null
  created_at: number
}

type FeedbackRecord = {
  id: string
  userId: string | null
  rating: number | null
  content: string
  platform: Platform | null
  platformVersion: string | null
  customData: Prisma.JsonValue | null
  ip: string | null
  userAgent: string | null
  countryCode: string | null
  countryName: string | null
  regionName: string | null
  city: string | null
  createdAt: number
}

type FeedbackListResponse = {
  total: number
  data: FeedbackItem[]
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

  async createByProjectKey(
    projectKey: string,
    dto: CreateFeedbackDto,
    origin: ClientOrigin,
  ): Promise<FeedbackItem> {
    const normalizedProjectKey = normalizeProjectKey(projectKey)
    const project = await this.prisma.project.findUnique({
      where: { projectKey: normalizedProjectKey },
      select: { projectKey: true },
    })
    if (!project) {
      throw new NotFoundException("Project not found")
    }

    const dedupHash = buildDedupHash([
      project.projectKey,
      dto.user_id,
      dto.rating,
      dto.content,
      origin.ip,
      stableStringify(dto.custom_data),
    ])

    // Double-tapped submit buttons and retried requests are the whole reason
    // this exists; a user genuinely re-sending the same text a minute later
    // still gets a second row.
    const window = resolveDedupWindowSeconds()
    if (window > 0) {
      const duplicate = await this.prisma.feedback.findFirst({
        where: { dedupHash, createdAt: { gte: nowSeconds() - window } },
        orderBy: { createdAt: "desc" },
      })
      if (duplicate) {
        return this.toFeedbackItem(duplicate)
      }
    }

    const created = await this.prisma.feedback.create({
      data: {
        projectKey: project.projectKey,
        userId: dto.user_id,
        rating: dto.rating,
        content: dto.content,
        // The client's own declaration wins; the User-Agent guess only fills a gap.
        platform: toPlatform(dto.platform) ?? origin.platform,
        // 明细统一取 origin：它已经把 body / query / header / UA 四个来源按同一
        // 优先级归一过，这里再解析一遍只会多出一条会漂移的规则。
        platformVersion: origin.platformVersion,
        customData: dto.custom_data as Prisma.InputJsonValue | undefined,
        ip: origin.ip,
        userAgent: origin.userAgent,
        countryCode: origin.countryCode,
        countryName: origin.countryName,
        regionName: origin.regionName,
        city: origin.city,
        dedupHash,
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
        platform: toPlatform(dto.platform),
        platformVersion: dto.platform_version,
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

  private toFeedbackItem(feedback: FeedbackRecord): FeedbackItem {
    return {
      id: feedback.id,
      user_id: feedback.userId,
      rating: feedback.rating,
      content: feedback.content,
      platform: fromPlatform(feedback.platform),
      platform_version: feedback.platformVersion,
      custom_data: feedback.customData,
      ip: feedback.ip,
      user_agent: feedback.userAgent,
      country_code: feedback.countryCode,
      country_name: feedback.countryName,
      region_name: feedback.regionName,
      city: feedback.city,
      created_at: feedback.createdAt,
    }
  }
}
