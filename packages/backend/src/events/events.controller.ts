import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common"
import { PublicEndpoint } from "@prisma/client"
import { Throttle } from "@nestjs/throttler"

import { ClientIpThrottlerGuard } from "../common/client-ip-throttler.guard"
import { ClientOriginService } from "../geo/client-origin.service"
import { TrackEndpoint } from "../stats/track-endpoint.decorator"
import { hasDoNotTrackHeader } from "./event-config"
import { EventsIngestService } from "./events-ingest.service"
import { EventSubjectDto, IngestEventsDto } from "./dto/ingest-events.dto"

/**
 * 数据主体权利端点的额度：每 IP 每小时 10 次。
 *
 * 比采集端点（300/分钟）严得多。distinct_id 是 UUID，枚举不现实，但一个能无限次
 * 调用的导出接口本身就是个数据外泄面，而正常用户一小时行使不了十次权利。
 */
const SUBJECT_RIGHTS_QUOTA = { default: { limit: 10, ttl: 3_600_000 } }

type PublicEventRequest = {
  headers: Record<string, string | string[] | undefined>
  method?: string
  body?: Record<string, unknown>
  query?: Record<string, unknown>
  socket?: { remoteAddress?: string }
  ip?: string
}

@Controller()
export class EventsController {
  constructor(
    private readonly ingestService: EventsIngestService,
    private readonly clientOriginService: ClientOriginService,
  ) {}

  /**
   * 批量上报。
   *
   * 单条上报也走这个端点：SDK 侧统一进队列再批量发，服务端没有必要维护两条写入
   * 路径。事件名不需要预先在后台登记——服务端第一次见到就自动建定义。
   *
   * 返回 202 而不是 201：接受入队与实际落库不是同一件事（退出信号、项目开关、
   * 幂等键撞车都会让某些条目不落库），逐条回执在响应体里。
   */
  @Post("public/:projectKey/events")
  @HttpCode(HttpStatus.ACCEPTED)
  @UseGuards(ClientIpThrottlerGuard)
  @TrackEndpoint(PublicEndpoint.EVENT_INGEST)
  async ingest(
    @Param("projectKey") projectKey: string,
    @Body() dto: IngestEventsDto,
    @Req() request: PublicEventRequest,
  ) {
    const doNotTrack = hasDoNotTrackHeader(request.headers)

    // 命中退出信号时连来源都不解析：解析会去查 IP 归属地，那本身就是一次
    // 对外的数据传输，而用户已经表示不希望被采集。
    const origin = doNotTrack
      ? {
          ip: null,
          userAgent: null,
          countryCode: null,
          countryName: null,
          regionName: null,
          city: null,
          platform: null,
          platformVersion: null,
        }
      : await this.clientOriginService.describe(request)

    return this.ingestService.ingest(projectKey, dto, origin, doNotTrack)
  }

  /**
   * 数据主体的访问权与可携带权（GDPR Art.15 / Art.20）。
   */
  @Get("public/:projectKey/events/me")
  @UseGuards(ClientIpThrottlerGuard)
  @Throttle(SUBJECT_RIGHTS_QUOTA)
  async exportMyData(@Param("projectKey") projectKey: string, @Query() query: EventSubjectDto) {
    return this.ingestService.exportSubject(projectKey, query.distinct_id)
  }

  /**
   * 数据主体的删除权（GDPR Art.17）。
   *
   * 删明细与日活去重行；小时汇总不删——它不含任何标识符，无法回溯到具体设备，
   * 属于匿名数据。这条界线在隐私政策里有明示。
   */
  @Delete("public/:projectKey/events/me")
  @UseGuards(ClientIpThrottlerGuard)
  @Throttle(SUBJECT_RIGHTS_QUOTA)
  async deleteMyData(@Param("projectKey") projectKey: string, @Query() query: EventSubjectDto) {
    const { deleted } = await this.ingestService.deleteSubject(projectKey, query.distinct_id)
    return { success: true, deleted }
  }

  @Get("events/_status")
  getModuleStatus(): { module: string; implemented: boolean } {
    return this.ingestService.getStatus()
  }
}
