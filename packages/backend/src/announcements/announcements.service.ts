import { Injectable, NotFoundException } from "@nestjs/common"
import { ClientPlatform, Prisma } from "@prisma/client"

import { PrismaService } from "../database/prisma.service"
import { normalizeProjectKey, nowSeconds } from "../common/utils"
import { fromClientPlatforms } from "../versions/version-mapping"
import { CreateAnnouncementDto } from "./dto/create-announcement.dto"
import { QueryAnnouncementsDto } from "./dto/query-announcements.dto"
import { UpdateAnnouncementDto } from "./dto/update-announcement.dto"

type AnnouncementItem = {
  id: string
  title: string
  content: string
  is_pinned: boolean
  is_hidden: boolean
  platforms: Array<"ios" | "android" | "windows" | "mac" | "web">
  author: string | null
  published_at: number
  created_at: number
  updated_at: number
}

function normalizePlatforms(
  platforms?: Array<"ios" | "android" | "windows" | "mac" | "web">,
): ClientPlatform[] {
  if (!platforms) {
    return []
  }

  return Array.from(new Set(platforms.map((item) => item.trim().toUpperCase()))) as ClientPlatform[]
}

type AnnouncementListResponse = {
  total: number
  data: AnnouncementItem[]
}

@Injectable()
export class AnnouncementsService {
  constructor(private readonly prisma: PrismaService) {}

  async getStatistics(): Promise<{ count: number; pinned_count: number }> {
    const [count, pinnedCount] = await Promise.all([
      this.prisma.announcement.count(),
      this.prisma.announcement.count({ where: { isPinned: true } }),
    ])

    return {
      count,
      pinned_count: pinnedCount,
    }
  }

  async findAll(
    projectKey: string,
    query: QueryAnnouncementsDto,
  ): Promise<AnnouncementListResponse> {
    const normalizedProjectKey = normalizeProjectKey(projectKey)
    await this.ensureProjectExists(normalizedProjectKey)

    const where: Prisma.AnnouncementWhereInput = {
      projectKey: normalizedProjectKey,
    }

    const [total, data] = await this.prisma.$transaction([
      this.prisma.announcement.count({ where }),
      this.prisma.announcement.findMany({
        where,
        take: query.limit,
        skip: query.offset,
        orderBy: [{ isPinned: "desc" }, { createdAt: "desc" }],
      }),
    ])

    return {
      total,
      data: data.map((item) => this.toAnnouncementItem(item)),
    }
  }

  async findOne(projectKey: string, id: string): Promise<AnnouncementItem> {
    const normalizedProjectKey = normalizeProjectKey(projectKey)
    const announcement = await this.prisma.announcement.findFirst({
      where: {
        id,
        projectKey: normalizedProjectKey,
      },
    })
    if (!announcement) {
      throw new NotFoundException("Announcement not found")
    }

    return this.toAnnouncementItem(announcement)
  }

  async findAllByProjectKey(
    projectKey: string,
    query: QueryAnnouncementsDto,
  ): Promise<AnnouncementListResponse> {
    const normalizedProjectKey = normalizeProjectKey(projectKey)
    await this.ensureProjectExists(normalizedProjectKey)

    const where: Prisma.AnnouncementWhereInput = {
      projectKey: normalizedProjectKey,
      isHidden: false,
      ...(query.platform
        ? {
            OR: [
              { platforms: { isEmpty: true } },
              { platforms: { has: query.platform.toUpperCase() as ClientPlatform } },
            ],
          }
        : {}),
    }

    const [total, data] = await this.prisma.$transaction([
      this.prisma.announcement.count({ where }),
      this.prisma.announcement.findMany({
        where,
        take: query.limit,
        skip: query.offset,
        orderBy: [{ isPinned: "desc" }, { createdAt: "desc" }],
      }),
    ])

    return {
      total,
      data: data.map((item) => this.toAnnouncementItem(item)),
    }
  }

  async findLatestByProjectKey(
    projectKey: string,
    query?: Pick<QueryAnnouncementsDto, "platform">,
  ): Promise<AnnouncementItem> {
    const normalizedProjectKey = normalizeProjectKey(projectKey)
    const project = await this.prisma.project.findUnique({
      where: { projectKey: normalizedProjectKey },
      select: { projectKey: true },
    })
    if (!project) {
      throw new NotFoundException("Project not found")
    }

    const where: Prisma.AnnouncementWhereInput = {
      projectKey: project.projectKey,
      isHidden: false,
      ...(query?.platform
        ? {
            OR: [
              { platforms: { isEmpty: true } },
              { platforms: { has: query.platform.toUpperCase() as ClientPlatform } },
            ],
          }
        : {}),
    }

    const latest = await this.prisma.announcement.findFirst({
      where,
      orderBy: { createdAt: "desc" },
    })
    if (!latest) {
      throw new NotFoundException("Announcement not found")
    }

    return this.toAnnouncementItem(latest)
  }

  async create(projectKey: string, dto: CreateAnnouncementDto): Promise<AnnouncementItem> {
    const normalizedProjectKey = normalizeProjectKey(projectKey)
    await this.ensureProjectExists(normalizedProjectKey)

    const created = await this.prisma.announcement.create({
      data: {
        projectKey: normalizedProjectKey,
        title: dto.title,
        content: dto.content,
        isPinned: dto.is_pinned ?? false,
        isHidden: dto.is_hidden ?? false,
        platforms: normalizePlatforms(dto.platforms),
        author: dto.author,
        publishedAt: dto.published_at,
      },
    })

    return this.toAnnouncementItem(created)
  }

  async createByProjectKey(
    projectKey: string,
    dto: CreateAnnouncementDto,
  ): Promise<AnnouncementItem> {
    return this.create(projectKey, dto)
  }

  async update(
    projectKey: string,
    id: string,
    dto: UpdateAnnouncementDto,
  ): Promise<AnnouncementItem> {
    const normalizedProjectKey = normalizeProjectKey(projectKey)
    const announcement = await this.prisma.announcement.findFirst({
      where: {
        id,
        projectKey: normalizedProjectKey,
      },
    })
    if (!announcement) {
      throw new NotFoundException("Announcement not found")
    }

    const updated = await this.prisma.announcement.update({
      where: { id },
      data: {
        title: dto.title,
        content: dto.content,
        isPinned: dto.is_pinned,
        isHidden: dto.is_hidden,
        platforms: dto.platforms ? normalizePlatforms(dto.platforms) : undefined,
        author: dto.author,
        publishedAt: dto.published_at,
        updatedAt: nowSeconds(),
      },
    })

    return this.toAnnouncementItem(updated)
  }

  async remove(projectKey: string, id: string): Promise<void> {
    const normalizedProjectKey = normalizeProjectKey(projectKey)
    const announcement = await this.prisma.announcement.findFirst({
      where: {
        id,
        projectKey: normalizedProjectKey,
      },
    })
    if (!announcement) {
      throw new NotFoundException("Announcement not found")
    }

    await this.prisma.announcement.delete({ where: { id } })
  }

  async updateById(id: string, dto: UpdateAnnouncementDto): Promise<AnnouncementItem> {
    const announcement = await this.prisma.announcement.findUnique({
      where: { id },
      select: { projectKey: true },
    })
    if (!announcement) {
      throw new NotFoundException("Announcement not found")
    }

    return this.update(announcement.projectKey, id, dto)
  }

  async removeById(id: string): Promise<void> {
    const announcement = await this.prisma.announcement.findUnique({
      where: { id },
      select: { projectKey: true },
    })
    if (!announcement) {
      throw new NotFoundException("Announcement not found")
    }

    await this.remove(announcement.projectKey, id)
  }

  getStatus(): { module: string; implemented: boolean } {
    return {
      module: "announcements",
      implemented: true,
    }
  }

  private async ensureProjectExists(projectKey: string): Promise<void> {
    const project = await this.prisma.project.findUnique({ where: { projectKey } })
    if (!project) {
      throw new NotFoundException("Project not found")
    }
  }

  private toAnnouncementItem(announcement: {
    id: string
    title: string
    content: string
    isPinned: boolean
    isHidden: boolean
    platforms: ClientPlatform[]
    author: string | null
    publishedAt: number
    createdAt: number
    updatedAt: number
  }): AnnouncementItem {
    return {
      id: announcement.id,
      title: announcement.title,
      content: announcement.content,
      is_pinned: announcement.isPinned,
      is_hidden: announcement.isHidden,
      platforms: fromClientPlatforms(announcement.platforms),
      author: announcement.author,
      published_at: announcement.publishedAt,
      created_at: announcement.createdAt,
      updated_at: announcement.updatedAt,
    }
  }
}
