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
import { ProjectResolverService } from "../database/project-resolver.service"
import { matchRegisteredLocale } from "../common/locale"
import { CheckVersionUpdateDto } from "./dto/check-version-update.dto"
import {
  compareComparableVersions,
  isComparableVersionInRange,
  parseComparableVersion,
} from "./version-comparator"
import { toVersionItem, translationInclude } from "./version-mapping"
import type { CheckVersionUpdateResponse, VersionRecord } from "./types"

@Injectable()
export class VersionUpdateCheckService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectResolver: ProjectResolverService,
  ) {}

  /**
   * 语言偏好 -> 项目注册表里的主标签；没注册过就返回 null（等同没提偏好）。
   * 与 VersionsService 里同名方法同一套规则，两处都要用而模块间不互相注入。
   */
  private async resolveRegisteredLocale(
    projectKey: string,
    locale: string | undefined,
  ): Promise<string | null> {
    if (!locale?.trim()) {
      return null
    }

    const registered = await this.prisma.projectLocale.findMany({
      where: { projectKey },
      select: { locale: true, aliases: true },
    })

    return matchRegisteredLocale(registered, locale)
  }

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

    const normalizedKey = await this.projectResolver.resolveCanonicalKeyOrThrow(projectKey)
    const locale = await this.resolveRegisteredLocale(normalizedKey, dto.locale)
    const project = await this.prisma.project.findUniqueOrThrow({
      where: { projectKey: normalizedKey },
      select: {
        projectKey: true,
        optionalUpdateMinComparableVersion: true,
        optionalUpdateMaxComparableVersion: true,
      },
    })

    // Resolve latest candidates (always needed for the response)
    const { latestCandidate, latestPreview } = await this.resolveLatestCandidates(
      normalizedKey,
      dto.include_preview ?? false,
      locale,
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
        locale,
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
      // 三个版本对象都按同一个语言回落：客户端把它们并排显示，
      // 只译其中一个会得到中英混排的更新弹窗。
      latest_version: toVersionItem(latestCandidate, { locale }),
      latest_preview_version: latestPreview ? toVersionItem(latestPreview, { locale }) : null,
      target_version: targetVersion ? toVersionItem(targetVersion, { locale }) : null,
      milestone: {
        current: currentRecord?.isMilestone ?? false,
        latest: latestCandidate.isMilestone,
        target_is_milestone: milestoneTarget !== null,
      },
    }
  }

  // ── Private helpers ──

  /**
   * @param locale 已归一到主标签的请求语言。这三处查询的结果都会经 toVersionItem
   *   进响应，不 include 译文的话语言回落永远命不中。
   */
  private async resolveLatestCandidates(
    projectKey: string,
    includePreview: boolean,
    locale: string | null,
  ): Promise<{ latestCandidate: VersionRecord | null; latestPreview: VersionRecord | null }> {
    const include = translationInclude(locale)

    const latestStable = await this.prisma.version.findFirst({
      where: {
        projectKey,
        isPreview: false,
        // 用排序键而非 comparableVersion 判空：格式脏到解析不出排序键的版本
        // 不该参与"最新版"竞争，否则会顶掉真正的最新版推给客户端。
        comparableVersionSort: { not: null },
      },
      orderBy: [{ comparableVersionSort: "desc" }, { publishedAt: "desc" }, { createdAt: "desc" }],
      include,
    })
    const latestPreview = await this.prisma.version.findFirst({
      where: {
        projectKey,
        isPreview: true,
        comparableVersionSort: { not: null },
      },
      orderBy: [{ comparableVersionSort: "desc" }, { publishedAt: "desc" }, { createdAt: "desc" }],
      include,
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
    locale: string | null,
  ): Promise<VersionRecord | null> {
    const milestoneCandidatesRaw = await this.prisma.version.findMany({
      where: {
        projectKey,
        isMilestone: true,
        isPreview: false,
        isDeprecated: false,
        comparableVersion: { not: null },
      },
      include: translationInclude(locale),
    })
    const milestoneCandidates = Array.isArray(milestoneCandidatesRaw) ? milestoneCandidatesRaw : []

    // 谓词类型取自查询结果本身：查询带 include 后行类型比 VersionRecord 宽，
    // 写死 VersionRecord 会让谓词不可赋回参数类型。
    type MilestoneCandidate = (typeof milestoneCandidates)[number]

    const blockers = milestoneCandidates
      .filter((item): item is MilestoneCandidate & { comparableVersion: string } =>
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
