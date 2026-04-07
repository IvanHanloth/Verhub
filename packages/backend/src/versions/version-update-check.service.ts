/**
 * Version update check service.
 *
 * Implements the client-facing "check for update" logic with three steps:
 *   1. Determine whether an update is needed
 *   2. Determine whether the update is required (forced)
 *   3. Determine the update target version
 *
 * Separated from VersionsService to isolate complex decision logic from CRUD.
 */

import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common"

import { PrismaService } from "../database/prisma.service"
import { CheckVersionUpdateDto } from "./dto/check-version-update.dto"
import {
  compareComparableVersions,
  isComparableVersionInRange,
  parseComparableVersion,
} from "./version-comparator"
import { toVersionItem } from "./version-mapping"
import type { CheckVersionUpdateResponse, VersionRecord } from "./types"
import { normalizeProjectKey } from "./types"

@Injectable()
export class VersionUpdateCheckService {
  constructor(private readonly prisma: PrismaService) {}

  /** Evaluate whether a client should update, and to which version. */
  async checkUpdateByProjectKey(
    projectKey: string,
    dto: CheckVersionUpdateDto,
  ): Promise<CheckVersionUpdateResponse> {
    if (!dto.validate()) {
      throw new BadRequestException(
        "At least one of current_version or current_comparable_version must be provided",
      )
    }

    const normalizedKey = normalizeProjectKey(projectKey)
    const project = await this.prisma.project.findUnique({
      where: { projectKey: normalizedKey },
      select: {
        projectKey: true,
        optionalUpdateMinComparableVersion: true,
        optionalUpdateMaxComparableVersion: true,
      },
    })
    if (!project) {
      throw new NotFoundException("Project not found")
    }

    // Resolve latest candidates (always needed for the response)
    const { latestCandidate, latestPreview } = await this.resolveLatestCandidates(
      normalizedKey,
      dto.include_preview ?? false,
    )
    if (!latestCandidate) {
      throw new NotFoundException("Version not found")
    }

    // Resolve current version record & comparable version
    const currentRecord = await this.resolveCurrentRecord(
      normalizedKey,
      dto.current_version,
      dto.current_comparable_version,
    )
    const currentComparableVersion = this.resolveCurrentComparableVersion(dto, currentRecord)

    this.validateComparableVersions(project)

    const latestComparableVersion = latestCandidate.comparableVersion
    if (!latestComparableVersion) {
      throw new BadRequestException("Latest version comparable_version is not configured")
    }

    // ── Step 1: Determine if update is needed ──
    const isDeprecated = currentRecord?.isDeprecated ?? false
    const hasNewer =
      compareComparableVersions(latestComparableVersion, currentComparableVersion) > 0
    const shouldUpdate = hasNewer || isDeprecated

    // ── Step 2: Determine if update is required ──
    const isInOptionalRange = isComparableVersionInRange(
      currentComparableVersion,
      project.optionalUpdateMinComparableVersion,
      project.optionalUpdateMaxComparableVersion,
    )
    const required = shouldUpdate && (isDeprecated || (hasNewer && !isInOptionalRange))

    // ── Step 3: Determine update target ──
    let targetVersion: VersionRecord | null = null
    let milestoneTarget: VersionRecord | null = null

    if (hasNewer) {
      milestoneTarget = await this.resolveMilestoneGuard(
        normalizedKey,
        currentComparableVersion,
        latestComparableVersion,
      )
      targetVersion = milestoneTarget ?? latestCandidate
    }

    // Build reason codes
    const reasons: string[] = []
    if (hasNewer) {
      reasons.push("newer_version_available")
    }
    if (isDeprecated) {
      reasons.push("current_version_deprecated")
    }
    if (hasNewer && !isInOptionalRange) {
      reasons.push("outside_optional_update_range")
    }
    if (milestoneTarget) {
      reasons.push("milestone_guard")
    }

    return {
      should_update: shouldUpdate,
      required,
      reason_codes: reasons,
      current_version: currentRecord?.version ?? dto.current_version?.trim() ?? null,
      current_comparable_version: currentComparableVersion,
      latest_version: toVersionItem(latestCandidate),
      latest_preview_version: latestPreview ? toVersionItem(latestPreview) : null,
      target_version: targetVersion ? toVersionItem(targetVersion) : null,
      milestone: {
        current: currentRecord?.isMilestone ?? false,
        latest: latestCandidate.isMilestone,
        target_is_milestone: milestoneTarget !== null,
      },
    }
  }

  // ── Private helpers ──

  private async resolveLatestCandidates(
    projectKey: string,
    includePreview: boolean,
  ): Promise<{ latestCandidate: VersionRecord | null; latestPreview: VersionRecord | null }> {
    const latestStable = await this.prisma.version.findFirst({
      where: {
        projectKey,
        isPreview: false,
        comparableVersion: { not: null },
      },
      orderBy: [{ comparableVersion: "desc" }, { publishedAt: "desc" }, { createdAt: "desc" }],
    })
    const latestPreview = await this.prisma.version.findFirst({
      where: {
        projectKey,
        isPreview: true,
        comparableVersion: { not: null },
      },
      orderBy: [{ comparableVersion: "desc" }, { publishedAt: "desc" }, { createdAt: "desc" }],
    })

    const latestCandidate = includePreview
      ? pickHigherVersion(latestStable, latestPreview)
      : latestStable

    return { latestCandidate, latestPreview }
  }

  private async resolveCurrentRecord(
    projectKey: string,
    currentVersion: string | undefined,
    currentComparableVersion: string | undefined,
  ): Promise<{
    version: string
    comparableVersion: string | null
    isMilestone: boolean
    isDeprecated: boolean
  } | null> {
    const preferredComparableVersion = currentComparableVersion?.trim()
    if (preferredComparableVersion) {
      return this.prisma.version.findFirst({
        where: {
          projectKey,
          comparableVersion: preferredComparableVersion,
        },
        select: {
          version: true,
          comparableVersion: true,
          isMilestone: true,
          isDeprecated: true,
        },
      })
    }

    const preferredVersion = currentVersion?.trim()
    if (!preferredVersion) {
      return null
    }

    return this.prisma.version.findFirst({
      where: {
        projectKey,
        version: preferredVersion,
      },
      select: {
        version: true,
        comparableVersion: true,
        isMilestone: true,
        isDeprecated: true,
      },
    })
  }

  private resolveCurrentComparableVersion(
    dto: CheckVersionUpdateDto,
    currentRecord: { comparableVersion: string | null } | null,
  ): string {
    const currentComparableVersion =
      dto.current_comparable_version?.trim() || currentRecord?.comparableVersion || ""
    if (!currentComparableVersion) {
      throw new BadRequestException(
        "current_comparable_version is required when current version record does not provide comparable_version",
      )
    }
    parseComparableVersion(currentComparableVersion)
    return currentComparableVersion
  }

  private validateComparableVersions(project: {
    optionalUpdateMinComparableVersion: string | null
    optionalUpdateMaxComparableVersion: string | null
  }): void {
    if (project.optionalUpdateMinComparableVersion) {
      parseComparableVersion(project.optionalUpdateMinComparableVersion)
    }
    if (project.optionalUpdateMaxComparableVersion) {
      parseComparableVersion(project.optionalUpdateMaxComparableVersion)
    }
  }

  /**
   * Find milestone versions between current and latest.
   * Returns the nearest newer milestone to enforce step-by-step upgrades.
   */
  private async resolveMilestoneGuard(
    projectKey: string,
    currentComparableVersion: string,
    latestComparableVersion: string,
  ): Promise<VersionRecord | null> {
    const milestoneCandidatesRaw = await this.prisma.version.findMany({
      where: {
        projectKey,
        isMilestone: true,
        isPreview: false,
        isDeprecated: false,
        comparableVersion: { not: null },
      },
    })
    const milestoneCandidates = Array.isArray(milestoneCandidatesRaw) ? milestoneCandidatesRaw : []

    const blockers = milestoneCandidates
      .filter((item): item is VersionRecord & { comparableVersion: string } =>
        Boolean(item.comparableVersion),
      )
      .filter(
        (item) =>
          compareComparableVersions(item.comparableVersion, currentComparableVersion) > 0 &&
          compareComparableVersions(item.comparableVersion, latestComparableVersion) <= 0,
      )
      .sort((a, b) => compareComparableVersions(a.comparableVersion, b.comparableVersion))

    return blockers[0] ?? null
  }
}

// ── Pure utility ──

function pickHigherVersion(
  stable: VersionRecord | null,
  preview: VersionRecord | null,
): VersionRecord | null {
  if (!stable) return preview
  if (!preview) return stable

  if (!stable.comparableVersion || !preview.comparableVersion) {
    return preview.publishedAt >= stable.publishedAt ? preview : stable
  }

  return compareComparableVersions(preview.comparableVersion, stable.comparableVersion) >= 0
    ? preview
    : stable
}
