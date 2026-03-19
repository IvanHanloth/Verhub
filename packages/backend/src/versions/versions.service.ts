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

  async getStatistics(): Promise<{
    total_versions: number
    total_projects: number
    forced_versions: number
    latest_version_time: number | null
    first_version_time: number | null
  }> {
    const [totalVersions, totalProjects, forcedVersions, latestVersion, firstVersion] =
      await Promise.all([
        this.prisma.version.count(),
        this.prisma.version.findMany({
          select: { projectId: true },
          distinct: ["projectId"],
        }),
        this.prisma.version.count({ where: { forced: true } }),
        this.prisma.version.findFirst({
          orderBy: { createdAt: "desc" },
          select: { createdAt: true },
        }),
        this.prisma.version.findFirst({
          orderBy: { createdAt: "asc" },
          select: { createdAt: true },
        }),
      ])

    return {
      total_versions: totalVersions,
      total_projects: totalProjects.length,
      forced_versions: forcedVersions,
      latest_version_time: latestVersion ? latestVersion.createdAt.getTime() : null,
      first_version_time: firstVersion ? firstVersion.createdAt.getTime() : null,
    }
  }

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

  async findOneById(id: string): Promise<VersionItem> {
    const version = await this.prisma.version.findUnique({
      where: { id },
    })
    if (!version) {
      throw new NotFoundException("Version not found")
    }

    return this.toVersionItem(version)
  }

  async findAllByProjectKey(
    projectKey: string,
    query: QueryVersionsDto,
  ): Promise<VersionListResponse> {
    const project = await this.prisma.project.findUnique({
      where: { projectKey },
      select: { id: true },
    })
    if (!project) {
      throw new NotFoundException("Project not found")
    }

    return this.findAll(project.id, query)
  }

  async findLatestByProjectKey(projectKey: string): Promise<VersionItem> {
    const project = await this.prisma.project.findUnique({
      where: { projectKey },
      select: { id: true },
    })
    if (!project) {
      throw new NotFoundException("Project not found")
    }

    const latest = await this.prisma.version.findFirst({
      where: { projectId: project.id },
      orderBy: { createdAt: "desc" },
    })
    if (!latest) {
      throw new NotFoundException("Version not found")
    }

    return this.toVersionItem(latest)
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

  async createByProjectKey(projectKey: string, dto: CreateVersionDto): Promise<VersionItem> {
    const project = await this.prisma.project.findUnique({
      where: { projectKey },
      select: { id: true },
    })
    if (!project) {
      throw new NotFoundException("Project not found")
    }

    return this.create(project.id, dto)
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

  async updateById(id: string, dto: UpdateVersionDto): Promise<VersionItem> {
    const version = await this.prisma.version.findUnique({ where: { id } })
    if (!version) {
      throw new NotFoundException("Version not found")
    }

    return this.update(version.projectId, id, dto)
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

  async removeById(id: string): Promise<void> {
    const version = await this.prisma.version.findUnique({ where: { id } })
    if (!version) {
      throw new NotFoundException("Version not found")
    }

    await this.remove(version.projectId, id)
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
