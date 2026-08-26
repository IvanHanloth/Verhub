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
import { ProjectResolverService } from "../database/project-resolver.service"
import { matchRegisteredLocale } from "../common/locale"
import { CreateVersionDto, VersionTranslationDto } from "./dto/create-version.dto"
import { QueryVersionsDto } from "./dto/query-versions.dto"
import { UpdateVersionDto } from "./dto/update-version.dto"
import { UpsertVersionDto } from "./dto/upsert-version.dto"
import {
  compareComparableVersions,
  parseComparableVersion,
  toComparableVersionSortKey,
} from "./version-comparator"
import {
  isUniqueViolation,
  normalizeVersionTag,
  parseDownloadLinks,
  resolveDownloadData,
  toPlatforms,
  toVersionItem,
  translationInclude,
} from "./version-mapping"
import { toPlatform, type PlatformValue } from "../common/platform"
import { searchContains } from "../common/query-filters"
import type { VersionItem, VersionListResponse } from "./types"
import { nowSeconds } from "./types"

/**
 * 版本列表的筛选条件。
 *
 * 平台与关键字各自是一组 `OR`，所以都收进 `AND` 数组——写在 where 顶层的话
 * 后一个 `OR` 会把前一个整段覆盖掉。空数组表示不加限制。
 */
function buildVersionListWhere(
  projectKey: string,
  query: QueryVersionsDto,
): Prisma.VersionWhereInput {
  const groups: Prisma.VersionWhereInput[] = []

  const platform = platformScope(query.platform)
  if (platform) {
    groups.push(platform)
  }

  if (query.search) {
    const contains = searchContains(query.search)
    groups.push({
      OR: [
        { version: contains },
        { comparableVersion: contains },
        { title: contains },
        { content: contains },
      ],
    })
  }

  return {
    projectKey,
    isPreview: query.is_preview,
    isDeprecated: query.is_deprecated,
    isMilestone: query.is_milestone,
    forced: query.forced,
    AND: groups,
  }
}

/** 未限定平台的版本（platforms 为空且 platform 为空）对所有平台可见。 */
function platformScope(platform: PlatformValue | undefined): Prisma.VersionWhereInput | null {
  const mapped = toPlatform(platform)
  if (!mapped) {
    return null
  }

  return {
    OR: [
      { platforms: { has: mapped } },
      { AND: [{ platforms: { isEmpty: true } }, { platform: null }] },
      { platform: mapped },
    ],
  }
}

@Injectable()
export class VersionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectResolver: ProjectResolverService,
  ) {}

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
        // 只要项目数：groupBy 在库层聚合，不把每个去重后的 key 拉进内存。
        this.prisma.version.groupBy({ by: ["projectKey"] }),
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

  /** 管理端列表：带出全部译文供后台编辑，不做语言回落。 */
  async findAll(projectKey: string, query: QueryVersionsDto): Promise<VersionListResponse> {
    const normalizedKey = await this.resolveProjectKey(projectKey)
    const where = buildVersionListWhere(normalizedKey, query)

    const [total, data] = await this.prisma.$transaction([
      this.prisma.version.count({ where }),
      this.prisma.version.findMany({
        where,
        take: query.limit,
        skip: query.offset,
        // 没有排序键（comparable_version 未设置或格式不合规）的版本沉底，
        // 而不是靠 Postgres DESC 默认的 NULLS FIRST 冒到最前面。
        orderBy: [
          { comparableVersionSort: { sort: "desc", nulls: "last" } },
          { publishedAt: "desc" },
          { createdAt: "desc" },
        ],
        include: { translations: true },
      }),
    ])

    return {
      total,
      data: data.map((version) => toVersionItem(version, { includeTranslations: true })),
    }
  }

  async findOne(projectKey: string, id: string): Promise<VersionItem> {
    const normalizedKey = await this.resolveProjectKey(projectKey)
    const version = await this.prisma.version.findFirst({
      where: { id, projectKey: normalizedKey },
      include: { translations: true },
    })
    if (!version) {
      throw new NotFoundException("Version not found")
    }
    return toVersionItem(version, { includeTranslations: true })
  }

  async findOneById(id: string): Promise<VersionItem> {
    const version = await this.prisma.version.findUnique({
      where: { id },
      include: { translations: true },
    })
    if (!version) {
      throw new NotFoundException("Version not found")
    }
    return toVersionItem(version, { includeTranslations: true })
  }

  /** 公开端列表：按请求语言回落，不带出其它语言的译文。 */
  async findAllByProjectKey(
    projectKey: string,
    query: QueryVersionsDto,
  ): Promise<VersionListResponse> {
    const normalizedKey = await this.resolveProjectKey(projectKey)
    const locale = await this.resolveRegisteredLocale(normalizedKey, query.locale)
    const where = buildVersionListWhere(normalizedKey, query)

    const [total, data] = await this.prisma.$transaction([
      this.prisma.version.count({ where }),
      this.prisma.version.findMany({
        where,
        take: query.limit,
        skip: query.offset,
        orderBy: [
          { comparableVersionSort: { sort: "desc", nulls: "last" } },
          { publishedAt: "desc" },
          { createdAt: "desc" },
        ],
        include: translationInclude(locale),
      }),
    ])

    return {
      total,
      data: data.map((version) => toVersionItem(version, { locale })),
    }
  }

  async findLatestByProjectKey(projectKey: string, wantedLocale?: string): Promise<VersionItem> {
    const normalizedKey = await this.resolveProjectKey(projectKey)
    const locale = await this.resolveRegisteredLocale(normalizedKey, wantedLocale)
    const include = translationInclude(locale)

    const latest = await this.prisma.version.findFirst({
      where: { projectKey: normalizedKey, isLatest: true },
      orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
      include,
    })
    if (latest) {
      return toVersionItem(latest, { locale })
    }

    const fallbackStable = await this.prisma.version.findFirst({
      where: { projectKey: normalizedKey, isPreview: false },
      orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
      include,
    })
    if (fallbackStable) {
      return toVersionItem(fallbackStable, { locale })
    }

    const fallbackAny = await this.prisma.version.findFirst({
      where: { projectKey: normalizedKey },
      orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
      include,
    })
    if (!fallbackAny) {
      throw new NotFoundException("Version not found")
    }
    return toVersionItem(fallbackAny, { locale })
  }

  async findLatestPreviewByProjectKey(
    projectKey: string,
    wantedLocale?: string,
  ): Promise<VersionItem | null> {
    const normalizedKey = await this.resolveProjectKey(projectKey)
    const locale = await this.resolveRegisteredLocale(normalizedKey, wantedLocale)

    const latestPreview = await this.prisma.version.findFirst({
      where: { projectKey: normalizedKey, isPreview: true },
      orderBy: [
        { comparableVersionSort: { sort: "desc", nulls: "last" } },
        { publishedAt: "desc" },
        { createdAt: "desc" },
      ],
      include: translationInclude(locale),
    })
    return latestPreview ? toVersionItem(latestPreview, { locale }) : null
  }

  async findByVersionNumber(
    projectKey: string,
    version: string,
    wantedLocale?: string,
  ): Promise<VersionItem> {
    const normalizedKey = await this.resolveProjectKey(projectKey)
    const locale = await this.resolveRegisteredLocale(normalizedKey, wantedLocale)

    const trimmedVersion = version.trim()

    const found = await this.prisma.version.findFirst({
      where: {
        projectKey: normalizedKey,
        OR: [{ version: trimmedVersion }, { comparableVersion: trimmedVersion }],
      },
      orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
      include: translationInclude(locale),
    })
    if (found) {
      return toVersionItem(found, { locale })
    }

    throw new NotFoundException("Version not found")
  }

  // ── Mutations ──

  async create(projectKey: string, dto: CreateVersionDto): Promise<VersionItem> {
    const normalizedKey = await this.resolveProjectKey(projectKey)

    // Validate business rules
    await this.validateVersionRules(normalizedKey, dto)
    const translations = await this.resolveTranslations(normalizedKey, dto.translations)

    try {
      const isPreview = dto.is_preview ?? false
      const isLatest = dto.is_latest ?? !isPreview
      const publishedAt = dto.published_at ?? nowSeconds()
      const comparableVersion = this.resolveComparableVersion(dto.comparable_version, dto.version)
      const downloadData = resolveDownloadData(dto.download_url, dto.download_links)

      // 建行与「同项目其余 latest 降级」必须原子：否则两步之间存在多 latest 窗口，
      // 且第二步失败会留下多个 isLatest=true 的不一致状态。
      const created = await this.prisma.$transaction(async (tx) => {
        const row = await tx.version.create({
          data: {
            projectKey: normalizedKey,
            version: dto.version,
            comparableVersion,
            comparableVersionSort: toComparableVersionSortKey(comparableVersion),
            title: dto.title,
            content: dto.content,
            downloadUrl: downloadData.downloadUrl,
            downloadLinks: downloadData.downloadLinks,
            forced: false,
            isLatest,
            isPreview,
            isMilestone: dto.is_milestone ?? false,
            isDeprecated: dto.is_deprecated ?? false,
            platforms: toPlatforms(dto.platforms, dto.platform),
            platform: toPlatform(dto.platform),
            customData: dto.custom_data as Prisma.InputJsonValue | undefined,
            publishedAt,
            ...(translations ? { translations: { create: translations } } : {}),
          },
          include: { translations: true },
        })

        if (row.isLatest) {
          await tx.version.updateMany({
            where: {
              projectKey: normalizedKey,
              id: { not: row.id },
              isLatest: true,
            },
            data: { isLatest: false },
          })
        }

        return row
      })

      return toVersionItem(created, { includeTranslations: true })
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

  /**
   * Create the version, or update it in place when the project already has one
   * with this exact version number.
   *
   * Addressed by version number rather than record id so that publishing
   * clients (CI pipelines using an API key) can be idempotent without having to
   * look the id up first.
   */
  async upsertByVersion(
    projectKey: string,
    version: string,
    dto: UpsertVersionDto,
  ): Promise<{ item: VersionItem; created: boolean }> {
    const targetVersion = version.trim()
    if (!targetVersion) {
      throw new BadRequestException("version path segment is required")
    }
    if (dto.version !== undefined && dto.version.trim() !== targetVersion) {
      throw new BadRequestException("version in body must match the version in the path")
    }

    const normalizedKey = await this.resolveProjectKey(projectKey)

    const existing = await this.prisma.version.findUnique({
      where: { projectKey_version: { projectKey: normalizedKey, version: targetVersion } },
      select: { id: true },
    })

    if (existing) {
      const item = await this.update(normalizedKey, existing.id, { ...dto, version: targetVersion })
      return { item, created: false }
    }

    try {
      const item = await this.create(normalizedKey, {
        ...dto,
        version: targetVersion,
        comparable_version: this.resolveComparableVersion(dto.comparable_version, targetVersion),
      })
      return { item, created: true }
    } catch (error: unknown) {
      // A concurrent publish inserted the same version between our lookup and
      // this create. Fall back to updating what the other writer created rather
      // than failing a request the caller is entitled to treat as idempotent.
      if (!(error instanceof ConflictException)) {
        throw error
      }
      const raced = await this.prisma.version.findUnique({
        where: { projectKey_version: { projectKey: normalizedKey, version: targetVersion } },
        select: { id: true },
      })
      if (!raced) {
        throw error
      }
      const item = await this.update(normalizedKey, raced.id, { ...dto, version: targetVersion })
      return { item, created: false }
    }
  }

  async update(projectKey: string, id: string, dto: UpdateVersionDto): Promise<VersionItem> {
    const normalizedKey = await this.resolveProjectKey(projectKey)
    const version = await this.prisma.version.findFirst({
      where: { id, projectKey: normalizedKey },
    })
    if (!version) {
      throw new NotFoundException("Version not found")
    }

    // Validate business rules
    await this.validateVersionRules(normalizedKey, dto, {
      id: version.id,
      version: version.version,
      comparableVersion: version.comparableVersion,
      isLatest: version.isLatest,
      isDeprecated: version.isDeprecated,
    })

    const translations = await this.resolveTranslations(normalizedKey, dto.translations)

    try {
      const nextDownloadData = resolveDownloadData(
        dto.download_url,
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

      // 与 create 同理：改行与 latest 归属维护必须在同一事务内完成，避免中间态
      // 出现零个或多个 latest。
      const updated = await this.prisma.$transaction(async (tx) => {
        const row = await tx.version.update({
          where: { id },
          data: {
            version: dto.version,
            comparableVersion: nextComparableVersion,
            comparableVersionSort: toComparableVersionSortKey(nextComparableVersion),
            title: dto.title,
            content: dto.content,
            downloadUrl: nextDownloadData.downloadUrl,
            downloadLinks: nextDownloadData.downloadLinks,
            forced: false,
            isLatest: nextIsLatest,
            isPreview: nextIsPreview,
            isMilestone: dto.is_milestone,
            isDeprecated: dto.is_deprecated,
            platforms:
              dto.platforms !== undefined || dto.platform !== undefined
                ? toPlatforms(dto.platforms, dto.platform)
                : undefined,
            platform: toPlatform(dto.platform),
            customData: dto.custom_data as Prisma.InputJsonValue | undefined,
            publishedAt: nextPublishedAt,
            // 传了就整体替换，不传则不动——与公告译文同一套语义。
            ...(translations ? { translations: { deleteMany: {}, create: translations } } : {}),
          },
          include: { translations: true },
        })

        if (row.isLatest) {
          await tx.version.updateMany({
            where: {
              projectKey: normalizedKey,
              id: { not: row.id },
              isLatest: true,
            },
            data: { isLatest: false },
          })
        } else if (version.isLatest) {
          await this.ensureLatestForProject(tx, normalizedKey, row.id)
        }

        return row
      })

      return toVersionItem(updated, { includeTranslations: true })
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
    const normalizedKey = await this.resolveProjectKey(projectKey)
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

  /**
   * 语言偏好 → 项目注册表里的主标签；没注册过就返回 null（等同没提偏好）。
   * 主标签与同义标签一视同仁地匹配，都忽略大小写，命中同义标签也返回主标签。
   */
  private async resolveRegisteredLocale(
    projectKey: string,
    locale: string | undefined,
  ): Promise<string | null> {
    if (!locale?.trim()) {
      return null
    }

    const registered = await this.prisma.projectLocale.findMany({
      where: { projectKey },
      select: { locale: true, aliases: true },
    })

    return matchRegisteredLocale(registered, locale)
  }

  /**
   * 校验并归一化提交的译文集合。返回 undefined 表示「这次不动译文」。
   *
   * 三条硬性规则：语言必须先在项目里注册过（同义标签同样算命中），同一请求里不能
   * 重复提交同一个语言，以及一行至少要有标题或更新说明——两项全空的译文行存下来
   * 只会让人以为配过什么。都直接 400，静默丢弃会让人以为存上了。
   */
  private async resolveTranslations(
    projectKey: string,
    translations: VersionTranslationDto[] | undefined,
  ): Promise<Array<{ locale: string; title: string | null; content: string | null }> | undefined> {
    if (!translations) {
      return undefined
    }
    if (translations.length === 0) {
      return []
    }

    const registered = await this.prisma.projectLocale.findMany({
      where: { projectKey },
      select: { locale: true, aliases: true },
    })

    const seen = new Set<string>()
    return translations.map((item) => {
      const canonical = matchRegisteredLocale(registered, item.locale)
      if (!canonical) {
        throw new BadRequestException(
          `Locale "${item.locale}" is not registered for this project. Register it first.`,
        )
      }
      if (seen.has(canonical)) {
        throw new BadRequestException(`Duplicate translation for locale "${item.locale}"`)
      }
      seen.add(canonical)

      const title = item.title?.trim() || null
      const content = item.content?.trim() || null
      if (!title && !content) {
        throw new BadRequestException(
          `Translation for locale "${item.locale}" sets nothing. Provide a title or a content.`,
        )
      }

      return { locale: canonical, title, content }
    })
  }

  private async validateVersionRules(
    projectKey: string,
    dto: CreateVersionDto | UpdateVersionDto,
    existingVersion?: {
      id: string
      version: string
      comparableVersion: string | null
      isLatest: boolean
      isDeprecated: boolean
    },
  ): Promise<void> {
    const isLatest = dto.is_latest ?? existingVersion?.isLatest ?? false
    const isDeprecated = dto.is_deprecated ?? existingVersion?.isDeprecated ?? false

    // Rule 1: latest version cannot be deprecated
    if (isLatest && isDeprecated) {
      throw new BadRequestException("Latest version cannot be deprecated")
    }

    // Rule 2: deprecated version must have at least one newer, stable and non-deprecated upgrade target.
    if (!isDeprecated) {
      return
    }

    const baselineVersion = dto.version ?? existingVersion?.version
    if (!baselineVersion) {
      throw new BadRequestException("version is required to validate deprecation policy")
    }

    const currentComparableVersion =
      dto.comparable_version === undefined && dto.version === undefined
        ? existingVersion?.comparableVersion
        : this.resolveComparableVersion(dto.comparable_version, baselineVersion)
    if (!currentComparableVersion) {
      throw new BadRequestException(
        "Deprecated version must provide comparable_version or an existing comparable version",
      )
    }

    const candidates = await this.prisma.version.findMany({
      where: {
        projectKey,
        id: existingVersion ? { not: existingVersion.id } : undefined,
        comparableVersion: { not: null },
        isPreview: false,
        isDeprecated: false,
      },
      select: {
        comparableVersion: true,
      },
    })

    const hasUpgradeTarget = candidates.some((item) => {
      if (!item.comparableVersion) {
        return false
      }
      return compareComparableVersions(item.comparableVersion, currentComparableVersion) > 0
    })

    if (!hasUpgradeTarget) {
      throw new BadRequestException(
        "Cannot mark version as deprecated: there must be at least one newer non-preview and non-deprecated version available for upgrade",
      )
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

  // 把外部 key 解析成当前项目的规范 key（含改名后的别名）；未命中抛 404。
  private resolveProjectKey(projectKey: string): Promise<string> {
    return this.projectResolver.resolveCanonicalKeyOrThrow(projectKey)
  }

  // 接受事务客户端而非直接用 this.prisma：调用方在 update 的事务内选出新 latest，
  // 必须与那次更新写在同一事务，否则原子性无从谈起。
  private async ensureLatestForProject(
    client: Prisma.TransactionClient,
    projectKey: string,
    excludeId: string,
  ): Promise<void> {
    const nextLatest = await client.version.findFirst({
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

    await client.version.update({
      where: { id: nextLatest.id },
      data: { isLatest: true },
    })
  }
}
