import { Injectable } from "@nestjs/common"
import { ThrottlerGuard } from "@nestjs/throttler"

import { extractClientIp, type ClientRequestLike } from "./client-context"

/**
 * 按「真实客户端 IP」限流的 ThrottlerGuard。
 *
 * 默认 tracker 取的是连接对端，在 CDN/nginx 后面会退化成边缘节点或网关地址——
 * 那样全体访客共用一个计数桶，限流要么误伤所有人、要么形同虚设。这里复用与统计、
 * 日志采集同一套 `extractClientIp`（按可信反代层数解析转发头），保证限流的口径
 * 和其余采集点一致。解析不出地址时回退到连接地址，宁可多算一桶也不放空。
 */
@Injectable()
export class ClientIpThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, unknown>): Promise<string> {
    return extractClientIp(req as unknown as ClientRequestLike) ?? String(req.ip ?? "unknown")
  }
}
