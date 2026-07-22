import { Injectable } from "@nestjs/common"
import { Platform } from "@prisma/client"

import { extractClientContext, type ClientRequestLike } from "../common/client-context"
import {
  PLATFORM_HEADER,
  PLATFORM_VERSION_HEADER,
  resolvePlatform,
} from "../stats/platform-detection"
import { GeoLocationService } from "./geo-location.service"

/**
 * The server-observed origin of one client submission, in the exact shape the
 * `Log` / `Feedback` / `ActionRecord` columns expect.
 *
 * `countryCode` is `UNKNOWN` / `LOCAL` on the stats path, but null here: the
 * stats table needs a non-null sentinel for its unique index, whereas a detail
 * row showing "地区: UNKNOWN" is worse than showing nothing.
 */
export type ClientOrigin = {
  ip: string | null
  userAgent: string | null
  countryCode: string | null
  countryName: string | null
  regionName: string | null
  city: string | null
  platform: Platform | null
  /** 系统版本明细，如 "11" / "ubuntu 24.04"；无从得知时为 null。 */
  platformVersion: string | null
}

/** Request shape plus the fields an SDK may use to declare its platform. */
type SubmissionRequest = ClientRequestLike & {
  body?: { platform?: unknown; platform_version?: unknown }
  query?: { platform?: unknown; platform_version?: unknown }
}

/**
 * Builds the origin record every public submission endpoint stores.
 *
 * Centralised so logs, feedbacks and action records capture the same fields
 * from the same sources — a per-controller copy of this would drift the moment
 * one of them gained a header the others did not.
 */
@Injectable()
export class ClientOriginService {
  constructor(private readonly geoLocationService: GeoLocationService) {}

  async describe(request: SubmissionRequest): Promise<ClientOrigin> {
    const { ip, userAgent } = extractClientContext(request)
    const geo = await this.geoLocationService.resolve(ip)
    const { platform, platformVersion } = this.resolveClientPlatform(request, userAgent)

    return {
      ip,
      userAgent,
      // Sentinels are for the stats table's unique index, not for display.
      countryCode: geo.countryCode === "UNKNOWN" ? null : geo.countryCode,
      countryName: geo.countryName,
      regionName: geo.regionName,
      city: geo.city,
      platform,
      platformVersion,
    }
  }

  /**
   * Declared platform wins over the User-Agent guess.
   *
   * 什么线索都没有时（OTHERS 且无版本明细）落到 null：明细页上「平台：其他」
   * 与「平台：—」是两回事，前者会让人以为真的识别出了一个非主流平台。声明了
   * OTHERS 或带着 "harmonyos 4" 这类明细时照常记录。
   */
  private resolveClientPlatform(
    request: SubmissionRequest,
    userAgent: string | null,
  ): { platform: Platform | null; platformVersion: string | null } {
    const declared =
      request.headers[PLATFORM_HEADER] ?? request.query?.platform ?? request.body?.platform
    const declaredVersion =
      request.headers[PLATFORM_VERSION_HEADER] ??
      request.query?.platform_version ??
      request.body?.platform_version

    const { platform, version } = resolvePlatform(declared, declaredVersion, userAgent)

    if (platform === Platform.OTHERS && !version) {
      return { platform: null, platformVersion: null }
    }

    return { platform, platformVersion: version || null }
  }
}
