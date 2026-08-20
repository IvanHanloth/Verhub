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

/**
 * 可比较版本号的格式。导出供 DTO 的 `@Matches` 复用——校验与解析必须是同一条规则，
 * 否则会出现"校验放行、解析抛错"的组合。
 */
export const COMPARABLE_VERSION_PATTERN =
  /^(?<core>\d+(?:\.\d+)*)(?:-(?<tag>alpha|beta|rc)(?:\.(?<tail>\d+(?:\.\d+)*))?)?$/

/**
 * 排序键的形状。定长纯数字，让**字符串序**等价于 {@link compareComparableVersions} 的语义序，
 * 从而把版本排序交给数据库索引（列表要分页、更新检查是热路径，都不能全量拉进内存排序）。
 *
 * 段数或位数超限时 clamp 而不报错——这是写入路径，不能因为排序键拒绝一个本来合法的版本；
 * 溢出的代价只是这几个版本排序退化到 publishedAt。
 */
const SORT_SEGMENT_WIDTH = 10
const SORT_CORE_SEGMENTS = 4
const SORT_PRE_SEGMENTS = 3
const SORT_SEGMENT_MAX = "9".repeat(SORT_SEGMENT_WIDTH)
const SORT_SEGMENT_ZERO = "0".repeat(SORT_SEGMENT_WIDTH)
/** 正式版没有预发布标记，权重必须大于所有标记，才能排在同一 core 的预发布之后。 */
const STABLE_TAG_WEIGHT = 9

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

/**
 * 生成 `Version.comparableVersionSort` 的值：定长排序键，字符串降序即版本降序。
 *
 * 与 `prisma/migrations/*_version_sort_key/migration.sql` 里的回填 SQL 同构，改一边要改另一边。
 *
 * 三态透传给 Prisma：`undefined` 表示"这次不动这一列"，`null` 表示清空。解析不出来的
 * 旧数据同样落 `null`——排序时靠 `nulls: "last"` / `{ not: null }` 把它们挡在最新版判定之外，
 * 好过让一个格式脏的版本号顶掉真正的最新版。
 */
export function toComparableVersionSortKey(value: string): string | null
export function toComparableVersionSortKey(value: null | undefined): null | undefined
export function toComparableVersionSortKey(
  value: string | null | undefined,
): string | null | undefined
export function toComparableVersionSortKey(
  value: string | null | undefined,
): string | null | undefined {
  if (value === undefined || value === null) {
    return value
  }

  let parsed: ComparableVersion
  try {
    parsed = parseComparableVersion(value)
  } catch {
    return null
  }

  const core = padSortSegments(parsed.core, SORT_CORE_SEGMENTS)
  const tagWeight = parsed.preTag ? PRE_RELEASE_WEIGHT[parsed.preTag] : STABLE_TAG_WEIGHT
  const pre = padSortSegments(parsed.preNumbers, SORT_PRE_SEGMENTS)

  return `${core}${tagWeight}${pre}`
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

/** 把版本号的数字段左补零成定长串；缺的段补 0，超宽的段封顶，段数超限直接丢弃。 */
function padSortSegments(segments: number[], count: number): string {
  let result = ""
  for (let index = 0; index < count; index += 1) {
    const value = segments[index]
    if (value === undefined || !Number.isFinite(value) || value <= 0) {
      result += SORT_SEGMENT_ZERO
      continue
    }

    const text = String(Math.floor(value))
    result +=
      text.length > SORT_SEGMENT_WIDTH ? SORT_SEGMENT_MAX : text.padStart(SORT_SEGMENT_WIDTH, "0")
  }

  return result
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
