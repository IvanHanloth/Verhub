import { Injectable, NotFoundException } from "@nestjs/common"

import { PrismaService } from "../database/prisma.service"
import { CreateAnnouncementDto } from "./dto/create-announcement.dto"
import { QueryAnnouncementsDto } from "./dto/query-announcements.dto"
import { UpdateAnnouncementDto } from "./dto/update-announcement.dto"

type AnnouncementItem = {
  id: string
  title: string
  content: string
  is_pinned: boolean
  created_at: string
  updated_at: string
}

type AnnouncementListResponse = {
  total: number
  data: AnnouncementItem[]
}

@Injectable()
export class AnnouncementsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(
    projectId: string,
    query: QueryAnnouncementsDto,
  ): Promise<AnnouncementListResponse> {
    await this.ensureProjectExists(projectId)

    const [total, data] = await this.prisma.$transaction([
      this.prisma.announcement.count({ where: { projectId } }),
      this.prisma.announcement.findMany({
        where: { projectId },
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

  async findOne(projectId: string, id: string): Promise<AnnouncementItem> {
    const announcement = await this.prisma.announcement.findFirst({
      where: {
        id,
        projectId,
      },
    })
    if (!announcement) {
      throw new NotFoundException("Announcement not found")
    }

    return this.toAnnouncementItem(announcement)
  }

  async create(projectId: string, dto: CreateAnnouncementDto): Promise<AnnouncementItem> {
    await this.ensureProjectExists(projectId)

    const created = await this.prisma.announcement.create({
      data: {
        projectId,
        title: dto.title,
        content: dto.content,
        isPinned: dto.is_pinned ?? false,
      },
    })

    return this.toAnnouncementItem(created)
  }

  async update(
    projectId: string,
    id: string,
    dto: UpdateAnnouncementDto,
  ): Promise<AnnouncementItem> {
    const announcement = await this.prisma.announcement.findFirst({
      where: {
        id,
        projectId,
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
      },
    })

    return this.toAnnouncementItem(updated)
  }

  async remove(projectId: string, id: string): Promise<void> {
    const announcement = await this.prisma.announcement.findFirst({
      where: {
        id,
        projectId,
      },
    })
    if (!announcement) {
      throw new NotFoundException("Announcement not found")
    }

    await this.prisma.announcement.delete({ where: { id } })
  }

  getStatus(): { module: string; implemented: boolean } {
    return {
      module: "announcements",
      implemented: true,
    }
  }

  private async ensureProjectExists(projectId: string): Promise<void> {
    const project = await this.prisma.project.findUnique({ where: { id: projectId } })
    if (!project) {
      throw new NotFoundException("Project not found")
    }
  }

  private toAnnouncementItem(announcement: {
    id: string
    title: string
    content: string
    isPinned: boolean
    createdAt: Date
    updatedAt: Date
  }): AnnouncementItem {
    return {
      id: announcement.id,
      title: announcement.title,
      content: announcement.content,
      is_pinned: announcement.isPinned,
      created_at: announcement.createdAt.toISOString(),
      updated_at: announcement.updatedAt.toISOString(),
    }
  }
}
