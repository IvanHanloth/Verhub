import { Injectable, NotFoundException } from "@nestjs/common"

import { Prisma, Platform } from "@prisma/client"

import { PrismaService } from "../database/prisma.service"
import { ProjectResolverService } from "../database/project-resolver.service"
import { FeedbackIssueService, type ForwardedIssue } from "../github-app/feedback-issue.service"
import type { PublicFeedbackOptions } from "../github-app/types"
import { buildDedupHash, resolveDedupWindowSeconds, stableStringify } from "../common/dedup"
import { nowSeconds } from "../common/utils"
import { fromPlatform, toPlatform, type PlatformValue } from "../common/platform"
import { searchContains } from "../common/query-filters"
import type { ClientOrigin } from "../geo/client-origin.service"
import { CreateFeedbackDto } from "./dto/create-feedback.dto"
import { QueryFeedbacksDto } from "./dto/query-feedbacks.dto"
import { UpdateFeedbackDto } from "./dto/update-feedback.dto"

type FeedbackItem = {
  id: string
  user_id: string | null
  rating: number | null
  content: string
  contact: string | null
  is_hidden: boolean
  platform: PlatformValue | null
  platform_version: string | null
  custom_data: Prisma.JsonValue | null
  forwarded_to_github: boolean
  github_issue_number: number | null
  github_issue_url: string | null
  ip: string | null
  user_agent: string | null
  country_code: string | null
  country_name: string | null
  region_name: string | null
  city: string | null
  created_at: number
}

type FeedbackRecord = {
  id: string
  userId: string | null
  rating: number | null
  content: string
  contact: string | null
  isHidden: boolean
  platform: Platform | null
  platformVersion: string | null
  customData: Prisma.JsonValue | null
  forwardedToGithub: boolean
  githubIssueNumber: number | null
  githubIssueUrl: string | null
  ip: string | null
  userAgent: string | null
  countryCode: string | null
  countryName: string | null
  regionName: string | null
  city: string | null
  createdAt: number
}

type FeedbackListResponse = {
  total: number
  data: FeedbackItem[]
}

@Injectable()
export class FeedbacksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectResolver: ProjectResolverService,
    private readonly feedbackIssueService: FeedbackIssueService,
  ) {}

  /** 全量统计，隐藏的反馈同样计入：隐藏只是不展示，不是撤回评分。 */
  async getStatistics(): Promise<{ count: number; rate_count: number; rate_avg: number | null }> {
    const [count, rated] = await Promise.all([
      this.prisma.feedback.count(),
      this.prisma.feedback.findMany({
        where: { rating: { not: null } },
        select: { rating: true },
      }),
    ])

    const rateCount = rated.length
    const totalScore = rated.reduce((sum, item) => sum + (item.rating ?? 0), 0)
    const rateAvg = rateCount > 0 ? totalScore / rateCount : null

    return {
      count,
      rate_count: rateCount,
      rate_avg: rateAvg,
    }
  }

  async findAll(projectKey: string, query: QueryFeedbacksDto): Promise<FeedbackListResponse> {
    const normalizedProjectKey = await this.resolveProjectKey(projectKey)

    // 隐藏的反馈只是不出现在列表里；统计接口照旧全量计算，所以隐藏不会改变平均分。
    const where: Prisma.FeedbackWhereInput = {
      projectKey: normalizedProjectKey,
      platform: toPlatform(query.platform) ?? undefined,
      rating: query.rating,
      ...(query.include_hidden ? {} : { isHidden: false }),
      ...(query.search ? { OR: this.buildSearchFilters(query.search) } : {}),
    }

    const [total, data] = await this.prisma.$transaction([
      this.prisma.feedback.count({ where }),
      this.prisma.feedback.findMany({
        where,
        take: query.limit,
        skip: query.offset,
        orderBy: { createdAt: "desc" },
      }),
    ])

    return {
      total,
      data: data.map((feedback) => this.toFeedbackItem(feedback)),
    }
  }

  /**
   * 关键字命中范围：正文 + 提交者标识 + 服务端记录的来源字段。
   *
   * 联系方式也在内，因为按邮箱回捞同一个人的历史反馈是这页最常见的用法；
   * custom_data 是 JSON 列，不参与匹配。
   */
  private buildSearchFilters(search: string): Prisma.FeedbackWhereInput[] {
    const contains = searchContains(search)

    return [
      { content: contains },
      { userId: contains },
      { contact: contains },
      { ip: contains },
      { city: contains },
      { countryName: contains },
      { regionName: contains },
      { platformVersion: contains },
    ]
  }

  async findOne(projectKey: string, id: string): Promise<FeedbackItem> {
    const normalizedProjectKey = await this.resolveProjectKey(projectKey)
    const feedback = await this.prisma.feedback.findFirst({
      where: {
        id,
        projectKey: normalizedProjectKey,
      },
    })
    if (!feedback) {
      throw new NotFoundException("Feedback not found")
    }

    return this.toFeedbackItem(feedback)
  }

  /**
   * 公开端的提交选项。目前只播报「本项目是否接受转发到 GitHub」，
   * 客户端据此决定要不要给用户显示那个勾选框以及联系方式的必填标记。
   */
  async getPublicOptions(projectKey: string): Promise<PublicFeedbackOptions> {
    const normalizedProjectKey = await this.resolveProjectKey(projectKey)
    return this.feedbackIssueService.getPublicOptions(normalizedProjectKey)
  }

  async createByProjectKey(
    projectKey: string,
    dto: CreateFeedbackDto,
    origin: ClientOrigin,
  ): Promise<FeedbackItem> {
    const normalizedProjectKey = await this.resolveProjectKey(projectKey)

    // 只有勾了转发的提交才受联系方式必填与单 IP 限流约束。SDK 只在本地预检联系方式，
    // 项目是否开放转发只有服务端知道，客户端拿到的是这里的 400 / 429 与原因文案。
    const forwardToGithub = dto.forward_to_github === true
    await this.feedbackIssueService.assertForwardAllowed(normalizedProjectKey, {
      forward: forwardToGithub,
      contact: dto.contact,
      ip: origin.ip,
    })

    const dedupHash = buildDedupHash([
      normalizedProjectKey,
      dto.user_id,
      dto.rating,
      dto.content,
      dto.contact,
      // 同一段文字「不转发」与「转发」是两次不同的意图，不能被去重折叠掉。
      forwardToGithub ? "forward" : "",
      origin.ip,
      stableStringify(dto.custom_data),
    ])

    // Double-tapped submit buttons and retried requests are the whole reason
    // this exists; a user genuinely re-sending the same text a minute later
    // still gets a second row.
    const window = resolveDedupWindowSeconds()
    if (window > 0) {
      const duplicate = await this.prisma.feedback.findFirst({
        where: { dedupHash, createdAt: { gte: nowSeconds() - window } },
        orderBy: { createdAt: "desc" },
      })
      if (duplicate) {
        return this.toFeedbackItem(duplicate)
      }
    }

    const created = await this.prisma.feedback.create({
      data: {
        projectKey: normalizedProjectKey,
        userId: dto.user_id,
        rating: dto.rating,
        content: dto.content,
        contact: dto.contact,
        isHidden: dto.is_hidden ?? false,
        // The client's own declaration wins; the User-Agent guess only fills a gap.
        platform: toPlatform(dto.platform) ?? origin.platform,
        // 明细统一取 origin：它已经把 body / query / header / UA 四个来源按同一
        // 优先级归一过，这里再解析一遍只会多出一条会漂移的规则。
        platformVersion: origin.platformVersion,
        customData: dto.custom_data as Prisma.InputJsonValue | undefined,
        ip: origin.ip,
        userAgent: origin.userAgent,
        countryCode: origin.countryCode,
        countryName: origin.countryName,
        regionName: origin.regionName,
        city: origin.city,
        dedupHash,
      },
    })

    const item = this.toFeedbackItem(created)
    if (!forwardToGithub) {
      return item
    }

    // 勾了转发的提交，Issue 建成功才算收下：建不成就把刚落的行撤掉，让客户端拿到
    // 失败而不是一条「已收到、其实没报上去」的记录。
    //
    // 先落库再建 Issue 是因为模板要用反馈 id；不用事务包住，是不想让一个最长 10s
    // 的外部请求攥着数据库连接不放。
    let issue: ForwardedIssue
    try {
      issue = await this.feedbackIssueService.forward(normalizedProjectKey, {
        id: item.id,
        content: item.content,
        rating: item.rating,
        contact: item.contact,
        user_id: item.user_id,
        platform: item.platform,
        platform_version: item.platform_version,
        created_at: item.created_at,
      })
    } catch (error) {
      // 补偿删除本身失败也不改写给客户端的错误：转发失败才是他要处理的那件事。
      await this.prisma.feedback.delete({ where: { id: created.id } }).catch(() => undefined)
      throw error
    }

    const forwarded = await this.prisma.feedback.update({
      where: { id: created.id },
      data: {
        forwardedToGithub: true,
        githubIssueNumber: issue.number,
        githubIssueUrl: issue.url,
      },
    })
    return this.toFeedbackItem(forwarded)
  }

  /**
   * 后台手动补录一条反馈（如渠道外收集到的意见）。
   *
   * 不走 dedup、不记来源：管理员的重复提交是有意的，而 ip/UA/地理写成后台自己的
   * 只会污染"这条反馈来自哪个客户端"的判断。
   */
  async createByAdmin(projectKey: string, dto: CreateFeedbackDto): Promise<FeedbackItem> {
    const normalizedProjectKey = await this.resolveProjectKey(projectKey)

    const created = await this.prisma.feedback.create({
      data: {
        projectKey: normalizedProjectKey,
        userId: dto.user_id,
        rating: dto.rating,
        content: dto.content,
        contact: dto.contact,
        isHidden: dto.is_hidden ?? false,
        platform: toPlatform(dto.platform),
        platformVersion: dto.platform_version,
        customData: dto.custom_data as Prisma.InputJsonValue | undefined,
      },
    })

    return this.toFeedbackItem(created)
  }

  async update(projectKey: string, id: string, dto: UpdateFeedbackDto): Promise<FeedbackItem> {
    const normalizedProjectKey = await this.resolveProjectKey(projectKey)
    const existing = await this.prisma.feedback.findFirst({
      where: {
        id,
        projectKey: normalizedProjectKey,
      },
    })
    if (!existing) {
      throw new NotFoundException("Feedback not found")
    }

    const updated = await this.prisma.feedback.update({
      where: { id },
      data: {
        userId: dto.user_id,
        rating: dto.rating,
        content: dto.content,
        contact: dto.contact,
        isHidden: dto.is_hidden,
        platform: toPlatform(dto.platform),
        platformVersion: dto.platform_version,
        customData: dto.custom_data as Prisma.InputJsonValue | undefined,
      },
    })

    return this.toFeedbackItem(updated)
  }

  async remove(projectKey: string, id: string): Promise<void> {
    const normalizedProjectKey = await this.resolveProjectKey(projectKey)
    const existing = await this.prisma.feedback.findFirst({
      where: {
        id,
        projectKey: normalizedProjectKey,
      },
    })
    if (!existing) {
      throw new NotFoundException("Feedback not found")
    }

    await this.prisma.feedback.delete({ where: { id } })
  }

  async updateById(id: string, dto: UpdateFeedbackDto): Promise<FeedbackItem> {
    const feedback = await this.prisma.feedback.findUnique({
      where: { id },
      select: { projectKey: true },
    })
    if (!feedback) {
      throw new NotFoundException("Feedback not found")
    }

    return this.update(feedback.projectKey, id, dto)
  }

  async removeById(id: string): Promise<void> {
    const feedback = await this.prisma.feedback.findUnique({
      where: { id },
      select: { projectKey: true },
    })
    if (!feedback) {
      throw new NotFoundException("Feedback not found")
    }

    await this.remove(feedback.projectKey, id)
  }

  getStatus(): { module: string; implemented: boolean } {
    return {
      module: "feedbacks",
      implemented: true,
    }
  }

  // 把外部 key 解析成当前项目的规范 key（含改名后的别名）；未命中抛 404。
  private resolveProjectKey(projectKey: string): Promise<string> {
    return this.projectResolver.resolveCanonicalKeyOrThrow(projectKey)
  }

  private toFeedbackItem(feedback: FeedbackRecord): FeedbackItem {
    return {
      id: feedback.id,
      user_id: feedback.userId,
      rating: feedback.rating,
      content: feedback.content,
      contact: feedback.contact,
      is_hidden: feedback.isHidden,
      platform: fromPlatform(feedback.platform),
      platform_version: feedback.platformVersion,
      custom_data: feedback.customData,
      forwarded_to_github: feedback.forwardedToGithub,
      github_issue_number: feedback.githubIssueNumber,
      github_issue_url: feedback.githubIssueUrl,
      ip: feedback.ip,
      user_agent: feedback.userAgent,
      country_code: feedback.countryCode,
      country_name: feedback.countryName,
      region_name: feedback.regionName,
      city: feedback.city,
      created_at: feedback.createdAt,
    }
  }
}
