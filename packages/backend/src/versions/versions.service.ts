import { ConflictException, Injectable, NotFoundException } from "@nestjs/common"

import { Prisma, ClientPlatform } from "@prisma/client"

import { PrismaService } from "../database/prisma.service"
import { CreateVersionDto } from "./dto/create-version.dto"
import { QueryVersionsDto } from "./dto/query-versions.dto"
import { UpdateVersionDto } from "./dto/update-version.dto"

type VersionItem = {
  id: string
  version: string
  title: string | null
  content: string | null
  download_url: string
  forced: boolean
  platform: "ios" | "android" | "windows" | "mac" | "web" | null
  custom_data: Prisma.JsonValue | null
  created_at: string
}

type VersionListResponse = {
  total: number
  data: VersionItem[]
}

@Injectable()
export class VersionsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(projectId: string, query: QueryVersionsDto): Promise<VersionListResponse> {
    await this.ensureProjectExists(projectId)

    const [total, data] = await this.prisma.$transaction([
      this.prisma.version.count({ where: { projectId } }),
      this.prisma.version.findMany({
        where: { projectId },
        take: query.limit,
        skip: query.offset,
        orderBy: { createdAt: "desc" },
      }),
    ])

    return {
      total,
      data: data.map((version) => this.toVersionItem(version)),
    }
  }

  async findOne(projectId: string, id: string): Promise<VersionItem> {
    const version = await this.prisma.version.findFirst({
      where: {
        id,
        projectId,
      },
    })
    if (!version) {
      throw new NotFoundException("Version not found")
    }

    return this.toVersionItem(version)
  }

  async create(projectId: string, dto: CreateVersionDto): Promise<VersionItem> {
    await this.ensureProjectExists(projectId)

    try {
      const created = await this.prisma.version.create({
        data: {
          projectId,
          version: dto.version,
          title: dto.title,
          content: dto.content,
          downloadUrl: dto.download_url,
          forced: dto.forced ?? false,
          platform: this.toClientPlatform(dto.platform),
          customData: dto.custom_data as Prisma.InputJsonValue | undefined,
        },
      })

      return this.toVersionItem(created)
    } catch (error: unknown) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException("version already exists in this project")
      }

      throw error
    }
  }

  async update(projectId: string, id: string, dto: UpdateVersionDto): Promise<VersionItem> {
    const version = await this.prisma.version.findFirst({
      where: {
        id,
        projectId,
      },
    })
    if (!version) {
      throw new NotFoundException("Version not found")
    }

    try {
      const updated = await this.prisma.version.update({
        where: { id },
        data: {
          version: dto.version,
          title: dto.title,
          content: dto.content,
          downloadUrl: dto.download_url,
          forced: dto.forced,
          platform: this.toClientPlatform(dto.platform),
          customData: dto.custom_data as Prisma.InputJsonValue | undefined,
        },
      })

      return this.toVersionItem(updated)
    } catch (error: unknown) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException("version already exists in this project")
      }

      throw error
    }
  }

  async remove(projectId: string, id: string): Promise<void> {
    const version = await this.prisma.version.findFirst({
      where: {
        id,
        projectId,
      },
    })
    if (!version) {
      throw new NotFoundException("Version not found")
    }

    await this.prisma.version.delete({ where: { id } })
  }

  getStatus(): { module: string; implemented: boolean } {
    return {
      module: "versions",
      implemented: true,
    }
  }

  private async ensureProjectExists(projectId: string): Promise<void> {
    const project = await this.prisma.project.findUnique({ where: { id: projectId } })
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

    const value = platform.toUpperCase()
    return value as ClientPlatform
  }

  private fromClientPlatform(
    platform: ClientPlatform | null,
  ): "ios" | "android" | "windows" | "mac" | "web" | null {
    if (!platform) {
      return null
    }

    return platform.toLowerCase() as "ios" | "android" | "windows" | "mac" | "web"
  }

  private toVersionItem(version: {
    id: string
    version: string
    title: string | null
    content: string | null
    downloadUrl: string
    forced: boolean
    platform: ClientPlatform | null
    customData: Prisma.JsonValue | null
    createdAt: Date
  }): VersionItem {
    return {
      id: version.id,
      version: version.version,
      title: version.title,
      content: version.content,
      download_url: version.downloadUrl,
      forced: version.forced,
      platform: this.fromClientPlatform(version.platform),
      custom_data: version.customData,
      created_at: version.createdAt.toISOString(),
    }
  }

  private isUniqueViolation(error: unknown): boolean {
    if (typeof error !== "object" || error === null) {
      return false
    }

    return "code" in error && error.code === "P2002"
  }
}
