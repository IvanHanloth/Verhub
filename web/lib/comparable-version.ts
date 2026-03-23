const COMPARABLE_VERSION_PATTERN =
  /^(?<core>\d+(?:\.\d+)*)(?:-(?<tag>alpha|beta|rc)(?:\.(?<tail>\d+(?:\.\d+)*))?)?$/

export function isComparableVersion(value: string): boolean {
  return COMPARABLE_VERSION_PATTERN.test(value.trim())
}

export function validateComparableVersion(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed) {
    return "可比较版本号为必填项。"
  }

  if (!isComparableVersion(trimmed)) {
    return "格式不合法：应为 1.2.3 / 1.2.3-alpha / 1.2.3-rc.2"
  }

  return null
}

export function extractComparableVersionFromVersion(version: string): string | null {
  const trimmed = version.trim().replace(/^v/i, "")
  if (!trimmed) {
    return null
  }

  if (isComparableVersion(trimmed)) {
    return trimmed
  }

  const coreMatch = trimmed.match(/\d+(?:\.\d+)*/)
  if (!coreMatch) {
    return null
  }

  const suffix = trimmed.slice((coreMatch.index ?? 0) + coreMatch[0].length)
  const prereleaseMatch = suffix.match(/[-_.]?(alpha|beta|rc)(?:[-_.]?(\d+(?:[._]\d+)*))?/i)
  if (!prereleaseMatch) {
    return coreMatch[0]
  }

  const tag = prereleaseMatch[1]?.toLowerCase()
  if (!tag) {
    return coreMatch[0]
  }

  const tail = prereleaseMatch[2]?.replace(/_/g, ".")
  const candidate = tail ? `${coreMatch[0]}-${tag}.${tail}` : `${coreMatch[0]}-${tag}`
  return isComparableVersion(candidate) ? candidate : coreMatch[0]
}
