import { BadRequestException } from "@nestjs/common"

type PreReleaseTag = "alpha" | "beta" | "rc"

export type ComparableVersion = {
  raw: string
  core: number[]
  preTag: PreReleaseTag | null
  preNumbers: number[]
}

const PRE_RELEASE_WEIGHT: Record<PreReleaseTag, number> = {
  alpha: 1,
  beta: 2,
  rc: 3,
}

const COMPARABLE_VERSION_PATTERN =
  /^(?<core>\d+(?:\.\d+)*)(?:-(?<tag>alpha|beta|rc)(?:\.(?<tail>\d+(?:\.\d+)*))?)?$/

export function parseComparableVersion(value: string): ComparableVersion {
  const raw = value.trim()
  const match = COMPARABLE_VERSION_PATTERN.exec(raw)
  const groups = match?.groups
  const coreGroup = groups?.core
  if (!groups || !coreGroup) {
    throw new BadRequestException(
      "Invalid comparable_version. Expected format like 1.2.3, 1.2.3-alpha, or 1.2.3-rc.2",
    )
  }

  const core = coreGroup.split(".").map((item) => Number(item))
  const preTag = (groups.tag as PreReleaseTag | undefined) ?? null
  const preNumbers = groups.tail ? groups.tail.split(".").map((item) => Number(item)) : []

  return {
    raw,
    core,
    preTag,
    preNumbers,
  }
}

export function compareComparableVersions(a: string, b: string): number {
  const left = parseComparableVersion(a)
  const right = parseComparableVersion(b)
  return compareParsedComparableVersions(left, right)
}

export function compareParsedComparableVersions(
  a: ComparableVersion,
  b: ComparableVersion,
): number {
  const coreDiff = compareNumberArray(a.core, b.core)
  if (coreDiff !== 0) {
    return coreDiff
  }

  if (!a.preTag && !b.preTag) {
    return 0
  }

  if (!a.preTag && b.preTag) {
    return 1
  }

  if (a.preTag && !b.preTag) {
    return -1
  }

  const leftTagWeight = PRE_RELEASE_WEIGHT[a.preTag as PreReleaseTag]
  const rightTagWeight = PRE_RELEASE_WEIGHT[b.preTag as PreReleaseTag]
  if (leftTagWeight !== rightTagWeight) {
    return leftTagWeight > rightTagWeight ? 1 : -1
  }

  return compareNumberArray(a.preNumbers, b.preNumbers)
}

export function isComparableVersionInRange(
  value: string,
  min?: string | null,
  max?: string | null,
): boolean {
  const target = parseComparableVersion(value)

  if (min) {
    const minDiff = compareParsedComparableVersions(target, parseComparableVersion(min))
    if (minDiff < 0) {
      return false
    }
  }

  if (max) {
    const maxDiff = compareParsedComparableVersions(target, parseComparableVersion(max))
    if (maxDiff > 0) {
      return false
    }
  }

  return true
}

function compareNumberArray(left: number[], right: number[]): number {
  const maxLength = Math.max(left.length, right.length)
  for (let index = 0; index < maxLength; index += 1) {
    const leftValue = left[index] ?? 0
    const rightValue = right[index] ?? 0
    if (leftValue === rightValue) {
      continue
    }

    return leftValue > rightValue ? 1 : -1
  }

  return 0
}
