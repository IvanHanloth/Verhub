import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common"

import { Prisma, LogLevel } from "@prisma/client"

import { PrismaService } from "../database/prisma.service"
import { normalizeProjectKey } from "../common/utils"
import { QueryLogsDto } from "./dto/query-logs.dto"
import { UploadLogDto } from "./dto/upload-log.dto"

type LogItem = {
  id: string
  level: number
  content: string
  device_info: Prisma.JsonValue | null
  custom_data: Prisma.JsonValue | null
  created_at: number
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

  async createByProjectKey(projectKey: string, dto: UploadLogDto): Promise<LogItem> {
    const normalizedProjectKey = normalizeProjectKey(projectKey)
    const project = await this.prisma.project.findUnique({
      where: { projectKey: normalizedProjectKey },
      select: { projectKey: true },
    })
    if (!project) {
      throw new NotFoundException("Project not found")
    }

    const created = await this.prisma.log.create({
      data: {
        projectKey: project.projectKey,
        level: this.toRequiredLogLevel(dto.level),
        content: dto.content,
        deviceInfo: dto.device_info as Prisma.InputJsonValue | undefined,
        customData: dto.custom_data as Prisma.InputJsonValue | undefined,
      },
    })

    return this.toLogItem(created)
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

  private toLogItem(log: {
    id: string
    level: LogLevel
    content: string
    deviceInfo: Prisma.JsonValue | null
    customData: Prisma.JsonValue | null
    createdAt: number
  }): LogItem {
    return {
      id: log.id,
      level: this.fromLogLevel(log.level),
      content: log.content,
      device_info: log.deviceInfo,
      custom_data: log.customData,
      created_at: log.createdAt,
    }
  }
}
