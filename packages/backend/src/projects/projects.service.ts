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
import { parseGithubRepository } from "../versions/github-release.service"
import { CreateProjectDto } from "./dto/create-project.dto"
import { QueryProjectsDto } from "./dto/query-projects.dto"
import { UpdateProjectDto } from "./dto/update-project.dto"
import { compareComparableVersions, parseComparableVersion } from "../versions/version-comparator"

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
  /// 该项目改名后保留的旧 Project Key，均可作为别名访问到本项目。新到旧排序。
  aliases: string[]
  created_at: number
  updated_at: number
}

/// 查项目时一并带出别名，供 toProjectItem 填充 aliases 字段。
const PROJECT_WITH_ALIASES = {
  aliases: { select: { alias: true }, orderBy: { createdAt: "desc" } },
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
    const [total, data] = await this.prisma.$transaction([
      this.prisma.project.count(),
      this.prisma.project.findMany({
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
      data: data.map((project) => this.toProjectItem(project)),
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

    return this.toProjectItem(project)
  }

  async findOneByProjectKey(projectKey: string): Promise<ProjectItem> {
    // 公共详情：旧 key（别名）经解析后仍返回当前项目，客户端无需感知改名。
    const canonicalKey = await this.projectResolver.resolveCanonicalKeyOrThrow(projectKey)
    const project = await this.prisma.project.findUniqueOrThrow({
      where: { projectKey: canonicalKey },
      include: PROJECT_WITH_ALIASES,
    })

    return this.toProjectItem(project)
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
        },
        include: PROJECT_WITH_ALIASES,
      })

      return this.toProjectItem(project)
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
      updatedAt: nowSeconds(),
    }

    try {
      if (!isRename) {
        const updated = await this.prisma.project.update({
          where: { projectKey: project.projectKey },
          data,
          include: PROJECT_WITH_ALIASES,
        })
        return this.toProjectItem(updated)
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

      return this.toProjectItem(updated)
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

  private toProjectItem(project: {
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
    aliases?: { alias: string }[]
    createdAt: number
    updatedAt: number
  }): ProjectItem {
    return {
      id: project.projectKey,
      project_key: project.projectKey,
      name: project.name,
      repo_url: project.repoUrl,
      description: project.description,
      author: project.author,
      author_homepage_url: project.authorHomepageUrl,
      icon_url: project.iconUrl,
      website_url: project.websiteUrl,
      docs_url: project.docsUrl,
      published_at: project.publishedAt,
      optional_update_min_comparable_version: project.optionalUpdateMinComparableVersion,
      optional_update_max_comparable_version: project.optionalUpdateMaxComparableVersion,
      stats_retention_days: project.statsRetentionDays,
      aliases: project.aliases?.map((item) => item.alias) ?? [],
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
