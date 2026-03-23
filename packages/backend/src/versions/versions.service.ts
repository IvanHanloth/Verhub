import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common"

import { Prisma, ClientPlatform } from "@prisma/client"

import { PrismaService } from "../database/prisma.service"
import { CheckVersionUpdateDto } from "./dto/check-version-update.dto"
import { CreateVersionDto } from "./dto/create-version.dto"
import { PreviewGithubReleaseDto } from "./dto/preview-github-release.dto"
import { QueryVersionsDto } from "./dto/query-versions.dto"
import { UpdateVersionDto } from "./dto/update-version.dto"
import {
  compareComparableVersions,
  isComparableVersionInRange,
  parseComparableVersion,
} from "./version-comparator"

type VersionItem = {
  id: string
  version: string
  comparable_version: string
  title: string | null
  content: string | null
  download_url: string | null
  download_links: Array<{ url: string; name?: string; platform?: string }>
  forced: boolean
  is_latest: boolean
  is_preview: boolean
  milestone: string | null
  is_deprecated: boolean
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
  comparable_version: string
  title?: string
  content?: string
  download_url?: string
  download_links: Array<{ url: string; name?: string; platform?: string }>
  forced: boolean
  is_latest: boolean
  is_preview: boolean
  milestone?: string
  is_deprecated: boolean
  published_at: number
  custom_data: Record<string, unknown>
}

type VersionImportResult = {
  imported: number
  skipped: number
  scanned: number
}

type VersionRecord = {
  id: string
  projectKey: string
  version: string
  comparableVersion: string | null
  title: string | null
  content: string | null
  downloadUrl: string | null
  forced: boolean
  isLatest: boolean
  isPreview: boolean
  milestone: string | null
  isDeprecated: boolean
  platform: ClientPlatform | null
  customData: Prisma.JsonValue | null
  downloadLinks: Prisma.JsonValue | null
  publishedAt: number
  createdAt: number
}

type CheckVersionUpdateResponse = {
  should_update: boolean
  required: boolean
  reason_codes: string[]
  current_version: string | null
  current_comparable_version: string
  latest_version: VersionItem
  latest_preview_version: VersionItem | null
  target_version: VersionItem
  milestone: {
    current: string | null
    latest: string | null
    latest_in_current: VersionItem | null
  }
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

  async findLatestPreviewByProjectKey(projectKey: string): Promise<VersionItem> {
    const normalizedProjectKey = normalizeProjectKey(projectKey)
    await this.ensureProjectExists(normalizedProjectKey)

    const latestPreview = await this.prisma.version.findFirst({
      where: { projectKey: normalizedProjectKey, isPreview: true },
      orderBy: [{ comparableVersion: "desc" }, { publishedAt: "desc" }, { createdAt: "desc" }],
    })

    if (!latestPreview) {
      throw new NotFoundException("Preview version not found")
    }

    return this.toVersionItem(latestPreview)
  }

  async findByVersionNumber(projectKey: string, version: string): Promise<VersionItem> {
    const normalizedProjectKey = normalizeProjectKey(projectKey)
    await this.ensureProjectExists(normalizedProjectKey)

    const found = await this.prisma.version.findFirst({
      where: {
        projectKey: normalizedProjectKey,
        version: version.trim(),
      },
    })

    if (!found) {
      throw new NotFoundException("Version not found")
    }

    return this.toVersionItem(found)
  }

  async checkUpdateByProjectKey(
    projectKey: string,
    dto: CheckVersionUpdateDto,
  ): Promise<CheckVersionUpdateResponse> {
    const normalizedProjectKey = normalizeProjectKey(projectKey)
    const project = await this.prisma.project.findUnique({
      where: { projectKey: normalizedProjectKey },
      select: {
        projectKey: true,
        optionalUpdateMinComparableVersion: true,
        optionalUpdateMaxComparableVersion: true,
      },
    })
    if (!project) {
      throw new NotFoundException("Project not found")
    }

    const includePreview = dto.include_preview ?? false
    const latestStable = await this.prisma.version.findFirst({
      where: { projectKey: normalizedProjectKey, isPreview: false },
      orderBy: [{ comparableVersion: "desc" }, { publishedAt: "desc" }, { createdAt: "desc" }],
    })
    const latestPreview = await this.prisma.version.findFirst({
      where: { projectKey: normalizedProjectKey, isPreview: true },
      orderBy: [{ comparableVersion: "desc" }, { publishedAt: "desc" }, { createdAt: "desc" }],
    })

    const latestCandidate = includePreview
      ? this.pickHigherVersion(latestStable, latestPreview)
      : latestStable

    if (!latestCandidate) {
      throw new NotFoundException("Version not found")
    }

    let currentRecord: {
      version: string
      comparableVersion: string | null
      milestone: string | null
      isDeprecated: boolean
    } | null = null

    if (dto.current_version) {
      currentRecord = await this.prisma.version.findFirst({
        where: {
          projectKey: normalizedProjectKey,
          version: dto.current_version.trim(),
        },
        select: {
          version: true,
          comparableVersion: true,
          milestone: true,
          isDeprecated: true,
        },
      })
    }

    const currentComparableVersion =
      dto.current_comparable_version?.trim() || currentRecord?.comparableVersion || ""
    if (!currentComparableVersion) {
      throw new BadRequestException(
        "current_comparable_version is required when current version record does not provide comparable_version",
      )
    }
    parseComparableVersion(currentComparableVersion)

    if (project.optionalUpdateMinComparableVersion) {
      parseComparableVersion(project.optionalUpdateMinComparableVersion)
    }
    if (project.optionalUpdateMaxComparableVersion) {
      parseComparableVersion(project.optionalUpdateMaxComparableVersion)
    }

    const latestComparableVersion = latestCandidate.comparableVersion
    if (!latestComparableVersion) {
      throw new BadRequestException("Latest version comparable_version is not configured")
    }

    const hasNewer =
      compareComparableVersions(latestComparableVersion, currentComparableVersion) > 0
    const reasons: string[] = []
    let required = false
    let targetVersion = latestCandidate

    if (hasNewer) {
      reasons.push("newer_version_available")
    }

    const isInOptionalRange = isComparableVersionInRange(
      currentComparableVersion,
      project.optionalUpdateMinComparableVersion,
      project.optionalUpdateMaxComparableVersion,
    )
    if (hasNewer && !isInOptionalRange) {
      required = true
      reasons.push("outside_optional_update_range")
    }

    if (currentRecord?.isDeprecated) {
      required = true
      reasons.push("current_version_deprecated")
    }

    const currentMilestone = currentRecord?.milestone ?? null
    const latestMilestone = latestCandidate.milestone
    let milestoneTarget: VersionRecord | null = null

    if (hasNewer) {
      const milestoneCandidatesRaw = await this.prisma.version.findMany({
        where: {
          projectKey: normalizedProjectKey,
          milestone: { not: null },
          comparableVersion: { not: null },
        },
      })
      const milestoneCandidates = Array.isArray(milestoneCandidatesRaw)
        ? milestoneCandidatesRaw
        : []

      const blockers = milestoneCandidates
        .filter((item): item is VersionRecord & { comparableVersion: string } =>
          Boolean(item.comparableVersion),
        )
        .filter(
          (item) =>
            compareComparableVersions(item.comparableVersion, currentComparableVersion) > 0 &&
            compareComparableVersions(item.comparableVersion, latestComparableVersion) <= 0,
        )
        .sort((a, b) => compareComparableVersions(a.comparableVersion, b.comparableVersion))

      milestoneTarget = blockers[0] ?? null
      if (milestoneTarget) {
        required = true
        reasons.push("milestone_guard")
        targetVersion = milestoneTarget
      }
    }

    return {
      should_update: hasNewer || required,
      required,
      reason_codes: reasons,
      current_version: currentRecord?.version ?? dto.current_version?.trim() ?? null,
      current_comparable_version: currentComparableVersion,
      latest_version: this.toVersionItem(latestCandidate),
      latest_preview_version: latestPreview ? this.toVersionItem(latestPreview) : null,
      target_version: this.toVersionItem(targetVersion),
      milestone: {
        current: currentMilestone,
        latest: latestMilestone,
        latest_in_current: milestoneTarget ? this.toVersionItem(milestoneTarget) : null,
      },
    }
  }

  async create(projectKey: string, dto: CreateVersionDto): Promise<VersionItem> {
    const normalizedProjectKey = normalizeProjectKey(projectKey)
    await this.ensureProjectExists(normalizedProjectKey)

    try {
      const isPreview = dto.is_preview ?? false
      const isLatest = dto.is_latest ?? !isPreview
      const publishedAt = dto.published_at ?? nowSeconds()
      const comparableVersion = this.resolveComparableVersion(dto.comparable_version, dto.version)

      const downloadData = this.resolveDownloadData(dto.download_url, dto.download_links)

      const created = await this.prisma.version.create({
        data: {
          projectKey: normalizedProjectKey,
          version: dto.version,
          comparableVersion,
          title: dto.title,
          content: dto.content,
          downloadUrl: downloadData.downloadUrl,
          downloadLinks: downloadData.downloadLinks,
          forced: false,
          isLatest,
          isPreview,
          milestone: dto.milestone ?? null,
          isDeprecated: dto.is_deprecated ?? false,
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
      const nextDownloadData = this.resolveDownloadData(
        dto.download_url,
        dto.download_links,
        version.downloadUrl,
        this.parseDownloadLinks(version.downloadLinks),
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
          milestone: dto.milestone,
          isDeprecated: dto.is_deprecated,
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
      assets?: Array<{ name?: string; browser_download_url?: string }>
    }

    const releaseTag = payload.tag_name?.trim()
    if (!releaseTag) {
      throw new BadGatewayException("GitHub release payload is invalid")
    }

    const publishedAt = payload.published_at
      ? Math.floor(new Date(payload.published_at).getTime() / 1000)
      : nowSeconds()
    const downloadLinks = this.toGithubReleaseDownloadLinks(payload.assets)
    const downloadUrl =
      downloadLinks[0]?.url ?? payload.zipball_url ?? payload.html_url ?? undefined
    const isPreview = Boolean(payload.prerelease)

    return {
      version: this.normalizeVersionTag(releaseTag),
      comparable_version: this.normalizeVersionTag(releaseTag),
      title: payload.name?.trim() || undefined,
      content: payload.body?.trim() || undefined,
      download_url: downloadUrl,
      download_links: downloadLinks,
      forced: false,
      is_latest: !isPreview,
      is_preview: isPreview,
      is_deprecated: false,
      published_at: Number.isFinite(publishedAt) ? publishedAt : nowSeconds(),
      custom_data: {
        source: "github-release",
        owner,
        repo,
        release_tag: releaseTag,
      },
    }
  }

  async importFromGithubReleases(projectKey: string): Promise<VersionImportResult> {
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
    const releases = await this.fetchGithubReleases(owner, repo)
    if (releases.length === 0) {
      return { imported: 0, skipped: 0, scanned: 0 }
    }

    const existing = await this.prisma.version.findMany({
      where: { projectKey: normalizedProjectKey },
      select: { version: true },
    })
    const existingVersions = new Set(existing.map((item) => item.version))

    let imported = 0
    let skipped = 0
    for (const release of releases) {
      const tag = release.tag_name?.trim()
      if (!tag) {
        skipped += 1
        continue
      }

      const normalizedVersion = this.normalizeVersionTag(tag)
      if (!normalizedVersion || existingVersions.has(normalizedVersion)) {
        skipped += 1
        continue
      }
      parseComparableVersion(normalizedVersion)

      const releaseLinks = this.toGithubReleaseDownloadLinks(release.assets)
      const downloadUrl =
        releaseLinks[0]?.url ?? release.zipball_url?.trim() ?? release.html_url?.trim() ?? null
      const publishedAt = release.published_at
        ? Math.floor(new Date(release.published_at).getTime() / 1000)
        : nowSeconds()

      await this.prisma.version.create({
        data: {
          projectKey: normalizedProjectKey,
          version: normalizedVersion,
          comparableVersion: normalizedVersion,
          title: release.name?.trim() || null,
          content: release.body?.trim() || null,
          downloadUrl,
          downloadLinks: releaseLinks,
          forced: false,
          isLatest: false,
          isPreview: Boolean(release.prerelease),
          milestone: null,
          isDeprecated: false,
          platform: undefined,
          customData: {
            source: "github-release-import",
            owner,
            repo,
            release_tag: tag,
          },
          publishedAt: Number.isFinite(publishedAt) ? publishedAt : nowSeconds(),
        },
      })

      existingVersions.add(normalizedVersion)
      imported += 1
    }

    return {
      imported,
      skipped,
      scanned: releases.length,
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

  private resolveComparableVersion(
    comparableVersion: string | undefined,
    semantic: string,
  ): string {
    const candidate = comparableVersion?.trim() || this.normalizeVersionTag(semantic)
    parseComparableVersion(candidate)
    return candidate
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

  private toVersionItem(version: VersionRecord): VersionItem {
    const normalizedLinks = this.parseDownloadLinks(version.downloadLinks)

    return {
      id: version.id,
      version: version.version,
      comparable_version: version.comparableVersion ?? version.version,
      title: version.title,
      content: version.content,
      download_url: version.downloadUrl,
      download_links:
        normalizedLinks.length > 0
          ? normalizedLinks
          : version.downloadUrl
            ? [{ url: version.downloadUrl }]
            : [],
      forced: version.forced,
      is_latest: version.isLatest,
      is_preview: version.isPreview,
      milestone: version.milestone,
      is_deprecated: version.isDeprecated,
      platform: this.fromClientPlatform(version.platform),
      custom_data: version.customData,
      published_at: version.publishedAt,
      created_at: version.createdAt,
    }
  }

  private pickHigherVersion(
    stable: VersionRecord | null,
    preview: VersionRecord | null,
  ): VersionRecord | null {
    if (!stable) {
      return preview
    }
    if (!preview) {
      return stable
    }

    if (!stable.comparableVersion || !preview.comparableVersion) {
      return preview.publishedAt >= stable.publishedAt ? preview : stable
    }

    return compareComparableVersions(preview.comparableVersion, stable.comparableVersion) >= 0
      ? preview
      : stable
  }

  private isUniqueViolation(error: unknown): boolean {
    if (typeof error !== "object" || error === null) {
      return false
    }

    return "code" in error && error.code === "P2002"
  }

  private resolveDownloadData(
    downloadUrl: string | undefined,
    downloadLinks: Array<{ url: string; name?: string; platform?: string }> | undefined,
    currentDownloadUrl?: string | null,
    currentDownloadLinks?: Array<{ url: string; name?: string; platform?: string }>,
  ): {
    downloadUrl: string | null | undefined
    downloadLinks: Array<{ url: string; name?: string; platform?: string }> | undefined
  } {
    if (downloadLinks !== undefined) {
      const normalizedLinks = this.normalizeDownloadLinks(downloadLinks)
      const urlFromLinks = normalizedLinks[0]?.url
      return {
        downloadUrl: downloadUrl === undefined ? (urlFromLinks ?? null) : (downloadUrl ?? null),
        downloadLinks: normalizedLinks,
      }
    }

    if (downloadUrl !== undefined) {
      return {
        downloadUrl: downloadUrl ?? null,
        downloadLinks: downloadUrl ? [{ url: downloadUrl }] : [],
      }
    }

    return {
      downloadUrl: currentDownloadUrl,
      downloadLinks: currentDownloadLinks,
    }
  }

  private normalizeDownloadLinks(
    links: Array<{ url: string; name?: string; platform?: string }>,
  ): Array<{ url: string; name?: string; platform?: string }> {
    return links
      .map((item) => ({
        url: item.url.trim(),
        name: item.name?.trim() || undefined,
        platform: item.platform?.trim() || undefined,
      }))
      .filter((item) => item.url.length > 0)
  }

  private parseDownloadLinks(
    value: Prisma.JsonValue | null,
  ): Array<{ url: string; name?: string; platform?: string }> {
    if (!Array.isArray(value)) {
      return []
    }

    const result: Array<{ url: string; name?: string; platform?: string }> = []
    for (const item of value) {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        continue
      }

      const jsonObject = item as Prisma.JsonObject
      const rawUrl = jsonObject.url
      if (typeof rawUrl !== "string" || rawUrl.trim().length === 0) {
        continue
      }

      result.push({
        url: rawUrl,
        name: typeof jsonObject.name === "string" ? jsonObject.name : undefined,
        platform: typeof jsonObject.platform === "string" ? jsonObject.platform : undefined,
      })
    }

    return result
  }

  private toGithubReleaseDownloadLinks(
    assets: Array<{ name?: string; browser_download_url?: string }> | undefined,
  ): Array<{ url: string; name?: string }> {
    return (assets ?? [])
      .filter(
        (asset): asset is { name?: string; browser_download_url: string } =>
          typeof asset.browser_download_url === "string" && asset.browser_download_url.length > 0,
      )
      .map((asset) => ({
        url: asset.browser_download_url,
        name: asset.name?.trim() || undefined,
      }))
  }

  private async fetchGithubReleases(
    owner: string,
    repo: string,
  ): Promise<
    Array<{
      tag_name?: string
      name?: string
      body?: string
      prerelease?: boolean
      draft?: boolean
      published_at?: string
      html_url?: string
      zipball_url?: string
      assets?: Array<{ name?: string; browser_download_url?: string }>
    }>
  > {
    const endpoint = `https://api.github.com/repos/${owner}/${repo}/releases?per_page=100&page=1`
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

    const payload = (await response.json()) as Array<{
      tag_name?: string
      name?: string
      body?: string
      prerelease?: boolean
      draft?: boolean
      published_at?: string
      html_url?: string
      zipball_url?: string
      assets?: Array<{ name?: string; browser_download_url?: string }>
    }>

    return payload.filter((item) => !item.draft)
  }
}
