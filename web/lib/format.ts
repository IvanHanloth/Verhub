/**
 * 后端所有时间字段都是 Unix 秒，展示统一走这里，避免各处自己乘 1000 时漏掉
 * null 分支。fallback 可覆盖：有的位置说"从未设置"，有的说"—"。
 */
export function formatTimestamp(seconds: number | null | undefined, fallback = "从未设置"): string {
  return seconds ? new Date(seconds * 1000).toLocaleString() : fallback
}
