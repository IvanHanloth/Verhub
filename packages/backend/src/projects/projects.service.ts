import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common"
import { Prisma } from "@prisma/client"

import { PrismaService } from "../database/prisma.service"
import { ProjectResolverService } from "../database/project-resolver.service"
import { isUniqueViolation, normalizeProjectKey, nowSeconds } from "../common/utils"
import { localeKey, matchRegisteredLocale } from "../common/locale"
import { searchContains } from "../common/query-filters"
import { parseGithubRepository } from "../versions/github-release.service"
import { CreateProjectDto, ProjectTranslationDto } from "./dto/create-project.dto"
import { CreateProjectLocaleDto } from "./dto/create-project-locale.dto"
import { QueryProjectsDto } from "./dto/query-projects.dto"
import { UpdateProjectDto } from "./dto/update-project.dto"
import { compareComparableVersions, parseComparableVersion } from "../versions/version-comparator"

/** 项目注册的一个语言。`label` 为空时界面直接显示 `locale`。 */
type ProjectLocaleItem = {
  locale: string
  /** 同义标签：命中其中任何一个都等价于命中主标签。 */
  aliases: string[]
  label: string | null
  created_at: number
}

/** 项目名称与描述的译文。字段留空即回落项目自身的值。 */
type ProjectTranslationItem = {
  locale: string
  name: string | null
  description: string | null
}

type ProjectItem = {
  id: string
  project_key: string
  name: string
  repo_url: string | null
  description: string | null
  author: string | null
  author_homepage_url: string | null
  icon_url: string | null
  website_url: string | null
  docs_url: string | null
  published_at: number | null
  optional_update_min_comparable_version: string | null
  optional_update_max_comparable_version: string | null
  stats_retention_days: number
  /// 事件采集总开关。关掉后采集端点空转，既有数据保留。
  event_collection_enabled: boolean
  /// 事件明细的保留期，独立于 stats_retention_days 且默认更短。
  event_retention_days: number
  /// 该项目改名后保留的旧 Project Key，均可作为别名访问到本项目。新到旧排序。
  aliases: string[]
  /**
   * 本次返回的 name / description 实际来自哪个语言的译文；null 表示项目自身的值
   * （没提语言偏好、语言未注册，或该语言的译文两个字段都留空）。
   */
  locale: string | null
  /** 全部译文，仅管理接口返回。 */
  translations?: ProjectTranslationItem[]
  created_at: number
  updated_at: number
}

/// 查项目时一并带出别名与译文，供 toProjectItem 填充对应字段。
const PROJECT_WITH_ALIASES = {
  aliases: { select: { alias: true }, orderBy: { createdAt: "desc" } },
  translations: true,
} as const satisfies Prisma.ProjectInclude

type ProjectListResponse = {
  total: number
  data: ProjectItem[]
}

type GithubRepoPreview = {
  project_key: string
  name: string
  repo_url: string
  description: string | null
  author: string | null
  author_homepage_url: string | null
  icon_url: string | null
  website_url: string | null
  docs_url: string | null
  published_at: number | null
  optional_update_min_comparable_version: string | null
  optional_update_max_comparable_version: string | null
}

@Injectable()
export class ProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectResolver: ProjectResolverService,
  ) {}

  async getStatistics(): Promise<{ count: number }> {
    const count = await this.prisma.project.count()
    return { count }
  }

  async findAll(query: QueryProjectsDto): Promise<ProjectListResponse> {
    // 别名也参与匹配：项目改名后，按旧 key 搜索仍应找得到它。
    const where: Prisma.ProjectWhereInput = query.search
      ? {
          OR: [
            { projectKey: searchContains(query.search) },
            { name: searchContains(query.search) },
            { description: searchContains(query.search) },
            { author: searchContains(query.search) },
            { repoUrl: searchContains(query.search) },
            { aliases: { some: { alias: searchContains(query.search) } } },
          ],
        }
      : {}

    const [total, data] = await this.prisma.$transaction([
      this.prisma.project.count({ where }),
      this.prisma.project.findMany({
        where,
        take: query.limit,
        skip: query.offset,
        orderBy: {
          createdAt: "desc",
        },
        include: PROJECT_WITH_ALIASES,
      }),
    ])

    return {
      total,
      data: data.map((project) => this.toProjectItem(project, { includeTranslations: true })),
    }
  }

  async findOne(id: string): Promise<ProjectItem> {
    const project = await this.prisma.project.findUnique({
      where: { projectKey: normalizeProjectKey(id) },
      include: PROJECT_WITH_ALIASES,
    })
    if (!project) {
      throw new NotFoundException("Project not found")
    }

    return this.toProjectItem(project, { includeTranslations: true })
  }

  async findOneByProjectKey(projectKey: string, locale?: string): Promise<ProjectItem> {
    // 公共详情：旧 key（别名）经解析后仍返回当前项目，客户端无需感知改名。
    const canonicalKey = await this.projectResolver.resolveCanonicalKeyOrThrow(projectKey)
    const [project, registered] = await Promise.all([
      this.prisma.project.findUniqueOrThrow({
        where: { projectKey: canonicalKey },
        include: PROJECT_WITH_ALIASES,
      }),
      locale?.trim()
        ? this.prisma.projectLocale.findMany({
            where: { projectKey: canonicalKey },
            select: { locale: true, aliases: true },
          })
        : Promise.resolve([]),
    ])

    return this.toProjectItem(project, { locale: matchRegisteredLocale(registered, locale) })
  }

  async create(dto: CreateProjectDto): Promise<ProjectItem> {
    const optionalMin = this.normalizeOptionalComparable(dto.optional_update_min_comparable_version)
    const optionalMax = this.normalizeOptionalComparable(dto.optional_update_max_comparable_version)

    this.validateComparableRange(optionalMin, optionalMax)

    const projectKey = normalizeProjectKey(dto.project_key)
    // project 与 alias 共享同一命名空间：新建 key 不能撞上别的项目改名遗留的别名，
    // 否则旧 key 的跳转目标就有歧义（unique 约束只挡项目之间的重名）。
    await this.ensureKeyNotAlias(projectKey)

    try {
      const project = await this.prisma.project.create({
        data: {
          projectKey,
          name: dto.name,
          repoUrl: dto.repo_url,
          description: dto.description,
          author: dto.author,
          authorHomepageUrl: dto.author_homepage_url,
          iconUrl: dto.icon_url,
          websiteUrl: dto.website_url,
          docsUrl: dto.docs_url,
          publishedAt: dto.published_at,
          optionalUpdateMinComparableVersion: optionalMin,
          optionalUpdateMaxComparableVersion: optionalMax,
          statsRetentionDays: dto.stats_retention_days,
          eventCollectionEnabled: dto.event_collection_enabled,
          eventRetentionDays: dto.event_retention_days,
        },
        include: PROJECT_WITH_ALIASES,
      })

      return this.toProjectItem(project, { includeTranslations: true })
    } catch (error: unknown) {
      if (isUniqueViolation(error)) {
        throw new ConflictException("project_key already exists")
      }

      throw error
    }
  }

  async update(id: string, dto: UpdateProjectDto): Promise<ProjectItem> {
    const canonicalKey = await this.projectResolver.resolveCanonicalKeyOrThrow(id)
    const project = await this.prisma.project.findUniqueOrThrow({
      where: { projectKey: canonicalKey },
    })

    // Determine effective values: if DTO has explicit value (including null), use it; otherwise use existing
    const effectiveMin =
      "optional_update_min_comparable_version" in dto
        ? this.normalizeOptionalComparable(dto.optional_update_min_comparable_version)
        : project.optionalUpdateMinComparableVersion
    const effectiveMax =
      "optional_update_max_comparable_version" in dto
        ? this.normalizeOptionalComparable(dto.optional_update_max_comparable_version)
        : project.optionalUpdateMaxComparableVersion

    this.validateComparableRange(effectiveMin, effectiveMax)

    const nextKey = dto.project_key === undefined ? undefined : normalizeProjectKey(dto.project_key)
    const isRename = nextKey !== undefined && nextKey !== project.projectKey

    if (isRename) {
      await this.ensureRenameTargetAvailable(nextKey, project.projectKey)
    }

    const data: Prisma.ProjectUpdateInput = {
      name: dto.name,
      repoUrl: dto.repo_url,
      description: dto.description,
      author: dto.author,
      authorHomepageUrl: dto.author_homepage_url,
      iconUrl: dto.icon_url,
      websiteUrl: dto.website_url,
      docsUrl: dto.docs_url,
      publishedAt: dto.published_at,
      optionalUpdateMinComparableVersion:
        "optional_update_min_comparable_version" in dto
          ? this.normalizeOptionalComparable(dto.optional_update_min_comparable_version)
          : undefined,
      optionalUpdateMaxComparableVersion:
        "optional_update_max_comparable_version" in dto
          ? this.normalizeOptionalComparable(dto.optional_update_max_comparable_version)
          : undefined,
      statsRetentionDays: dto.stats_retention_days,
      eventCollectionEnabled: dto.event_collection_enabled,
      eventRetentionDays: dto.event_retention_days,
      updatedAt: nowSeconds(),
    }

    // 传了就整体替换：逐条 upsert 没法表达「删掉某个语言」，与「表单里那几个语言
    // 页签就是全部」的编辑心智也一致。不传则原样保留。
    const translations = await this.resolveProjectTranslations(project.projectKey, dto.translations)
    if (translations) {
      data.translations = { deleteMany: {}, create: translations }
    }

    try {
      if (!isRename) {
        const updated = await this.prisma.project.update({
          where: { projectKey: project.projectKey },
          data,
          include: PROJECT_WITH_ALIASES,
        })
        return this.toProjectItem(updated, { includeTranslations: true })
      }

      // 改名保留旧 key：三步须原子完成。
      //   1. 若新 key 曾是本项目的别名（改回旧名），先删掉——它将重新成为主键。
      //   2. 改主键：子表与其余旧别名经外键 onUpdate CASCADE 自动跟到新 key。
      //   3. 把旧 key 登记为别名，指向新 key，使旧 key 仍能访问到本项目。
      const updated = await this.prisma.$transaction(async (tx) => {
        await tx.projectAlias.deleteMany({ where: { alias: nextKey } })
        await tx.project.update({
          where: { projectKey: project.projectKey },
          data: { ...data, projectKey: nextKey },
        })
        await tx.projectAlias.create({
          data: { alias: project.projectKey, projectKey: nextKey },
        })
        return tx.project.findUniqueOrThrow({
          where: { projectKey: nextKey },
          include: PROJECT_WITH_ALIASES,
        })
      })

      return this.toProjectItem(updated, { includeTranslations: true })
    } catch (error: unknown) {
      if (isUniqueViolation(error)) {
        throw new ConflictException("project_key already exists")
      }

      throw error
    }
  }

  async remove(id: string): Promise<void> {
    const canonicalKey = await this.projectResolver.resolveCanonicalKeyOrThrow(id)
    // 删项目会经外键 onDelete CASCADE 一并清掉它的全部别名。
    await this.prisma.project.delete({ where: { projectKey: canonicalKey } })
  }

  /** 列出项目的全部别名（改名遗留的旧 Project Key），新到旧。 */
  async listAliases(id: string): Promise<{ data: { alias: string; created_at: number }[] }> {
    const canonicalKey = await this.projectResolver.resolveCanonicalKeyOrThrow(id)
    const aliases = await this.prisma.projectAlias.findMany({
      where: { projectKey: canonicalKey },
      orderBy: { createdAt: "desc" },
      select: { alias: true, createdAt: true },
    })

    return { data: aliases.map((item) => ({ alias: item.alias, created_at: item.createdAt })) }
  }

  /**
   * 删除一个别名。删除后该旧 key 不再指向本项目，此后以它访问会 404，
   * 且它重新变为可用的 Project Key。别名不属于本项目则 404。
   */
  async removeAlias(id: string, alias: string): Promise<void> {
    const canonicalKey = await this.projectResolver.resolveCanonicalKeyOrThrow(id)
    const normalizedAlias = normalizeProjectKey(alias)
    const result = await this.prisma.projectAlias.deleteMany({
      where: { alias: normalizedAlias, projectKey: canonicalKey },
    })
    if (result.count === 0) {
      throw new NotFoundException("Alias not found")
    }
  }

  /** 列出项目注册的语言，先注册的在前——注册顺序通常就是运营者心里的优先级。 */
  async listLocales(id: string): Promise<{ data: ProjectLocaleItem[] }> {
    const canonicalKey = await this.projectResolver.resolveCanonicalKeyOrThrow(id)
    const locales = await this.prisma.projectLocale.findMany({
      where: { projectKey: canonicalKey },
      orderBy: { createdAt: "asc" },
      select: { locale: true, aliases: true, label: true, createdAt: true },
    })

    return {
      data: locales.map((item) => ({
        locale: item.locale,
        aliases: item.aliases,
        label: item.label,
        created_at: item.createdAt,
      })),
    }
  }

  /**
   * 注册一个语言。已注册（主标签或同义标签命中，均忽略大小写）则更新它的同义标签与
   * 展示名，不新建第二行——同一语言存成 `zh-CN` 和 `zh-cn` 两份，译文就会分裂。
   */
  async addLocale(id: string, dto: CreateProjectLocaleDto): Promise<ProjectLocaleItem> {
    const canonicalKey = await this.projectResolver.resolveCanonicalKeyOrThrow(id)

    const existing = await this.prisma.projectLocale.findMany({
      where: { projectKey: canonicalKey },
      select: { locale: true, aliases: true },
    })
    const canonical = matchRegisteredLocale(existing, dto.locale) ?? dto.locale
    const aliases = this.normalizeLocaleAliases(existing, canonical, dto.aliases)

    const saved = await this.prisma.projectLocale.upsert({
      where: { projectKey_locale: { projectKey: canonicalKey, locale: canonical } },
      create: {
        projectKey: canonicalKey,
        locale: canonical,
        aliases,
        label: dto.label ?? null,
      },
      update: { aliases, label: dto.label ?? null },
      select: { locale: true, aliases: true, label: true, createdAt: true },
    })

    return {
      locale: saved.locale,
      aliases: saved.aliases,
      label: saved.label,
      created_at: saved.createdAt,
    }
  }

  /**
   * 同义标签去重并校验：不能与自己的主标签重复（冗余），也不能撞上本项目**其它**
   * 语言的主标签或同义标签——撞了就说不清客户端传这个标签时该命中谁。
   */
  private normalizeLocaleAliases(
    existing: { locale: string; aliases: string[] }[],
    canonical: string,
    aliases: string[] | undefined,
  ): string[] {
    if (!aliases?.length) {
      return []
    }

    const canonicalKeyValue = localeKey(canonical)
    const others = existing.filter((item) => localeKey(item.locale) !== canonicalKeyValue)
    const taken = new Map<string, string>()
    for (const item of others) {
      taken.set(localeKey(item.locale), item.locale)
      for (const alias of item.aliases) {
        taken.set(localeKey(alias), item.locale)
      }
    }

    const seen = new Set<string>()
    const result: string[] = []
    for (const raw of aliases) {
      const alias = raw.trim()
      const key = localeKey(alias)
      if (!alias || key === canonicalKeyValue || seen.has(key)) {
        continue
      }

      const owner = taken.get(key)
      if (owner) {
        throw new BadRequestException(
          `Alias "${alias}" is already used by locale "${owner}" in this project.`,
        )
      }

      seen.add(key)
      result.push(alias)
    }

    return result
  }

  /**
   * 注销一个语言。**不删已有译文**：译文留在库里，只是因为语言未注册而暂时
   * 不可达（公开端会回落到默认内容），重新注册即恢复。误删语言不该连带丢内容。
   */
  async removeLocale(id: string, locale: string): Promise<void> {
    const canonicalKey = await this.projectResolver.resolveCanonicalKeyOrThrow(id)
    const existing = await this.prisma.projectLocale.findMany({
      where: { projectKey: canonicalKey },
      select: { locale: true, aliases: true },
    })

    const canonical = matchRegisteredLocale(existing, locale)
    if (!canonical) {
      throw new NotFoundException("Locale not found")
    }

    await this.prisma.projectLocale.delete({
      where: { projectKey_locale: { projectKey: canonicalKey, locale: canonical } },
    })
  }

  /**
   * 校验并归一化提交的项目译文。返回 undefined 表示"这次不动译文"。
   * 规则与公告译文一致：语言必须注册过、同一请求不能重复、一行至少有一个字段有值。
   */
  private async resolveProjectTranslations(
    projectKey: string,
    translations: ProjectTranslationDto[] | undefined,
  ): Promise<ProjectTranslationItem[] | undefined> {
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

      const name = item.name?.trim() || null
      const description = item.description?.trim() || null
      if (!name && !description) {
        throw new BadRequestException(
          `Translation for locale "${item.locale}" sets nothing. Provide a name or a description.`,
        )
      }

      return { locale: canonical, name, description }
    })
  }

  // 新 key 不能已被别的项目用作别名（project 与 alias 同命名空间，见 create）。
  private async ensureKeyNotAlias(projectKey: string): Promise<void> {
    const alias = await this.prisma.projectAlias.findUnique({
      where: { alias: projectKey },
      select: { alias: true },
    })
    if (alias) {
      throw new ConflictException("project_key is already used as an alias of another project")
    }
  }

  // 改名目标 key 的可用性：不能撞上其它项目，也不能是别的项目的别名；
  // 若是本项目自己的别名（改回旧名）则放行，改名事务会把它转正为主键。
  private async ensureRenameTargetAvailable(nextKey: string, currentKey: string): Promise<void> {
    const existingProject = await this.prisma.project.findUnique({
      where: { projectKey: nextKey },
      select: { projectKey: true },
    })
    if (existingProject) {
      throw new ConflictException("project_key already exists")
    }

    const alias = await this.prisma.projectAlias.findUnique({
      where: { alias: nextKey },
      select: { projectKey: true },
    })
    if (alias && alias.projectKey !== currentKey) {
      throw new ConflictException("project_key is already used as an alias of another project")
    }
  }

  async previewFromGithubRepo(repoUrl: string): Promise<GithubRepoPreview> {
    const { owner, repo } = parseGithubRepository(repoUrl)
    const endpoint = `https://api.github.com/repos/${owner}/${repo}`

    const response = await fetch(endpoint, {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "Verhub/1.2",
      },
    })

    if (!response.ok) {
      if (response.status === 404) {
        throw new NotFoundException("GitHub repository not found")
      }

      throw new BadGatewayException(`GitHub API request failed with status ${response.status}`)
    }

    const payload = (await response.json()) as {
      name?: string
      full_name?: string
      description?: string | null
      html_url?: string
      homepage?: string | null
      created_at?: string
      owner?: {
        login?: string
        html_url?: string
        avatar_url?: string
      }
    }

    const resolvedRepo = payload.name?.trim() || repo
    const displayName = payload.full_name?.trim() || `${owner}/${resolvedRepo}`
    const finalRepoUrl = payload.html_url?.trim() || `https://github.com/${owner}/${resolvedRepo}`

    const publishedAt = payload.created_at
      ? Math.floor(new Date(payload.created_at).getTime() / 1000)
      : null

    return {
      project_key: normalizeProjectKey(`${owner}-${resolvedRepo}`),
      name: displayName,
      repo_url: finalRepoUrl,
      description: payload.description?.trim() || null,
      author: payload.owner?.login?.trim() || null,
      author_homepage_url: payload.owner?.html_url?.trim() || null,
      icon_url: payload.owner?.avatar_url?.trim() || null,
      website_url: payload.homepage?.trim() || null,
      // GitHub 仓库信息里没有对应的文档站字段，只能留空由用户手填
      docs_url: null,
      published_at: Number.isFinite(publishedAt) ? publishedAt : null,
      optional_update_min_comparable_version: null,
      optional_update_max_comparable_version: null,
    }
  }

  getStatus(): { module: string; implemented: boolean } {
    return {
      module: "projects",
      implemented: true,
    }
  }

  /**
   * @param options.locale 公开端请求的语言（已归一到主标签）。译文按字段覆盖：
   *   名称与描述各自留空就回落项目自身的值。
   * @param options.includeTranslations 后台接口带出全部译文供编辑；公开端不带。
   */
  private toProjectItem(
    project: {
      projectKey: string
      name: string
      repoUrl: string | null
      description: string | null
      author: string | null
      authorHomepageUrl: string | null
      iconUrl: string | null
      websiteUrl: string | null
      docsUrl: string | null
      publishedAt: number | null
      optionalUpdateMinComparableVersion: string | null
      optionalUpdateMaxComparableVersion: string | null
      statsRetentionDays: number
      eventCollectionEnabled: boolean
      eventRetentionDays: number
      aliases?: { alias: string }[]
      translations?: { locale: string; name: string | null; description: string | null }[]
      createdAt: number
      updatedAt: number
    },
    options: { locale?: string | null; includeTranslations?: boolean } = {},
  ): ProjectItem {
    const translation = options.locale
      ? project.translations?.find((item) => item.locale === options.locale)
      : undefined
    const name = translation?.name ?? null
    const description = translation?.description ?? null

    return {
      id: project.projectKey,
      project_key: project.projectKey,
      name: name ?? project.name,
      repo_url: project.repoUrl,
      description: description ?? project.description,
      author: project.author,
      author_homepage_url: project.authorHomepageUrl,
      icon_url: project.iconUrl,
      website_url: project.websiteUrl,
      docs_url: project.docsUrl,
      published_at: project.publishedAt,
      optional_update_min_comparable_version: project.optionalUpdateMinComparableVersion,
      optional_update_max_comparable_version: project.optionalUpdateMaxComparableVersion,
      stats_retention_days: project.statsRetentionDays,
      event_collection_enabled: project.eventCollectionEnabled,
      event_retention_days: project.eventRetentionDays,
      aliases: project.aliases?.map((item) => item.alias) ?? [],
      // 两个字段都留空的译文行对返回内容毫无贡献，报出去会让调用方以为拿到了译文。
      locale: name || description ? (translation?.locale ?? null) : null,
      ...(options.includeTranslations
        ? {
            translations: (project.translations ?? []).map((item) => ({
              locale: item.locale,
              name: item.name,
              description: item.description,
            })),
          }
        : {}),
      created_at: project.createdAt,
      updated_at: project.updatedAt,
    }
  }

  private validateComparableRange(min?: string | null, max?: string | null): void {
    if (min) {
      parseComparableVersion(min)
    }

    if (max) {
      parseComparableVersion(max)
    }

    if (min != null && max != null && compareComparableVersions(min, max) > 0) {
      throw new BadRequestException(
        "optional_update_min_comparable_version must be less than or equal to optional_update_max_comparable_version",
      )
    }
  }

  private normalizeOptionalComparable(value: string | null | undefined): string | null | undefined {
    if (value === undefined) {
      return undefined
    }
    if (value === null) {
      return null
    }

    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : null
  }
}
