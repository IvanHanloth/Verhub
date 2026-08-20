import { Injectable, NotFoundException } from "@nestjs/common"
import { Platform, Prisma } from "@prisma/client"

import { PrismaService } from "../database/prisma.service"
import { ProjectResolverService } from "../database/project-resolver.service"
import { nowSeconds } from "../common/utils"
import { fromPlatforms, type PlatformValue } from "../common/platform"
import { searchContains } from "../common/query-filters"
import { CreateAnnouncementDto } from "./dto/create-announcement.dto"
import { QueryAnnouncementsDto } from "./dto/query-announcements.dto"
import { UpdateAnnouncementDto } from "./dto/update-announcement.dto"

type AnnouncementItem = {
  id: string
  title: string
  content: string
  is_pinned: boolean
  is_hidden: boolean
  platforms: PlatformValue[]
  author: string | null
  published_at: number
  created_at: number
  updated_at: number
}

function normalizePlatforms(platforms?: PlatformValue[]): Platform[] {
  if (!platforms) {
    return []
  }

  return Array.from(new Set(platforms.map((item) => item.trim().toUpperCase()))) as Platform[]
}

type AnnouncementListResponse = {
  total: number
  data: AnnouncementItem[]
}

/**
 * 平台维度的可见范围：未限定平台的公告（platforms 为空）对所有平台可见。
 *
 * 返回的是 `AND` 数组的一项而不是裸的 `OR`，因为关键字搜索同样要用 `OR`——
 * 两者若都写在 where 的顶层，后写的那个会把前一个整段覆盖掉。
 */
function platformScopeFilter(platform: PlatformValue | undefined): Prisma.AnnouncementWhereInput[] {
  if (!platform) {
    return []
  }

  return [
    {
      OR: [
        { platforms: { isEmpty: true } },
        { platforms: { has: platform.toUpperCase() as Platform } },
      ],
    },
  ]
}

/** 关键字命中范围：标题、正文与作者。 */
function searchFilter(search: string | undefined): Prisma.AnnouncementWhereInput[] {
  if (!search) {
    return []
  }

  const contains = searchContains(search)
  return [{ OR: [{ title: contains }, { content: contains }, { author: contains }] }]
}

@Injectable()
export class AnnouncementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectResolver: ProjectResolverService,
  ) {}

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
    const normalizedProjectKey = await this.resolveProjectKey(projectKey)

    const where: Prisma.AnnouncementWhereInput = {
      projectKey: normalizedProjectKey,
      isPinned: query.is_pinned,
      isHidden: query.is_hidden,
      AND: [...platformScopeFilter(query.platform), ...searchFilter(query.search)],
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
    const normalizedProjectKey = await this.resolveProjectKey(projectKey)
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
    const normalizedProjectKey = await this.resolveProjectKey(projectKey)

    // 公开端永远只返回未隐藏的公告：is_hidden / is_pinned 是后台的筛选维度，
    // 客户端传了也不生效。
    const where: Prisma.AnnouncementWhereInput = {
      projectKey: normalizedProjectKey,
      isHidden: false,
      AND: [...platformScopeFilter(query.platform), ...searchFilter(query.search)],
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
    const normalizedProjectKey = await this.resolveProjectKey(projectKey)

    const where: Prisma.AnnouncementWhereInput = {
      projectKey: normalizedProjectKey,
      isHidden: false,
      AND: platformScopeFilter(query?.platform),
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
    const normalizedProjectKey = await this.resolveProjectKey(projectKey)

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
    const normalizedProjectKey = await this.resolveProjectKey(projectKey)
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
    const normalizedProjectKey = await this.resolveProjectKey(projectKey)
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

  // 把外部 key 解析成当前项目的规范 key（含改名后的别名）；未命中抛 404。
  private resolveProjectKey(projectKey: string): Promise<string> {
    return this.projectResolver.resolveCanonicalKeyOrThrow(projectKey)
  }

  private toAnnouncementItem(announcement: {
    id: string
    title: string
    content: string
    isPinned: boolean
    isHidden: boolean
    platforms: Platform[]
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
      platforms: fromPlatforms(announcement.platforms),
      author: announcement.author,
      published_at: announcement.publishedAt,
      created_at: announcement.createdAt,
      updated_at: announcement.updatedAt,
    }
  }
}
