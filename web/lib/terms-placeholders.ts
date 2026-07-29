/**
 * 条款模板占位符的替换。
 *
 * 替换只发生在管理端：填空后生成的成品才提交保存，库里与前台展示的正文里不该
 * 再有 {{}}。因此这里不做「找不到就保留原样」的兜底，未填的键一律留在正文里由
 * hasUnfilledPlaceholder 拦下来提醒，避免把空字符串悄悄塞进条款。
 */

/** 与后端 placeholders.ts 的 PLACEHOLDER_PATTERN 保持一致。 */
const PLACEHOLDER_PATTERN = /\{\{\s*([a-z0-9_]+)\s*\}\}/g

export function applyPlaceholders(template: string, values: Record<string, string>): string {
  return template.replace(PLACEHOLDER_PATTERN, (original, key: string) => {
    const value = values[key]?.trim()
    return value ? value : original
  })
}

export function hasUnfilledPlaceholder(content: string): boolean {
  return new RegExp(PLACEHOLDER_PATTERN.source).test(content)
}

/** 正文里仍未替换的占位符键，用于逐条提示。 */
export function listUnfilledPlaceholders(content: string): string[] {
  const keys = [...content.matchAll(PLACEHOLDER_PATTERN)]
    .map((match) => match[1])
    .filter((key): key is string => Boolean(key))
  return [...new Set(keys)]
}
