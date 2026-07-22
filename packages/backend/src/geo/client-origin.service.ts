import { Injectable } from "@nestjs/common"
import { ClientPlatform, StatPlatform } from "@prisma/client"

import { extractClientContext, type ClientRequestLike } from "../common/client-context"
import { PLATFORM_HEADER, resolvePlatform } from "../stats/platform-detection"
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
  platform: ClientPlatform | null
}

/** Request shape plus the fields an SDK may use to declare its platform. */
type SubmissionRequest = ClientRequestLike & {
  body?: { platform?: unknown }
  query?: { platform?: unknown }
}

const PLATFORM_BY_STAT: Partial<Record<StatPlatform, ClientPlatform>> = {
  [StatPlatform.IOS]: ClientPlatform.IOS,
  [StatPlatform.ANDROID]: ClientPlatform.ANDROID,
  [StatPlatform.WINDOWS]: ClientPlatform.WINDOWS,
  [StatPlatform.MAC]: ClientPlatform.MAC,
  [StatPlatform.WEB]: ClientPlatform.WEB,
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

    return {
      ip,
      userAgent,
      // Sentinels are for the stats table's unique index, not for display.
      countryCode: geo.countryCode === "UNKNOWN" ? null : geo.countryCode,
      countryName: geo.countryName,
      regionName: geo.regionName,
      city: geo.city,
      platform: this.resolveClientPlatform(request, userAgent),
    }
  }

  /**
   * Declared platform wins over the User-Agent guess; an unrecognized result
   * stays null rather than becoming a bogus category.
   */
  private resolveClientPlatform(
    request: SubmissionRequest,
    userAgent: string | null,
  ): ClientPlatform | null {
    const declared =
      request.headers[PLATFORM_HEADER] ?? request.query?.platform ?? request.body?.platform
    return PLATFORM_BY_STAT[resolvePlatform(declared, userAgent)] ?? null
  }
}
