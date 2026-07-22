import { Injectable, Logger } from "@nestjs/common"
import { Cron, CronExpression } from "@nestjs/schedule"

import { isPrivateIp } from "../common/client-context"
import { nowSeconds } from "../common/utils"
import { PrismaService } from "../database/prisma.service"
import { GEO_PROVIDERS, selectProviders, type GeoProvider } from "./geo-providers"

/** Country-code sentinels. Mirrored by `ApiRequestStat.region`. */
export const UNKNOWN_COUNTRY = "UNKNOWN"
export const LOCAL_COUNTRY = "LOCAL"

export type ResolvedGeo = {
  /** ISO-3166 alpha-2, or `UNKNOWN` / `LOCAL`. Never empty. */
  countryCode: string
  countryName: string | null
  regionName: string | null
  city: string | null
  /** 省级行政区划码（GB/T 2260），仅国内 provider 命中时非空。 */
  regionCode: string | null
  /** 市级行政区划码（GB/T 2260），仅国内 provider 命中时非空。 */
  cityCode: string | null
}

const UNKNOWN_GEO: ResolvedGeo = {
  countryCode: UNKNOWN_COUNTRY,
  countryName: null,
  regionName: null,
  city: null,
  regionCode: null,
  cityCode: null,
}

const LOCAL_GEO: ResolvedGeo = {
  countryCode: LOCAL_COUNTRY,
  countryName: null,
  regionName: null,
  city: null,
  regionCode: null,
  cityCode: null,
}

const DAY_SECONDS = 86400

/** How long a successful lookup is reused. Addresses do move, just not often. */
const DEFAULT_TTL_DAYS = 30

/**
 * How long a failure is remembered. Short, because a failure is usually the
 * provider being rate limited rather than the address being unplaceable — but
 * not zero, or every request for that address would retry the whole chain.
 */
const FAILURE_TTL_SECONDS = 900

/** Budget for the whole provider chain, not per provider. See `lookupFromProviders`. */
const DEFAULT_TIMEOUT_MS = 2500

/**
 * Ceiling on the in-process cache. Bounded because it is keyed by client IP,
 * which an untrusted caller controls: without a cap, spoofed
 * `X-Forwarded-For` values would grow the map until the process runs out of
 * memory. Eviction is oldest-inserted-first, which for this access pattern
 * (one lookup then many repeats, all within a burst) tracks LRU closely enough.
 */
const MEMORY_CACHE_LIMIT = 5000

type CacheEntry = ResolvedGeo & { expiresAt: number }

/**
 * Resolves a client IP to a country/region, with a persistent cache in front of
 * a chain of public providers.
 *
 * Layering, cheapest first: private-address short circuit → in-process map →
 * `IpGeoCache` table → provider chain. Every layer above the providers exists
 * because the providers are rate limited to tens of calls a minute and sit in
 * the hot path of endpoints that are otherwise pure database work.
 */
@Injectable()
export class GeoLocationService {
  private readonly logger = new Logger(GeoLocationService.name)
  private readonly memoryCache = new Map<string, CacheEntry>()
  /** In-flight lookups by IP, so a burst for one address makes one call. */
  private readonly inFlight = new Map<string, Promise<ResolvedGeo>>()

  private readonly enabled: boolean
  private readonly providers: GeoProvider[]
  private readonly ttlSeconds: number
  private readonly timeoutMs: number

  constructor(private readonly prisma: PrismaService) {
    // Opt-out rather than opt-in: the region breakdown is the point of the
    // feature, and an operator who cannot make outbound calls gets UNKNOWN
    // buckets either way — the flag is for those who must not try at all.
    this.enabled = process.env.VERHUB_GEO_ENABLED !== "false"
    this.providers = selectProviders(process.env.VERHUB_GEO_PROVIDERS)
    this.ttlSeconds = this.readPositiveInt("VERHUB_GEO_TTL_DAYS", DEFAULT_TTL_DAYS) * DAY_SECONDS
    this.timeoutMs = this.readPositiveInt("VERHUB_GEO_TIMEOUT_MS", DEFAULT_TIMEOUT_MS)
  }

  /**
   * Resolve one address. Never throws and never rejects: callers are logging
   * and telemetry paths where an unplaceable IP is a normal outcome, not an
   * error worth failing a client request over.
   */
  async resolve(ip: string | null | undefined): Promise<ResolvedGeo> {
    if (!ip) {
      return UNKNOWN_GEO
    }

    if (isPrivateIp(ip)) {
      return LOCAL_GEO
    }

    if (!this.enabled) {
      return UNKNOWN_GEO
    }

    const now = nowSeconds()

    const cached = this.memoryCache.get(ip)
    if (cached && cached.expiresAt > now) {
      return this.stripExpiry(cached)
    }

    const pending = this.inFlight.get(ip)
    if (pending) {
      return pending
    }

    const lookup = this.resolveUncached(ip, now).finally(() => {
      this.inFlight.delete(ip)
    })
    this.inFlight.set(ip, lookup)

    return lookup
  }

  private async resolveUncached(ip: string, now: number): Promise<ResolvedGeo> {
    try {
      const stored = await this.prisma.ipGeoCache.findUnique({ where: { ip } })
      if (stored && stored.expiresAt > now) {
        const geo: ResolvedGeo = {
          countryCode: stored.countryCode,
          countryName: stored.countryName,
          regionName: stored.regionName,
          city: stored.city,
          regionCode: stored.regionCode,
          cityCode: stored.cityCode,
        }
        this.rememberInMemory(ip, geo, stored.expiresAt)
        return geo
      }
    } catch (error) {
      // A cache read failure must not stop the lookup; fall through to the
      // providers and try to persist the answer afterwards.
      this.logger.warn(`IP geo cache read failed for ${ip}: ${this.describe(error)}`)
    }

    const lookup = await this.lookupFromProviders(ip)
    const geo = lookup?.geo ?? UNKNOWN_GEO
    const source = lookup?.source ?? "NONE"
    const expiresAt = now + (lookup ? this.ttlSeconds : FAILURE_TTL_SECONDS)

    this.rememberInMemory(ip, geo, expiresAt)
    await this.persist(ip, geo, source, expiresAt, now)

    return geo
  }

  /**
   * Walk the provider chain, returning the first placement.
   *
   * `timeoutMs` is the budget for the *whole* chain, not per provider. The
   * submission endpoints await this call so the row they write carries the
   * region, which means a per-provider timeout would let four slow providers
   * stack into a ten-second wait on a client's log upload. Running out of
   * budget just yields UNKNOWN — a missing region is a far smaller problem
   * than a hanging request.
   */
  private async lookupFromProviders(
    ip: string,
  ): Promise<{ geo: ResolvedGeo; source: string } | null> {
    const deadline = Date.now() + this.timeoutMs

    for (const provider of this.providers) {
      const remaining = deadline - Date.now()
      if (remaining <= 0) {
        this.logger.debug(`Geo lookup for ${ip} ran out of budget before ${provider.name}`)
        break
      }

      try {
        const response = await fetch(provider.buildUrl(ip), {
          signal: AbortSignal.timeout(remaining),
          headers: { accept: "application/json" },
        })

        if (!response.ok) {
          continue
        }

        const parsed = provider.parse(await this.readBody(response, provider.charset))
        if (parsed) {
          return { geo: parsed, source: provider.name }
        }
      } catch (error) {
        this.logger.debug(`Geo provider ${provider.name} failed for ${ip}: ${this.describe(error)}`)
      }
    }

    return null
  }

  /**
   * Parse a response body as JSON, honouring a provider's declared charset.
   * `response.json()` always assumes UTF-8; pconline serves GBK, which would
   * turn every Chinese province name into mojibake. For those we read the raw
   * bytes and decode explicitly.
   */
  private async readBody(response: Response, charset?: string): Promise<unknown> {
    if (!charset) {
      return response.json()
    }
    const buffer = await response.arrayBuffer()
    return JSON.parse(new TextDecoder(charset).decode(buffer))
  }

  private async persist(
    ip: string,
    geo: ResolvedGeo,
    source: string,
    expiresAt: number,
    resolvedAt: number,
  ): Promise<void> {
    const row = {
      countryCode: geo.countryCode,
      countryName: geo.countryName,
      regionName: geo.regionName,
      city: geo.city,
      regionCode: geo.regionCode,
      cityCode: geo.cityCode,
      source,
      resolvedAt,
      expiresAt,
    }

    try {
      await this.prisma.ipGeoCache.upsert({
        where: { ip },
        create: { ip, ...row },
        update: row,
      })
    } catch (error) {
      this.logger.warn(`IP geo cache write failed for ${ip}: ${this.describe(error)}`)
    }
  }

  private rememberInMemory(ip: string, geo: ResolvedGeo, expiresAt: number): void {
    if (this.memoryCache.size >= MEMORY_CACHE_LIMIT) {
      const oldest = this.memoryCache.keys().next()
      if (!oldest.done) {
        this.memoryCache.delete(oldest.value)
      }
    }
    this.memoryCache.set(ip, { ...geo, expiresAt })
  }

  private stripExpiry(entry: CacheEntry): ResolvedGeo {
    return {
      countryCode: entry.countryCode,
      countryName: entry.countryName,
      regionName: entry.regionName,
      city: entry.city,
      regionCode: entry.regionCode,
      cityCode: entry.cityCode,
    }
  }

  /**
   * Drop entries that expired long ago.
   *
   * Live entries are overwritten in place on re-resolution, so the table is
   * bounded by the set of *recurring* addresses. This sweep removes the
   * one-off callers that would otherwise accumulate forever.
   */
  @Cron(CronExpression.EVERY_DAY_AT_4AM)
  async purgeStaleCache(): Promise<number> {
    const cutoff = nowSeconds() - 30 * DAY_SECONDS
    const { count } = await this.prisma.ipGeoCache.deleteMany({
      where: { expiresAt: { lt: cutoff } },
    })

    if (count > 0) {
      this.logger.log(`Purged ${count} stale IP geo cache entries`)
    }

    return count
  }

  /** Diagnostics for the admin settings page. */
  getConfiguration(): { enabled: boolean; providers: string[]; ttl_days: number } {
    return {
      enabled: this.enabled,
      providers: this.providers.map((provider) => provider.name),
      ttl_days: Math.round(this.ttlSeconds / DAY_SECONDS),
    }
  }

  private readPositiveInt(name: string, fallback: number): number {
    const parsed = Number(process.env[name])
    return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : fallback
  }

  private describe(error: unknown): string {
    return error instanceof Error ? error.message : String(error)
  }
}

export { GEO_PROVIDERS }
