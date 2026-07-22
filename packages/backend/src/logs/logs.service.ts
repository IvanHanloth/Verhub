import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common"

import { Prisma, Platform, LogLevel } from "@prisma/client"

import { PrismaService } from "../database/prisma.service"
import { buildDedupHash, resolveDedupWindowSeconds, stableStringify } from "../common/dedup"
import { normalizeProjectKey, nowSeconds } from "../common/utils"
import { fromPlatform, toPlatform, type PlatformValue } from "../common/platform"
import type { ClientOrigin } from "../geo/client-origin.service"
import { CreateLogDto } from "./dto/create-log.dto"
import { QueryLogsDto } from "./dto/query-logs.dto"
import { UploadLogDto } from "./dto/upload-log.dto"

type LogItem = {
  id: string
  level: number
  content: string
  device_info: Prisma.JsonValue | null
  custom_data: Prisma.JsonValue | null
  ip: string | null
  user_agent: string | null
  country_code: string | null
  country_name: string | null
  region_name: string | null
  city: string | null
  platform: PlatformValue | null
  platform_version: string | null
  created_at: number
}

/** Server-observed origin columns shared by the create path and the mapper. */
type LogRecord = {
  id: string
  level: LogLevel
  content: string
  deviceInfo: Prisma.JsonValue | null
  customData: Prisma.JsonValue | null
  ip: string | null
  userAgent: string | null
  countryCode: string | null
  countryName: string | null
  regionName: string | null
  city: string | null
  platform: Platform | null
  platformVersion: string | null
  createdAt: number
}

type LogListResponse = {
  total: number
  data: LogItem[]
}

@Injectable()
export class LogsService {
  constructor(private readonly prisma: PrismaService) {}

  async getStatistics(): Promise<{
    count: number
    debug_count: number
    info_count: number
    warning_count: number
    error_count: number
  }> {
    const [count, debugCount, infoCount, warningCount, errorCount] = await Promise.all([
      this.prisma.log.count(),
      this.prisma.log.count({ where: { level: LogLevel.DEBUG } }),
      this.prisma.log.count({ where: { level: LogLevel.INFO } }),
      this.prisma.log.count({ where: { level: LogLevel.WARN } }),
      this.prisma.log.count({ where: { level: LogLevel.ERROR } }),
    ])

    return {
      count,
      debug_count: debugCount,
      info_count: infoCount,
      warning_count: warningCount,
      error_count: errorCount,
    }
  }

  async findAll(projectKey: string, query: QueryLogsDto): Promise<LogListResponse> {
    const normalizedProjectKey = normalizeProjectKey(projectKey)
    await this.ensureProjectExistsByKey(normalizedProjectKey)

    if (
      query.start_time !== undefined &&
      query.end_time !== undefined &&
      query.start_time > query.end_time
    ) {
      throw new BadRequestException("start_time must be less than or equal to end_time")
    }

    const where: Prisma.LogWhereInput = {
      projectKey: normalizedProjectKey,
      level: this.toLogLevel(query.level),
      createdAt: {
        gte: query.start_time,
        lte: query.end_time,
      },
    }

    const [total, data] = await this.prisma.$transaction([
      this.prisma.log.count({ where }),
      this.prisma.log.findMany({
        where,
        take: query.limit,
        skip: query.offset,
        orderBy: { createdAt: "desc" },
      }),
    ])

    return {
      total,
      data: data.map((item) => this.toLogItem(item)),
    }
  }

  async createByProjectKey(
    projectKey: string,
    dto: UploadLogDto,
    origin: ClientOrigin,
  ): Promise<LogItem> {
    const normalizedProjectKey = normalizeProjectKey(projectKey)
    const project = await this.prisma.project.findUnique({
      where: { projectKey: normalizedProjectKey },
      select: { projectKey: true },
    })
    if (!project) {
      throw new NotFoundException("Project not found")
    }

    const level = this.toRequiredLogLevel(dto.level)
    const dedupHash = buildDedupHash([
      project.projectKey,
      level,
      dto.content,
      origin.ip,
      stableStringify(dto.device_info),
      stableStringify(dto.custom_data),
    ])

    // A client stuck in a crash-retry loop uploads the same line every few
    // seconds. Returning the row it already produced keeps the endpoint
    // idempotent from the caller's side without storing the flood.
    const duplicate = await this.findRecentDuplicate(dedupHash)
    if (duplicate) {
      return this.toLogItem(duplicate)
    }

    const created = await this.prisma.log.create({
      data: {
        projectKey: project.projectKey,
        level,
        content: dto.content,
        deviceInfo: dto.device_info as Prisma.InputJsonValue | undefined,
        customData: dto.custom_data as Prisma.InputJsonValue | undefined,
        ip: origin.ip,
        userAgent: origin.userAgent,
        countryCode: origin.countryCode,
        countryName: origin.countryName,
        regionName: origin.regionName,
        city: origin.city,
        platform: origin.platform,
        platformVersion: origin.platformVersion,
        dedupHash,
      },
    })

    return this.toLogItem(created)
  }

  /**
   * 后台手动补录一条日志。
   *
   * 不走 dedup：管理员重复提交是有意的补录，不是崩溃重试。来源字段（ip/UA/地理）
   * 一律留空——填成管理员自己的浏览器只会让后续排障读到假的客户端来源。
   */
  async createByAdmin(projectKey: string, dto: CreateLogDto): Promise<LogItem> {
    const normalizedProjectKey = normalizeProjectKey(projectKey)
    await this.ensureProjectExistsByKey(normalizedProjectKey)

    const created = await this.prisma.log.create({
      data: {
        projectKey: normalizedProjectKey,
        level: this.toRequiredLogLevel(dto.level),
        content: dto.content,
        deviceInfo: dto.device_info as Prisma.InputJsonValue | undefined,
        customData: dto.custom_data as Prisma.InputJsonValue | undefined,
        platform: toPlatform(dto.platform),
        platformVersion: dto.platform_version,
      },
    })

    return this.toLogItem(created)
  }

  /** The most recent identical upload inside the dedup window, if any. */
  private async findRecentDuplicate(dedupHash: string): Promise<LogRecord | null> {
    const window = resolveDedupWindowSeconds()
    if (window <= 0) {
      return null
    }

    return this.prisma.log.findFirst({
      where: { dedupHash, createdAt: { gte: nowSeconds() - window } },
      orderBy: { createdAt: "desc" },
    })
  }

  getStatus(): { module: string; implemented: boolean } {
    return {
      module: "logs",
      implemented: true,
    }
  }

  private async ensureProjectExistsByKey(projectKey: string): Promise<void> {
    const project = await this.prisma.project.findUnique({
      where: { projectKey },
      select: { projectKey: true },
    })
    if (!project) {
      throw new NotFoundException("Project not found")
    }
  }

  private toLogLevel(level: number | undefined): LogLevel | undefined {
    if (level === undefined) {
      return undefined
    }

    const mapping: Record<number, LogLevel> = {
      0: LogLevel.DEBUG,
      1: LogLevel.INFO,
      2: LogLevel.WARN,
      3: LogLevel.ERROR,
    }

    return mapping[level]
  }

  private toRequiredLogLevel(level: number): LogLevel {
    const mappedLevel = this.toLogLevel(level)
    if (!mappedLevel) {
      throw new BadRequestException("invalid log level")
    }

    return mappedLevel
  }

  private fromLogLevel(level: LogLevel): number {
    const mapping: Record<LogLevel, number> = {
      [LogLevel.DEBUG]: 0,
      [LogLevel.INFO]: 1,
      [LogLevel.WARN]: 2,
      [LogLevel.ERROR]: 3,
    }

    return mapping[level]
  }

  private toLogItem(log: LogRecord): LogItem {
    return {
      id: log.id,
      level: this.fromLogLevel(log.level),
      content: log.content,
      device_info: log.deviceInfo,
      custom_data: log.customData,
      ip: log.ip,
      user_agent: log.userAgent,
      country_code: log.countryCode,
      country_name: log.countryName,
      region_name: log.regionName,
      city: log.city,
      platform: fromPlatform(log.platform),
      platform_version: log.platformVersion,
      created_at: log.createdAt,
    }
  }
}
