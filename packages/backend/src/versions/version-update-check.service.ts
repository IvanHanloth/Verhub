/**
 * Version update check service.
 *
 * Implements the client-facing "check for update" logic including
 * version comparison, optional update range evaluation, deprecation
 * detection, and milestone guard. Separated from VersionsService
 * to isolate complex decision logic from CRUD operations.
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
    // Validate that at least one version identifier is provided
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

    const { latestCandidate, latestPreview } = await this.resolveLatestCandidates(
      normalizedKey,
      dto.include_preview ?? false,
    )
    if (!latestCandidate) {
      throw new NotFoundException("Version not found")
    }

    const currentRecord = await this.resolveCurrentRecord(normalizedKey, dto.current_version)
    const currentComparableVersion = this.resolveCurrentComparableVersion(dto, currentRecord)

    this.validateComparableVersions(project, currentComparableVersion)

    const latestComparableVersion = latestCandidate.comparableVersion
    if (!latestComparableVersion) {
      throw new BadRequestException("Latest version comparable_version is not configured")
    }

    const hasNewer =
      compareComparableVersions(latestComparableVersion, currentComparableVersion) > 0

    const { required, reasons, targetVersion } = this.evaluateUpdatePolicy(
      hasNewer,
      currentComparableVersion,
      latestComparableVersion,
      currentRecord,
      latestCandidate,
      project.optionalUpdateMinComparableVersion,
      project.optionalUpdateMaxComparableVersion,
    )

    const milestoneTarget = await this.resolveMilestoneGuard(
      hasNewer,
      required,
      normalizedKey,
      currentComparableVersion,
      latestComparableVersion,
    )

    const finalTarget = milestoneTarget ?? targetVersion
    if (milestoneTarget) {
      reasons.push("milestone_guard")
    }

    return {
      should_update: hasNewer || required,
      required,
      reason_codes: reasons,
      current_version: currentRecord?.version ?? dto.current_version?.trim() ?? null,
      current_comparable_version: currentComparableVersion,
      latest_version: toVersionItem(latestCandidate),
      latest_preview_version: latestPreview ? toVersionItem(latestPreview) : null,
      target_version: toVersionItem(finalTarget),
      milestone: {
        current: currentRecord?.isMilestone ?? false,
        latest: latestCandidate.isMilestone,
        latest_in_current: milestoneTarget ? toVersionItem(milestoneTarget) : null,
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
  ): Promise<{
    version: string
    comparableVersion: string | null
    isMilestone: boolean
    isDeprecated: boolean
  } | null> {
    if (!currentVersion) {
      return null
    }

    return this.prisma.version.findFirst({
      where: {
        projectKey,
        version: currentVersion.trim(),
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

  private validateComparableVersions(
    project: {
      optionalUpdateMinComparableVersion: string | null
      optionalUpdateMaxComparableVersion: string | null
    },
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _currentComparableVersion?: string,
  ): void {
    if (project.optionalUpdateMinComparableVersion) {
      parseComparableVersion(project.optionalUpdateMinComparableVersion)
    }
    if (project.optionalUpdateMaxComparableVersion) {
      parseComparableVersion(project.optionalUpdateMaxComparableVersion)
    }
  }

  /**
   * Evaluate whether the update should be required based on optional range,
   * deprecation, and version comparison.
   */
  private evaluateUpdatePolicy(
    hasNewer: boolean,
    currentComparableVersion: string,
    _latestComparableVersion: string,
    currentRecord: { isDeprecated: boolean } | null,
    latestCandidate: VersionRecord,
    optionalMin: string | null,
    optionalMax: string | null,
  ): { required: boolean; reasons: string[]; targetVersion: VersionRecord } {
    const reasons: string[] = []
    let required = false

    if (hasNewer) {
      reasons.push("newer_version_available")
    }

    const isInOptionalRange = isComparableVersionInRange(
      currentComparableVersion,
      optionalMin,
      optionalMax,
    )
    if (hasNewer && !isInOptionalRange) {
      required = true
      reasons.push("outside_optional_update_range")
    }

    if (currentRecord?.isDeprecated && hasNewer) {
      required = true
      reasons.push("current_version_deprecated")
    }

    return { required, reasons, targetVersion: latestCandidate }
  }

  /**
   * When a required update exists, check for milestone versions between
   * current and latest. The earliest milestone becomes the update target
   * to enforce step-by-step major upgrades.
   */
  private async resolveMilestoneGuard(
    hasNewer: boolean,
    required: boolean,
    projectKey: string,
    currentComparableVersion: string,
    latestComparableVersion: string,
  ): Promise<VersionRecord | null> {
    if (!hasNewer || !required) {
      return null
    }

    const milestoneCandidatesRaw = await this.prisma.version.findMany({
      where: {
        projectKey,
        isMilestone: true,
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
