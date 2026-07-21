/**
 * GitHub release webhook ingestion.
 *
 * The delivery carries no admin JWT and no API key: the per-project secret is
 * the only credential, so a project without a secret rejects every delivery.
 *
 * The pushed payload is used as-is rather than re-fetched from the REST API.
 * A `release` event embeds the same release resource the API returns, so a
 * round trip would only add latency, burn the 60 req/h anonymous rate limit and
 * require a token for private repositories. The one thing the payload can miss
 * is assets uploaded after publishing — GitHub fires no release event for an
 * asset upload — and those arrive with the follow-up `edited` delivery.
 */

import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common"

import { PrismaService } from "../database/prisma.service"
import { normalizeProjectKey, nowSeconds } from "../common/utils"
import { compareComparableVersions, parseComparableVersion } from "../versions/version-comparator"
import { normalizeVersionTag, toGithubReleaseDownloadLinks } from "../versions/version-mapping"
import { VersionsService } from "../versions/versions.service"
import { verifyGithubSignature } from "./github-signature"
import type { GithubReleaseEventPayload, GithubWebhookRelease, GithubWebhookResult } from "./types"

/**
 * Release actions that mean "this release now exists in this shape".
 *
 * `deleted` and `unpublished` are deliberately absent: removing a published
 * version from Verhub would break clients that already resolved a download URL
 * from it, so teardown stays a manual admin decision.
 */
const SYNCED_ACTIONS = new Set(["published", "released", "prereleased", "created", "edited"])

// Mirrors the CreateVersionDto constraints. The webhook builds its payload in
// code and so never passes through ValidationPipe; exceeding these would store
// a record the admin UI can no longer submit back.
const MAX_TITLE_LENGTH = 128
const MAX_CONTENT_LENGTH = 4096
const MAX_DOWNLOAD_LINKS = 32

@Injectable()
export class GithubWebhookService {
  private readonly logger = new Logger(GithubWebhookService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly versionsService: VersionsService,
  ) {}

  async handleDelivery(input: {
    projectKey: string
    event: string | undefined
    signature: string | undefined
    deliveryId: string | undefined
    rawBody: Buffer | undefined
    body: unknown
  }): Promise<GithubWebhookResult> {
    const normalizedKey = normalizeProjectKey(input.projectKey)
    const project = await this.prisma.project.findUnique({
      where: { projectKey: normalizedKey },
      select: { projectKey: true, githubWebhookSecret: true },
    })

    if (!project) {
      throw new NotFoundException("Project not found")
    }
    if (!project.githubWebhookSecret) {
      throw new ForbiddenException("GitHub webhook secret is not configured for this project")
    }

    // Signature must be computed over the exact bytes GitHub signed. Re-encoding
    // the parsed body would change key order and whitespace and never match.
    if (!input.rawBody) {
      throw new UnauthorizedException("Webhook signature could not be verified")
    }
    if (!verifyGithubSignature(project.githubWebhookSecret, input.rawBody, input.signature)) {
      this.logger.warn(
        `[webhook][github] signature rejected project=${normalizedKey} delivery=${input.deliveryId ?? "unknown"}`,
      )
      throw new UnauthorizedException("Webhook signature could not be verified")
    }

    const event = input.event ?? ""
    if (event === "ping") {
      return { status: "pong", event }
    }
    if (event !== "release") {
      return { status: "ignored", reason: "unsupported_event", event }
    }

    const payload = (input.body ?? {}) as GithubReleaseEventPayload
    const action = payload.action ?? ""
    if (!SYNCED_ACTIONS.has(action)) {
      return { status: "ignored", reason: "unsupported_action", event, action }
    }

    const release = payload.release
    if (!release) {
      return { status: "ignored", reason: "missing_release", event, action }
    }
    if (release.draft) {
      return { status: "ignored", reason: "draft_release", event, action }
    }

    return this.syncRelease(normalizedKey, payload, release, event, action)
  }

  private async syncRelease(
    projectKey: string,
    payload: GithubReleaseEventPayload,
    release: GithubWebhookRelease,
    event: string,
    action: string,
  ): Promise<GithubWebhookResult> {
    const tag = release.tag_name?.trim()
    if (!tag) {
      return { status: "ignored", reason: "missing_tag", event, action }
    }

    const version = normalizeVersionTag(tag)
    if (!version) {
      return { status: "ignored", reason: "missing_tag", event, action }
    }

    // A tag like `nightly` or `2024-06-01` has no ordering, and update checks
    // are built entirely on comparable versions. Reporting it back beats a 500
    // that only shows up as a red delivery in GitHub.
    try {
      parseComparableVersion(version)
    } catch {
      return { status: "ignored", reason: "unparsable_version", event, action, version }
    }

    const isPreview = Boolean(release.prerelease)
    const downloadLinks = toGithubReleaseDownloadLinks(release.assets).slice(0, MAX_DOWNLOAD_LINKS)
    const fallbackUrl = release.zipball_url?.trim() || release.html_url?.trim() || undefined
    const publishedAt = toUnixSeconds(release.published_at ?? release.created_at)
    const isLatest = await this.resolveIsLatest(projectKey, version, isPreview)

    const { item, created } = await this.versionsService.upsertByVersion(projectKey, version, {
      version,
      comparable_version: version,
      title: truncate(release.name?.trim(), MAX_TITLE_LENGTH) ?? null,
      content: truncate(release.body?.trim(), MAX_CONTENT_LENGTH) ?? null,
      download_url: downloadLinks[0]?.url ?? fallbackUrl ?? null,
      download_links: downloadLinks.length > 0 ? downloadLinks : undefined,
      is_latest: isLatest,
      is_preview: isPreview,
      published_at: publishedAt,
      custom_data: {
        source: "github-webhook",
        repository: payload.repository?.full_name ?? null,
        release_tag: tag,
        event_action: action,
        synced_at: nowSeconds(),
      },
    })

    this.logger.log(
      `[webhook][github] ${created ? "created" : "updated"} project=${projectKey} version=${item.version} action=${action}`,
    )

    return { status: "synced", event, action, version: item.version, created }
  }

  /**
   * Whether this release should own the project's `is_latest` flag.
   *
   * An `edited` delivery can arrive for an old release long after a newer one
   * shipped, so "published means latest" would silently demote the real latest.
   * The release only claims the flag when it sorts at or above the current
   * holder — equality included, so re-syncing the current latest keeps it.
   */
  private async resolveIsLatest(
    projectKey: string,
    comparableVersion: string,
    isPreview: boolean,
  ): Promise<boolean> {
    if (isPreview) {
      return false
    }

    const currentLatest = await this.prisma.version.findFirst({
      where: { projectKey, isLatest: true },
      select: { version: true, comparableVersion: true },
    })
    if (!currentLatest) {
      return true
    }
    if (currentLatest.version === comparableVersion) {
      return true
    }

    const currentComparable = currentLatest.comparableVersion ?? currentLatest.version
    try {
      return compareComparableVersions(comparableVersion, currentComparable) >= 0
    } catch {
      // The stored latest predates comparable-version validation. Leave it
      // alone rather than demoting a record we cannot reason about.
      return false
    }
  }
}

// ── Pure helpers ──

/** Convert an ISO timestamp to Unix seconds, falling back to now. */
function toUnixSeconds(isoTimestamp: string | undefined): number {
  if (!isoTimestamp) {
    return nowSeconds()
  }
  const parsed = Math.floor(new Date(isoTimestamp).getTime() / 1000)
  return Number.isFinite(parsed) ? parsed : nowSeconds()
}

/** Clamp a value to the length the version DTO accepts, or drop it if empty. */
function truncate(value: string | undefined, maxLength: number): string | undefined {
  if (!value) {
    return undefined
  }
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 1)}…`
}
