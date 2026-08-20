/**
 * 语言标签（locale）的约定。
 *
 * 语言由项目自己注册，服务端不做 BCP 47 规范化——`zh-CN` 还是 `zh-Hans`
 * 由项目说了算，替它猜标准写法只会把没见过的写法改坏。这里只管两件事：
 * 收窄到一个安全的字符集，以及匹配时忽略大小写。
 */

import { Transform } from "class-transformer"

/** 语言标签长度上限。BCP 47 最长的实际写法也远短于此，余量留给自定义标签。 */
export const MAX_LOCALE_LENGTH = 35

/**
 * 字母数字段用连字符相连：`zh`、`zh-CN`、`zh-Hans-CN`、`en-US` 都覆盖得到。
 * 收窄字符集是为了让 locale 能安全地进 URL 路径（注销语言的端点用它做路径段）。
 */
export const LOCALE_PATTERN = /^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$/

/**
 * 比较用的归一化形式。存储保留录入时的原样写法（后台照原样显示），
 * 只有比对时才两边一起小写——客户端传 `zh-cn` 也该命中注册的 `zh-CN`。
 */
export function localeKey(value: string): string {
  return value.trim().toLowerCase()
}

/** 去空白，保留大小写。非字符串原样透传，交给后面的校验器报错。 */
export function NormalizeLocale() {
  return Transform(({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim() : value,
  )
}

/** 注册表里的一个语言：主标签加若干同义标签。 */
export type RegisteredLocale = {
  locale: string
  aliases?: string[]
}

/**
 * 把客户端提交的语言偏好解析成注册表里的**主标签**；没注册过返回 null（等同没提偏好）。
 *
 * 主标签与同义标签一视同仁地匹配，都忽略大小写；命中同义标签也返回主标签——
 * 译文是按主标签存的，返回变体写法会让调用方以为存在一份 en-GB 的独立译文。
 * 只认显式列出的同义标签，不做 `en-US → en` 这类前缀回退。
 */
export function matchRegisteredLocale(
  registered: RegisteredLocale[],
  wanted: string | undefined | null,
): string | null {
  const trimmed = wanted?.trim()
  if (!trimmed) {
    return null
  }

  const key = localeKey(trimmed)
  const hit = registered.find(
    (item) =>
      localeKey(item.locale) === key ||
      (item.aliases ?? []).some((alias) => localeKey(alias) === key),
  )

  return hit?.locale ?? null
}
