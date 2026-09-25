/**
 * 语言标签（locale）的约定。
 *
 * 语言由项目自己注册，服务端不做 BCP 47 规范化——`zh-CN` 还是 `zh-Hans`
 * 由项目说了算，替它猜标准写法只会把没见过的写法改坏。客户端提交的写法没有
 * "非法"一说：`en-US`、`en_US`、`en(US)` 都按同一个语言比对，其余写法整串比对，
 * 比对不上就回落默认内容并附带提示，而不是 400。
 */

import { Transform } from "class-transformer"

/** 注册与写入译文时的语言标签长度上限。公开端的语言偏好不受此限。 */
export const MAX_LOCALE_LENGTH = 35

/**
 * 注册 / 写入时的语言标签字符集：只排除控制字符与路径分隔符——注销语言的端点
 * 用它做路径段，`/` 会被网关当成路径层级。
 */
export const LOCALE_PATTERN = /^[^\p{Cc}/\\]+$/u

/**
 * 比较用的归一化形式。存储保留录入时的原样写法（后台照原样显示），只有比对时
 * 两边都走这里：忽略大小写，`_` 与括号都视作 `-`，于是 `en_US`、`en(US)`、
 * `en (US)` 都等同 `en-us`。不含任何分隔符的写法只做大小写归一，整串比对。
 */
export function localeKey(value: string): string {
  const lowered = value.trim().toLowerCase()
  if (!/[-_()]/.test(lowered)) {
    return lowered
  }

  const key = lowered
    .replace(/[()]/g, "-")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
  // 全是分隔符的输入归一后为空，退回原串，免得和别的"空"撞在一起。
  return key || lowered
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
 * 主标签与同义标签一视同仁地按 localeKey 比对；命中同义标签也返回主标签——
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

/** 公开端对语言偏好的解析结果。`message` 非空表示提交了但没命中，内容已回落默认。 */
export type LocaleResolution = {
  locale: string | null
  message: string | null
}

export const NO_LOCALE: LocaleResolution = { locale: null, message: null }

/**
 * matchRegisteredLocale 的公开端版本：没命中时不报错，而是带一句提示随响应返回，
 * 让客户端知道回落是因为提交的语言不对，而不是该语言恰好没有译文。
 */
export function resolveLocalePreference(
  registered: RegisteredLocale[],
  wanted: string | undefined | null,
): LocaleResolution {
  const trimmed = wanted?.trim()
  if (!trimmed) {
    return NO_LOCALE
  }

  const locale = matchRegisteredLocale(registered, trimmed)
  if (locale) {
    return { locale, message: null }
  }

  return {
    locale: null,
    message: `Locale "${trimmed}" does not match any locale registered for this project; default content is returned.`,
  }
}
