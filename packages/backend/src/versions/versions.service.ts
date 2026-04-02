/**
 * Core version CRUD service.
 *
 * Responsible for: find / create / update / delete operations on versions,
 * statistics, and latest/preview queries. GitHub integration and update-check
 * logic are delegated to GithubReleaseService and VersionUpdateCheckService.
 */

import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common"

import { Prisma } from "@prisma/client"

import { PrismaService } from "../database/prisma.service"
import { CreateVersionDto } from "./dto/create-version.dto"
import { QueryVersionsDto } from "./dto/query-versions.dto"
import { UpdateVersionDto } from "./dto/update-version.dto"
import { parseComparableVersion } from "./version-comparator"
import {
  isUniqueViolation,
  normalizeVersionTag,
  parseDownloadLinks,
  resolveDownloadData,
  toClientPlatform,
  toClientPlatforms,
  toVersionItem,
} from "./version-mapping"
import type { VersionItem, VersionListResponse } from "./types"
import { normalizeProjectKey, nowSeconds } from "./types"

@Injectable()
export class VersionsService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Statistics ──

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
          select: { projectKey: true },
          distinct: ["projectKey"],
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
      latest_version_time: latestVersion ? latestVersion.createdAt : null,
      first_version_time: firstVersion ? firstVersion.createdAt : null,
    }
  }

  // ── Queries ──

  async findAll(projectKey: string, query: QueryVersionsDto): Promise<VersionListResponse> {
    const normalizedKey = normalizeProjectKey(projectKey)
    await this.ensureProjectExists(normalizedKey)

    const [total, data] = await this.prisma.$transaction([
      this.prisma.version.count({ where: { projectKey: normalizedKey } }),
      this.prisma.version.findMany({
        where: { projectKey: normalizedKey },
        take: query.limit,
        skip: query.offset,
        orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
      }),
    ])

    return {
      total,
      data: data.map((version) => toVersionItem(version)),
    }
  }

  async findOne(projectKey: string, id: string): Promise<VersionItem> {
    const normalizedKey = normalizeProjectKey(projectKey)
    const version = await this.prisma.version.findFirst({
      where: { id, projectKey: normalizedKey },
    })
    if (!version) {
      throw new NotFoundException("Version not found")
    }
    return toVersionItem(version)
  }

  async findOneById(id: string): Promise<VersionItem> {
    const version = await this.prisma.version.findUnique({ where: { id } })
    if (!version) {
      throw new NotFoundException("Version not found")
    }
    return toVersionItem(version)
  }

  async findAllByProjectKey(
    projectKey: string,
    query: QueryVersionsDto,
  ): Promise<VersionListResponse> {
    return this.findAll(projectKey, query)
  }

  async findLatestByProjectKey(projectKey: string): Promise<VersionItem> {
    const normalizedKey = normalizeProjectKey(projectKey)
    const project = await this.prisma.project.findUnique({
      where: { projectKey: normalizedKey },
      select: { projectKey: true },
    })
    if (!project) {
      throw new NotFoundException("Project not found")
    }

    const latest = await this.prisma.version.findFirst({
      where: { projectKey: project.projectKey, isLatest: true },
      orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
    })
    if (latest) {
      return toVersionItem(latest)
    }

    const fallbackStable = await this.prisma.version.findFirst({
      where: { projectKey: project.projectKey, isPreview: false },
      orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
    })
    if (fallbackStable) {
      return toVersionItem(fallbackStable)
    }

    const fallbackAny = await this.prisma.version.findFirst({
      where: { projectKey: project.projectKey },
      orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
    })
    if (!fallbackAny) {
      throw new NotFoundException("Version not found")
    }
    return toVersionItem(fallbackAny)
  }

  async findLatestPreviewByProjectKey(projectKey: string): Promise<VersionItem | null> {
    const normalizedKey = normalizeProjectKey(projectKey)
    await this.ensureProjectExists(normalizedKey)

    const latestPreview = await this.prisma.version.findFirst({
      where: { projectKey: normalizedKey, isPreview: true },
      orderBy: [{ comparableVersion: "desc" }, { publishedAt: "desc" }, { createdAt: "desc" }],
    })
    return latestPreview ? toVersionItem(latestPreview) : null
  }

  async findByVersionNumber(projectKey: string, version: string): Promise<VersionItem> {
    const normalizedKey = normalizeProjectKey(projectKey)
    await this.ensureProjectExists(normalizedKey)

    const trimmedVersion = version.trim()

    // 首先尝试精确匹配语义化版本号
    const found = await this.prisma.version.findFirst({
      where: { projectKey: normalizedKey, version: trimmedVersion },
    })
    if (found) {
      return toVersionItem(found)
    }

    // 如果不是精确匹配，尝试作为可比较版本号查询
    const allVersions = await this.prisma.version.findMany({
      where: { projectKey: normalizedKey, comparableVersion: { not: null } },
    })

    // 尝试找到匹配的可比较版本号
    for (const v of allVersions) {
      if (v.comparableVersion === trimmedVersion) {
        return toVersionItem(v)
      }
    }

    throw new NotFoundException("Version not found")
  }

  // ── Mutations ──

  async create(projectKey: string, dto: CreateVersionDto): Promise<VersionItem> {
    const normalizedKey = normalizeProjectKey(projectKey)
    await this.ensureProjectExists(normalizedKey)

    // Validate business rules
    await this.validateVersionRules(normalizedKey, dto)

    try {
      const isPreview = dto.is_preview ?? false
      const isLatest = dto.is_latest ?? !isPreview
      const publishedAt = dto.published_at ?? nowSeconds()
      const comparableVersion = this.resolveComparableVersion(dto.comparable_version, dto.version)
      const downloadData = resolveDownloadData(dto.download_url ?? undefined, dto.download_links)

      const created = await this.prisma.version.create({
        data: {
          projectKey: normalizedKey,
          version: dto.version,
          comparableVersion,
          title: dto.title,
          content: dto.content,
          downloadUrl: downloadData.downloadUrl,
          downloadLinks: downloadData.downloadLinks,
          forced: false,
          isLatest,
          isPreview,
          isMilestone: dto.is_milestone ?? false,
          isDeprecated: dto.is_deprecated ?? false,
          platforms: toClientPlatforms(dto.platforms, dto.platform),
          platform: toClientPlatform(dto.platform),
          customData: dto.custom_data as Prisma.InputJsonValue | undefined,
          publishedAt,
        },
      })

      if (created.isLatest) {
        await this.prisma.version.updateMany({
          where: {
            projectKey: normalizedKey,
            id: { not: created.id },
            isLatest: true,
          },
          data: { isLatest: false },
        })
      }

      return toVersionItem(created)
    } catch (error: unknown) {
      if (isUniqueViolation(error)) {
        throw new ConflictException("version already exists in this project")
      }
      throw error
    }
  }

  async createByProjectKey(projectKey: string, dto: CreateVersionDto): Promise<VersionItem> {
    return this.create(projectKey, dto)
  }

  async update(projectKey: string, id: string, dto: UpdateVersionDto): Promise<VersionItem> {
    const normalizedKey = normalizeProjectKey(projectKey)
    const version = await this.prisma.version.findFirst({
      where: { id, projectKey: normalizedKey },
    })
    if (!version) {
      throw new NotFoundException("Version not found")
    }

    // Validate business rules
    await this.validateVersionRules(normalizedKey, dto, id)

    try {
      const nextDownloadUrl =
        dto.download_url === undefined ? undefined : (dto.download_url ?? null)
      const nextDownloadData = resolveDownloadData(
        dto.download_url ?? undefined,
        dto.download_links,
        version.downloadUrl,
        parseDownloadLinks(version.downloadLinks),
      )

      const nextIsPreview = dto.is_preview ?? version.isPreview
      const nextIsLatest =
        dto.is_latest !== undefined
          ? dto.is_latest
          : version.isLatest && dto.is_preview === true
            ? false
            : version.isLatest
      const nextPublishedAt = dto.published_at
      const nextComparableVersion =
        dto.comparable_version === undefined && dto.version === undefined
          ? undefined
          : this.resolveComparableVersion(dto.comparable_version, dto.version ?? version.version)

      const updated = await this.prisma.version.update({
        where: { id },
        data: {
          version: dto.version,
          comparableVersion: nextComparableVersion,
          title: dto.title,
          content: dto.content,
          downloadUrl: nextDownloadData.downloadUrl ?? nextDownloadUrl,
          downloadLinks: nextDownloadData.downloadLinks,
          forced: false,
          isLatest: nextIsLatest,
          isPreview: nextIsPreview,
          isMilestone: dto.is_milestone,
          isDeprecated: dto.is_deprecated,
          platforms:
            dto.platforms !== undefined || dto.platform !== undefined
              ? toClientPlatforms(dto.platforms, dto.platform)
              : undefined,
          platform: toClientPlatform(dto.platform),
          customData: dto.custom_data as Prisma.InputJsonValue | undefined,
          publishedAt: nextPublishedAt,
        },
      })

      if (updated.isLatest) {
        await this.prisma.version.updateMany({
          where: {
            projectKey: normalizedKey,
            id: { not: updated.id },
            isLatest: true,
          },
          data: { isLatest: false },
        })
      } else if (version.isLatest) {
        await this.ensureLatestForProject(normalizedKey, updated.id)
      }

      return toVersionItem(updated)
    } catch (error: unknown) {
      if (isUniqueViolation(error)) {
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
    return this.update(version.projectKey, id, dto)
  }

  async remove(projectKey: string, id: string): Promise<void> {
    const normalizedKey = normalizeProjectKey(projectKey)
    const version = await this.prisma.version.findFirst({
      where: { id, projectKey: normalizedKey },
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
    await this.remove(version.projectKey, id)
  }

  getStatus(): { module: string; implemented: boolean } {
    return { module: "versions", implemented: true }
  }

  // ── Private helpers ──

  private async validateVersionRules(
    projectKey: string,
    dto: CreateVersionDto | UpdateVersionDto,
    existingId?: string,
  ): Promise<void> {
    const isLatest = dto.is_latest ?? false
    const isDeprecated = dto.is_deprecated ?? false

    // Rule 1: latest version cannot be deprecated
    if (isLatest && isDeprecated) {
      throw new BadRequestException("Latest version cannot be deprecated")
    }

    // Rule 2: If marking version as deprecated (or if it already is), ensure there's at least one non-deprecated version after it
    if (isDeprecated) {
      // Check if there's at least one non-deprecated version in this project
      const nonDeprecatedCount = await this.prisma.version.count({
        where: {
          projectKey,
          isDeprecated: false,
          id: existingId ? { not: existingId } : undefined,
        },
      })

      if (nonDeprecatedCount === 0) {
        throw new BadRequestException(
          "Cannot mark version as deprecated: there must be at least one non-deprecated version available for rollback",
        )
      }
    }

    // Rule 3: When setting as latest, ensure it's not deprecated
    if (isLatest) {
      const currentLatest = await this.prisma.version.findFirst({
        where: {
          projectKey,
          isLatest: true,
          id: existingId ? { not: existingId } : undefined,
        },
      })

      if (currentLatest && currentLatest.isDeprecated) {
        throw new BadRequestException(
          "Cannot set current latest version as deprecated while replacing it",
        )
      }
    }
  }

  private resolveComparableVersion(
    comparableVersion: string | undefined,
    semantic: string,
  ): string {
    const candidate = comparableVersion?.trim() || normalizeVersionTag(semantic)
    parseComparableVersion(candidate)
    return candidate
  }

  private async ensureProjectExists(projectKey: string): Promise<void> {
    const project = await this.prisma.project.findUnique({ where: { projectKey } })
    if (!project) {
      throw new NotFoundException("Project not found")
    }
  }

  private async ensureLatestForProject(projectKey: string, excludeId: string): Promise<void> {
    const nextLatest = await this.prisma.version.findFirst({
      where: {
        projectKey,
        id: { not: excludeId },
        isPreview: false,
      },
      orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
      select: { id: true },
    })

    if (!nextLatest) {
      return
    }

    await this.prisma.version.update({
      where: { id: nextLatest.id },
      data: { isLatest: true },
    })
  }
}
