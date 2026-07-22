/**
 * 平台取值与展示名，全站唯一来源。
 *
 * 与后端 `Platform` 枚举一一对应：接口返回的明细字段是小写（`windows`），
 * 统计接口返回的是大写（`WINDOWS`），两种形态在这里各给一份标签表，避免各页面
 * 自己维护一份选项列表——上一版正是那样漏掉了 Linux、还留着已废弃的 `mac`。
 */

export const PLATFORM_VALUES = [
  "windows",
  "linux",
  "macos",
  "ios",
  "android",
  "web",
  "others",
] as const

export type Platform = (typeof PLATFORM_VALUES)[number]

/** 统计接口里的大写形态。 */
export type StatPlatform = Uppercase<Platform>

export const PLATFORM_LABELS: Record<Platform, string> = {
  windows: "Windows",
  linux: "Linux",
  macos: "macOS",
  ios: "iOS",
  android: "Android",
  web: "Web",
  others: "其他",
}

/** 下拉框、多选按钮共用的选项列表，顺序与枚举一致。 */
export const PLATFORM_OPTIONS: Array<{ label: string; value: Platform }> = PLATFORM_VALUES.map(
  (value) => ({ label: PLATFORM_LABELS[value], value }),
)

export const STAT_PLATFORM_LABELS = Object.fromEntries(
  PLATFORM_VALUES.map((value) => [value.toUpperCase(), PLATFORM_LABELS[value]]),
) as Record<StatPlatform, string>

/** 认不出的取值原样回显，比显示「未知」更有助于排查。 */
export function platformLabel(value: string | null | undefined): string | null {
  if (!value) {
    return null
  }
  return PLATFORM_LABELS[value.toLowerCase() as Platform] ?? value
}

/**
 * 平台 + 系统版本的组合展示，如 `Windows 11`、`Linux ubuntu 24.04`。
 *
 * 版本明细里已经含平台名（发行版形态）时不重复拼，否则会出现「Linux linux mint」。
 */
export function formatPlatformVersion(
  platform: string | null | undefined,
  version: string | null | undefined,
): string | null {
  const label = platformLabel(platform)
  const detail = version?.trim()

  if (!detail) {
    return label
  }
  if (!label) {
    return detail
  }
  return detail.toLowerCase().startsWith(label.toLowerCase()) ? detail : `${label} ${detail}`
}
