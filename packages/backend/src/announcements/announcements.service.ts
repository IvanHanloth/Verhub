import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common"
import { Platform, Prisma } from "@prisma/client"

import { PrismaService } from "../database/prisma.service"
import { ProjectResolverService } from "../database/project-resolver.service"
import { nowSeconds } from "../common/utils"
import { matchRegisteredLocale } from "../common/locale"
import { fromPlatforms, type PlatformValue } from "../common/platform"
import { searchContains } from "../common/query-filters"
import { toComparableVersionSortKey } from "../versions/version-comparator"
import { AnnouncementTranslationDto, CreateAnnouncementDto } from "./dto/create-announcement.dto"
import { QueryAnnouncementsDto } from "./dto/query-announcements.dto"
import { UpdateAnnouncementDto } from "./dto/update-announcement.dto"

type AnnouncementTranslationItem = {
  locale: string
  title: string | null
  content: string | null
  is_hidden: boolean
}

/** 写库用的译文形态（Prisma 字段名），与对外的 snake_case 形态分开。 */
type AnnouncementTranslationInput = {
  locale: string
  title: string | null
  content: string | null
  isHidden: boolean
}

type AnnouncementItem = {
  id: string
  title: string
  content: string
  is_pinned: boolean
  is_hidden: boolean
  platforms: PlatformValue[]
  author: string | null
  min_comparable_version: string | null
  max_comparable_version: string | null
  /**
   * 本次返回的 title / content 实际是哪个语言的译文；null 表示默认内容。
   * 让客户端一眼看出有没有发生回落，不必自己比对文案。
   */
  locale: string | null
  /** 全部译文，仅后台接口返回；公开端不带，避免把没请求的语言一并推给客户端。 */
  translations?: AnnouncementTranslationItem[]
  published_at: number
  created_at: number
  updated_at: number
}

/** 带译文一起取出来的公告行。译文由调用方决定是取某一个语言还是全部。 */
type AnnouncementRow = Prisma.AnnouncementGetPayload<{ include: { translations: true } }>

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

/**
 * 版本维度的可见范围（闭区间，两端各自可空）。
 *
 * 比较落在 SQL 层：范围两端各存了一个定长排序键（生成规则同 Version.comparableVersionSort），
 * 定长纯数字串的字典序就是版本序，所以 lte / gte 直接可用——不必把公告全量拉进内存过滤，
 * 分页也不会因此错位。
 *
 * 客户端没报版本号（或版本号换算不出排序键）时收紧成「两端都为空」：判断不了范围就
 * 不展示带范围的公告，把「仅限 2.x」推给不知道自己版本的客户端只会造成困惑。
 */
function versionScopeFilter(clientSortKey: string | null): Prisma.AnnouncementWhereInput[] {
  if (!clientSortKey) {
    return [{ minComparableVersionSort: null, maxComparableVersionSort: null }]
  }

  return [
    {
      OR: [
        { minComparableVersionSort: null },
        { minComparableVersionSort: { lte: clientSortKey } },
      ],
    },
    {
      OR: [
        { maxComparableVersionSort: null },
        { maxComparableVersionSort: { gte: clientSortKey } },
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

/**
 * 语言级隐藏：该语言下标了 isHidden 的公告整条不返回。
 *
 * 与公告自身的 isHidden 是两层——那个对所有人生效，这个只对某个语言生效，
 * 所以没解析出语言时不加这条过滤。`NOT ... some` 会翻成 SQL 的 NOT EXISTS，
 * 过滤仍在数据库里完成，分页不会错位。
 */
function localeHiddenFilter(locale: string | null): Prisma.AnnouncementWhereInput[] {
  if (!locale) {
    return []
  }

  return [{ NOT: { translations: { some: { locale, isHidden: true } } } }]
}

/**
 * 公开端只取请求语言那一份译文。语言没命中注册表时用一个恒假的 where，
 * 让 Prisma 返回空数组——比在结果里再过滤一遍少一次遍历，也少一条分支。
 */
function translationInclude(locale: string | null): {
  translations: { where: { locale: string } }
} {
  return { translations: { where: { locale: locale ?? "" } } }
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
        include: { translations: true },
      }),
    ])

    return {
      total,
      data: data.map((item) => this.toAnnouncementItem(item, { includeTranslations: true })),
    }
  }

  async findOne(projectKey: string, id: string): Promise<AnnouncementItem> {
    const normalizedProjectKey = await this.resolveProjectKey(projectKey)
    const announcement = await this.prisma.announcement.findFirst({
      where: {
        id,
        projectKey: normalizedProjectKey,
      },
      include: { translations: true },
    })
    if (!announcement) {
      throw new NotFoundException("Announcement not found")
    }

    return this.toAnnouncementItem(announcement, { includeTranslations: true })
  }

  async findAllByProjectKey(
    projectKey: string,
    query: QueryAnnouncementsDto,
  ): Promise<AnnouncementListResponse> {
    const normalizedProjectKey = await this.resolveProjectKey(projectKey)
    const [clientSortKey, locale] = await Promise.all([
      this.resolveClientVersionSortKey(normalizedProjectKey, query.version),
      this.resolveRegisteredLocale(normalizedProjectKey, query.locale),
    ])

    // 公开端永远只返回未隐藏的公告：is_hidden / is_pinned 是后台的筛选维度，
    // 客户端传了也不生效。
    const where: Prisma.AnnouncementWhereInput = {
      projectKey: normalizedProjectKey,
      isHidden: false,
      AND: [
        ...platformScopeFilter(query.platform),
        ...versionScopeFilter(clientSortKey),
        ...localeHiddenFilter(locale),
        ...searchFilter(query.search),
      ],
    }

    const [total, data] = await this.prisma.$transaction([
      this.prisma.announcement.count({ where }),
      this.prisma.announcement.findMany({
        where,
        take: query.limit,
        skip: query.offset,
        orderBy: [{ isPinned: "desc" }, { createdAt: "desc" }],
        include: translationInclude(locale),
      }),
    ])

    return {
      total,
      data: data.map((item) => this.toAnnouncementItem(item, { locale })),
    }
  }

  async findLatestByProjectKey(
    projectKey: string,
    query?: Pick<QueryAnnouncementsDto, "platform" | "version" | "locale">,
  ): Promise<AnnouncementItem> {
    const normalizedProjectKey = await this.resolveProjectKey(projectKey)
    const [clientSortKey, locale] = await Promise.all([
      this.resolveClientVersionSortKey(normalizedProjectKey, query?.version),
      this.resolveRegisteredLocale(normalizedProjectKey, query?.locale),
    ])

    const where: Prisma.AnnouncementWhereInput = {
      projectKey: normalizedProjectKey,
      isHidden: false,
      AND: [
        ...platformScopeFilter(query?.platform),
        ...versionScopeFilter(clientSortKey),
        ...localeHiddenFilter(locale),
      ],
    }

    const latest = await this.prisma.announcement.findFirst({
      where,
      orderBy: { createdAt: "desc" },
      include: translationInclude(locale),
    })
    if (!latest) {
      throw new NotFoundException("Announcement not found")
    }

    return this.toAnnouncementItem(latest, { locale })
  }

  async create(projectKey: string, dto: CreateAnnouncementDto): Promise<AnnouncementItem> {
    const normalizedProjectKey = await this.resolveProjectKey(projectKey)
    const translations = await this.resolveTranslations(normalizedProjectKey, dto.translations)

    const created = await this.prisma.announcement.create({
      data: {
        projectKey: normalizedProjectKey,
        title: dto.title,
        content: dto.content,
        isPinned: dto.is_pinned ?? false,
        isHidden: dto.is_hidden ?? false,
        platforms: normalizePlatforms(dto.platforms),
        author: dto.author,
        minComparableVersion: dto.min_comparable_version,
        maxComparableVersion: dto.max_comparable_version,
        minComparableVersionSort: toComparableVersionSortKey(dto.min_comparable_version),
        maxComparableVersionSort: toComparableVersionSortKey(dto.max_comparable_version),
        publishedAt: dto.published_at,
        ...(translations ? { translations: { create: translations } } : {}),
      },
      include: { translations: true },
    })

    return this.toAnnouncementItem(created, { includeTranslations: true })
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

    const translations = await this.resolveTranslations(normalizedProjectKey, dto.translations)

    const updated = await this.prisma.announcement.update({
      where: { id },
      data: {
        title: dto.title,
        content: dto.content,
        isPinned: dto.is_pinned,
        isHidden: dto.is_hidden,
        platforms: dto.platforms ? normalizePlatforms(dto.platforms) : undefined,
        author: dto.author,
        minComparableVersion: dto.min_comparable_version,
        maxComparableVersion: dto.max_comparable_version,
        minComparableVersionSort: toComparableVersionSortKey(dto.min_comparable_version),
        maxComparableVersionSort: toComparableVersionSortKey(dto.max_comparable_version),
        publishedAt: dto.published_at,
        updatedAt: nowSeconds(),
        // 传了就整体替换：逐条 upsert 没法表达「删掉某个语言」，而整体替换与
        // 「表单里那几个语言页签就是全部」的编辑心智一致。不传则原样保留。
        ...(translations ? { translations: { deleteMany: {}, create: translations } } : {}),
      },
      include: { translations: true },
    })

    return this.toAnnouncementItem(updated, { includeTranslations: true })
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

  /**
   * 客户端上报的版本号 → 定长排序键。
   *
   * 先直接当可比较版本号换算；换算不了再去版本表按 version 精确查一次，取那条已经
   * 算好的排序键——客户端报的通常是展示用的版本号（可能带自家的命名习惯），
   * 不该要求它先自行换算成可比较版本号。两条路都不通就返回 null，等同没报版本号。
   */
  private async resolveClientVersionSortKey(
    projectKey: string,
    version: string | undefined,
  ): Promise<string | null> {
    const trimmed = version?.trim()
    if (!trimmed) {
      return null
    }

    const direct = toComparableVersionSortKey(trimmed)
    if (direct) {
      return direct
    }

    const record = await this.prisma.version.findFirst({
      where: { projectKey, version: trimmed },
      select: { comparableVersionSort: true },
    })

    return record?.comparableVersionSort ?? null
  }

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
   * 校验并归一化提交的译文集合。返回 undefined 表示"这次不动译文"。
   *
   * 三条硬性规则：语言必须先在项目里注册过（同义标签同样算命中），同一请求里不能
   * 重复提交同一个语言，以及一行至少要有一项有意义的设置——三个字段全空的译文行
   * 存下来只会让人以为配过什么。都直接 400，静默丢弃会让人以为存上了。
   */
  private async resolveTranslations(
    projectKey: string,
    translations: AnnouncementTranslationDto[] | undefined,
  ): Promise<AnnouncementTranslationInput[] | undefined> {
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
      const isHidden = item.is_hidden ?? false
      if (!title && !content && !isHidden) {
        throw new BadRequestException(
          `Translation for locale "${item.locale}" sets nothing. Provide a title, a content, or is_hidden.`,
        )
      }

      return { locale: canonical, title, content, isHidden }
    })
  }

  /**
   * @param options.locale 公开端请求的语言（已归一到主标签）。译文按字段覆盖：
   *   标题与正文各自留空就回落默认内容，所以永远有东西可返回。
   * @param options.includeTranslations 后台接口带出全部译文供编辑；公开端不带。
   */
  private toAnnouncementItem(
    announcement: AnnouncementRow,
    options: { locale?: string | null; includeTranslations?: boolean } = {},
  ): AnnouncementItem {
    const translation = options.locale
      ? announcement.translations.find((item) => item.locale === options.locale)
      : undefined
    const title = translation?.title ?? null
    const content = translation?.content ?? null

    return {
      id: announcement.id,
      title: title ?? announcement.title,
      content: content ?? announcement.content,
      is_pinned: announcement.isPinned,
      is_hidden: announcement.isHidden,
      platforms: fromPlatforms(announcement.platforms),
      author: announcement.author,
      min_comparable_version: announcement.minComparableVersion,
      max_comparable_version: announcement.maxComparableVersion,
      // 只有真的覆盖了内容才算"返回的是该语言的译文"；一行仅设了 isHidden 的
      // 译文对可见的那部分内容毫无贡献，报出去会让调用方以为拿到了译文。
      locale: title || content ? (translation?.locale ?? null) : null,
      ...(options.includeTranslations
        ? {
            translations: announcement.translations.map((item) => ({
              locale: item.locale,
              title: item.title,
              content: item.content,
              is_hidden: item.isHidden,
            })),
          }
        : {}),
      published_at: announcement.publishedAt,
      created_at: announcement.createdAt,
      updated_at: announcement.updatedAt,
    }
  }
}
