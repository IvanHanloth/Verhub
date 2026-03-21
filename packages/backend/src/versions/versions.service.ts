import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common"

import { Prisma, ClientPlatform } from "@prisma/client"

import { PrismaService } from "../database/prisma.service"
import { CreateVersionDto } from "./dto/create-version.dto"
import { PreviewGithubReleaseDto } from "./dto/preview-github-release.dto"
import { QueryVersionsDto } from "./dto/query-versions.dto"
import { UpdateVersionDto } from "./dto/update-version.dto"

type VersionItem = {
  id: string
  version: string
  title: string | null
  content: string | null
  download_url: string | null
  forced: boolean
  is_latest: boolean
  is_preview: boolean
  platform: "ios" | "android" | "windows" | "mac" | "web" | null
  custom_data: Prisma.JsonValue | null
  published_at: number
  created_at: number
}

type VersionListResponse = {
  total: number
  data: VersionItem[]
}

type GithubReleasePreview = {
  version: string
  title?: string
  content?: string
  download_url?: string
  forced: boolean
  is_latest: boolean
  is_preview: boolean
  published_at: number
  custom_data: Record<string, unknown>
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000)
}

function normalizeProjectKey(projectKey: string): string {
  return projectKey.trim().toLowerCase()
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

  async findAll(projectKey: string, query: QueryVersionsDto): Promise<VersionListResponse> {
    const normalizedProjectKey = normalizeProjectKey(projectKey)
    await this.ensureProjectExists(normalizedProjectKey)

    const [total, data] = await this.prisma.$transaction([
      this.prisma.version.count({ where: { projectKey: normalizedProjectKey } }),
      this.prisma.version.findMany({
        where: { projectKey: normalizedProjectKey },
        take: query.limit,
        skip: query.offset,
        orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
      }),
    ])

    return {
      total,
      data: data.map((version) => this.toVersionItem(version)),
    }
  }

  async findOne(projectKey: string, id: string): Promise<VersionItem> {
    const normalizedProjectKey = normalizeProjectKey(projectKey)
    const version = await this.prisma.version.findFirst({
      where: {
        id,
        projectKey: normalizedProjectKey,
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
    return this.findAll(projectKey, query)
  }

  async findLatestByProjectKey(projectKey: string): Promise<VersionItem> {
    const normalizedProjectKey = normalizeProjectKey(projectKey)
    const project = await this.prisma.project.findUnique({
      where: { projectKey: normalizedProjectKey },
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
      return this.toVersionItem(latest)
    }

    const fallbackStable = await this.prisma.version.findFirst({
      where: { projectKey: project.projectKey, isPreview: false },
      orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
    })
    if (fallbackStable) {
      return this.toVersionItem(fallbackStable)
    }

    const fallbackAny = await this.prisma.version.findFirst({
      where: { projectKey: project.projectKey },
      orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
    })
    if (!fallbackAny) {
      throw new NotFoundException("Version not found")
    }

    return this.toVersionItem(fallbackAny)
  }

  async create(projectKey: string, dto: CreateVersionDto): Promise<VersionItem> {
    const normalizedProjectKey = normalizeProjectKey(projectKey)
    await this.ensureProjectExists(normalizedProjectKey)

    try {
      const isPreview = dto.is_preview ?? false
      const isLatest = dto.is_latest ?? !isPreview
      const publishedAt = dto.published_at ?? nowSeconds()

      const created = await this.prisma.version.create({
        data: {
          projectKey: normalizedProjectKey,
          version: dto.version,
          title: dto.title,
          content: dto.content,
          downloadUrl: dto.download_url ?? null,
          forced: dto.forced ?? false,
          isLatest,
          isPreview,
          platform: this.toClientPlatform(dto.platform),
          customData: dto.custom_data as Prisma.InputJsonValue | undefined,
          publishedAt,
        },
      })

      if (created.isLatest) {
        await this.prisma.version.updateMany({
          where: {
            projectKey: normalizedProjectKey,
            id: { not: created.id },
            isLatest: true,
          },
          data: { isLatest: false },
        })
      }

      return this.toVersionItem(created)
    } catch (error: unknown) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException("version already exists in this project")
      }

      throw error
    }
  }

  async createByProjectKey(projectKey: string, dto: CreateVersionDto): Promise<VersionItem> {
    return this.create(projectKey, dto)
  }

  async update(projectKey: string, id: string, dto: UpdateVersionDto): Promise<VersionItem> {
    const normalizedProjectKey = normalizeProjectKey(projectKey)
    const version = await this.prisma.version.findFirst({
      where: {
        id,
        projectKey: normalizedProjectKey,
      },
    })
    if (!version) {
      throw new NotFoundException("Version not found")
    }

    try {
      const nextDownloadUrl =
        dto.download_url === undefined ? undefined : (dto.download_url ?? null)

      const nextIsPreview = dto.is_preview ?? version.isPreview
      const nextIsLatest =
        dto.is_latest !== undefined
          ? dto.is_latest
          : version.isLatest && dto.is_preview === true
            ? false
            : version.isLatest
      const nextPublishedAt = dto.published_at

      const updated = await this.prisma.version.update({
        where: { id },
        data: {
          version: dto.version,
          title: dto.title,
          content: dto.content,
          downloadUrl: nextDownloadUrl,
          forced: dto.forced,
          isLatest: nextIsLatest,
          isPreview: nextIsPreview,
          platform: this.toClientPlatform(dto.platform),
          customData: dto.custom_data as Prisma.InputJsonValue | undefined,
          publishedAt: nextPublishedAt,
        },
      })

      if (updated.isLatest) {
        await this.prisma.version.updateMany({
          where: {
            projectKey: normalizedProjectKey,
            id: { not: updated.id },
            isLatest: true,
          },
          data: { isLatest: false },
        })
      } else if (version.isLatest) {
        await this.ensureLatestForProject(normalizedProjectKey, updated.id)
      }

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

    return this.update(version.projectKey, id, dto)
  }

  async remove(projectKey: string, id: string): Promise<void> {
    const normalizedProjectKey = normalizeProjectKey(projectKey)
    const version = await this.prisma.version.findFirst({
      where: {
        id,
        projectKey: normalizedProjectKey,
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

    await this.remove(version.projectKey, id)
  }

  getStatus(): { module: string; implemented: boolean } {
    return {
      module: "versions",
      implemented: true,
    }
  }

  async previewFromGithubRelease(
    projectKey: string,
    query: PreviewGithubReleaseDto,
  ): Promise<GithubReleasePreview> {
    const normalizedProjectKey = normalizeProjectKey(projectKey)
    const project = await this.prisma.project.findUnique({
      where: { projectKey: normalizedProjectKey },
      select: { projectKey: true, repoUrl: true },
    })

    if (!project) {
      throw new NotFoundException("Project not found")
    }

    if (!project.repoUrl) {
      throw new BadRequestException("Project repo_url is not configured")
    }

    const { owner, repo } = this.parseGithubRepository(project.repoUrl)
    const tag = query.tag?.trim()
    const endpoint = tag
      ? `https://api.github.com/repos/${owner}/${repo}/releases/tags/${encodeURIComponent(tag)}`
      : `https://api.github.com/repos/${owner}/${repo}/releases/latest`

    const response = await fetch(endpoint, {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "Verhub/1.2",
      },
    })

    if (!response.ok) {
      if (response.status === 404) {
        throw new NotFoundException("GitHub release not found")
      }

      throw new BadGatewayException(`GitHub API request failed with status ${response.status}`)
    }

    const payload = (await response.json()) as {
      tag_name?: string
      name?: string
      body?: string
      prerelease?: boolean
      published_at?: string
      html_url?: string
      zipball_url?: string
      assets?: Array<{ browser_download_url?: string }>
    }

    const releaseTag = payload.tag_name?.trim()
    if (!releaseTag) {
      throw new BadGatewayException("GitHub release payload is invalid")
    }

    const publishedAt = payload.published_at
      ? Math.floor(new Date(payload.published_at).getTime() / 1000)
      : nowSeconds()
    const assetDownload = payload.assets?.find(
      (item) => item.browser_download_url,
    )?.browser_download_url
    const downloadUrl = assetDownload ?? payload.zipball_url ?? payload.html_url
    const isPreview = Boolean(payload.prerelease)

    return {
      version: this.normalizeVersionTag(releaseTag),
      title: payload.name?.trim() || undefined,
      content: payload.body?.trim() || undefined,
      download_url: downloadUrl,
      forced: false,
      is_latest: !isPreview,
      is_preview: isPreview,
      published_at: Number.isFinite(publishedAt) ? publishedAt : nowSeconds(),
      custom_data: {
        source: "github-release",
        owner,
        repo,
        release_tag: releaseTag,
      },
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

  private parseGithubRepository(repoUrl: string): { owner: string; repo: string } {
    let parsed: URL
    try {
      parsed = new URL(repoUrl)
    } catch {
      throw new BadRequestException("Project repo_url is not a valid URL")
    }

    if (parsed.hostname !== "github.com") {
      throw new BadRequestException("Only github.com repository URL is supported")
    }

    const segments = parsed.pathname
      .split("/")
      .map((segment) => segment.trim())
      .filter(Boolean)
    if (segments.length < 2) {
      throw new BadRequestException("Project repo_url must contain owner and repository")
    }

    const owner = segments[0]
    const rawRepo = segments[1]
    if (!owner || !rawRepo) {
      throw new BadRequestException("Project repo_url must contain owner and repository")
    }

    const repo = rawRepo.replace(/\.git$/i, "")
    if (!repo) {
      throw new BadRequestException("Project repo_url must contain owner and repository")
    }

    return { owner, repo }
  }

  private normalizeVersionTag(tag: string): string {
    const trimmed = tag.trim()
    if (!trimmed) {
      return trimmed
    }

    return trimmed.startsWith("v") || trimmed.startsWith("V") ? trimmed.slice(1) : trimmed
  }

  private async ensureProjectExists(projectKey: string): Promise<void> {
    const project = await this.prisma.project.findUnique({ where: { projectKey } })
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
    downloadUrl: string | null
    forced: boolean
    isLatest: boolean
    isPreview: boolean
    platform: ClientPlatform | null
    customData: Prisma.JsonValue | null
    publishedAt: number
    createdAt: number
  }): VersionItem {
    return {
      id: version.id,
      version: version.version,
      title: version.title,
      content: version.content,
      download_url: version.downloadUrl,
      forced: version.forced,
      is_latest: version.isLatest,
      is_preview: version.isPreview,
      platform: this.fromClientPlatform(version.platform),
      custom_data: version.customData,
      published_at: version.publishedAt,
      created_at: version.createdAt,
    }
  }

  private isUniqueViolation(error: unknown): boolean {
    if (typeof error !== "object" || error === null) {
      return false
    }

    return "code" in error && error.code === "P2002"
  }
}
