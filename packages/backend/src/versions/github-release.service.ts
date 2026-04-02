/**
 * GitHub Release integration service.
 *
 * Handles previewing a single release and batch-importing releases
 * from a project's GitHub repository. Separated from VersionsService
 * to isolate external API dependency and keep CRUD logic focused.
 */

import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common"

import { PrismaService } from "../database/prisma.service"
import { PreviewGithubReleaseDto } from "./dto/preview-github-release.dto"
import { normalizeVersionTag, toGithubReleaseDownloadLinks } from "./version-mapping"
import { parseComparableVersion } from "./version-comparator"
import type { GithubReleasePreview, VersionImportResult } from "./types"
import { normalizeProjectKey, nowSeconds } from "./types"

/** Shape of a single release payload from GitHub REST API. */
type GithubReleasePayload = {
  tag_name?: string
  name?: string
  body?: string
  prerelease?: boolean
  draft?: boolean
  published_at?: string
  html_url?: string
  zipball_url?: string
  assets?: Array<{ name?: string; browser_download_url?: string }>
}

@Injectable()
export class GithubReleaseService {
  constructor(private readonly prisma: PrismaService) {}

  /** Preview a single GitHub release by project and optional tag. */
  async previewFromGithubRelease(
    projectKey: string,
    query: PreviewGithubReleaseDto,
  ): Promise<GithubReleasePreview> {
    const normalizedKey = normalizeProjectKey(projectKey)
    const project = await this.prisma.project.findUnique({
      where: { projectKey: normalizedKey },
      select: { projectKey: true, repoUrl: true },
    })

    if (!project) {
      throw new NotFoundException("Project not found")
    }

    if (!project.repoUrl) {
      throw new BadRequestException("Project repo_url is not configured")
    }

    const { owner, repo } = parseGithubRepository(project.repoUrl)
    const tag = query.tag?.trim()
    const endpoint = tag
      ? `https://api.github.com/repos/${owner}/${repo}/releases/tags/${encodeURIComponent(tag)}`
      : `https://api.github.com/repos/${owner}/${repo}/releases/latest`

    const response = await fetch(endpoint, {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "Verhub/1.2",
      },
    })

    if (!response.ok) {
      if (response.status === 404) {
        throw new NotFoundException("GitHub release not found")
      }
      throw new BadGatewayException(`GitHub API request failed with status ${response.status}`)
    }

    const payload = (await response.json()) as GithubReleasePayload

    const releaseTag = payload.tag_name?.trim()
    if (!releaseTag) {
      throw new BadGatewayException("GitHub release payload is invalid")
    }

    const publishedAt = payload.published_at
      ? Math.floor(new Date(payload.published_at).getTime() / 1000)
      : nowSeconds()
    const downloadLinks = toGithubReleaseDownloadLinks(payload.assets)
    const downloadUrl =
      downloadLinks[0]?.url ?? payload.zipball_url ?? payload.html_url ?? undefined
    const isPreview = Boolean(payload.prerelease)

    return {
      version: normalizeVersionTag(releaseTag),
      comparable_version: normalizeVersionTag(releaseTag),
      title: payload.name?.trim() || undefined,
      content: payload.body?.trim() || undefined,
      download_url: downloadUrl,
      download_links: downloadLinks,
      forced: false,
      is_latest: !isPreview,
      is_preview: isPreview,
      is_milestone: false,
      is_deprecated: false,
      published_at: Number.isFinite(publishedAt) ? publishedAt : nowSeconds(),
      custom_data: {
        source: "github-release",
        owner,
        repo,
        release_tag: releaseTag,
      },
    }
  }

  /** Batch-import releases from a project's GitHub repository. */
  async importFromGithubReleases(projectKey: string): Promise<VersionImportResult> {
    const normalizedKey = normalizeProjectKey(projectKey)
    const project = await this.prisma.project.findUnique({
      where: { projectKey: normalizedKey },
      select: { projectKey: true, repoUrl: true },
    })

    if (!project) {
      throw new NotFoundException("Project not found")
    }

    if (!project.repoUrl) {
      throw new BadRequestException("Project repo_url is not configured")
    }

    const { owner, repo } = parseGithubRepository(project.repoUrl)
    const releases = await fetchGithubReleases(owner, repo)
    if (releases.length === 0) {
      return { imported: 0, skipped: 0, scanned: 0 }
    }

    const existing = await this.prisma.version.findMany({
      where: { projectKey: normalizedKey },
      select: { version: true },
    })
    const existingVersions = new Set(existing.map((item) => item.version))

    let imported = 0
    let skipped = 0
    for (const release of releases) {
      const tag = release.tag_name?.trim()
      if (!tag) {
        skipped += 1
        continue
      }

      const normalizedVersion = normalizeVersionTag(tag)
      if (!normalizedVersion || existingVersions.has(normalizedVersion)) {
        skipped += 1
        continue
      }
      parseComparableVersion(normalizedVersion)

      const releaseLinks = toGithubReleaseDownloadLinks(release.assets)
      const downloadUrl =
        releaseLinks[0]?.url ?? release.zipball_url?.trim() ?? release.html_url?.trim() ?? null
      const publishedAt = release.published_at
        ? Math.floor(new Date(release.published_at).getTime() / 1000)
        : nowSeconds()

      await this.prisma.version.create({
        data: {
          projectKey: normalizedKey,
          version: normalizedVersion,
          comparableVersion: normalizedVersion,
          title: release.name?.trim() || null,
          content: release.body?.trim() || null,
          downloadUrl,
          downloadLinks: releaseLinks,
          forced: false,
          isLatest: false,
          isPreview: Boolean(release.prerelease),
          isMilestone: false,
          isDeprecated: false,
          platforms: [],
          platform: undefined,
          customData: {
            source: "github-release-import",
            owner,
            repo,
            release_tag: tag,
          },
          publishedAt: Number.isFinite(publishedAt) ? publishedAt : nowSeconds(),
        },
      })

      existingVersions.add(normalizedVersion)
      imported += 1
    }

    return { imported, skipped, scanned: releases.length }
  }
}

// ── Pure helpers (no DI dependency) ──

/** Parse a GitHub repository URL into owner and repo name. */
export function parseGithubRepository(repoUrl: string): { owner: string; repo: string } {
  let parsed: URL
  try {
    parsed = new URL(repoUrl)
  } catch {
    throw new BadRequestException("Project repo_url is not a valid URL")
  }

  if (parsed.hostname !== "github.com") {
    throw new BadRequestException("Only github.com repository URL is supported")
  }

  const segments = parsed.pathname
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean)
  if (segments.length < 2) {
    throw new BadRequestException("Project repo_url must contain owner and repository")
  }

  const owner = segments[0]
  const rawRepo = segments[1]
  if (!owner || !rawRepo) {
    throw new BadRequestException("Project repo_url must contain owner and repository")
  }

  const repo = rawRepo.replace(/\.git$/i, "")
  if (!repo) {
    throw new BadRequestException("Project repo_url must contain owner and repository")
  }

  return { owner, repo }
}

/** Fetch all non-draft releases from a GitHub repository (first page, up to 100). */
async function fetchGithubReleases(owner: string, repo: string): Promise<GithubReleasePayload[]> {
  const endpoint = `https://api.github.com/repos/${owner}/${repo}/releases?per_page=100&page=1`
  const response = await fetch(endpoint, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "Verhub/1.2",
    },
  })

  if (!response.ok) {
    if (response.status === 404) {
      throw new NotFoundException("GitHub release not found")
    }
    throw new BadGatewayException(`GitHub API request failed with status ${response.status}`)
  }

  const payload = (await response.json()) as GithubReleasePayload[]
  return payload.filter((item) => !item.draft)
}
