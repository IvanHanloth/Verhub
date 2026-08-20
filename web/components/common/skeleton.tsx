import type * as React from "react"
import { Loader2 } from "lucide-react"

import { cn } from "@workspace/ui/lib/utils"

/**
 * 单行加载提示：一个转圈图标 + 一句文案。
 *
 * 用在骨架屏不划算的地方 —— 弹窗里的小面板、卡片顶部这类高度本来就不确定的
 * 区域，塌成一行比铺一片假内容更诚实。列表页的骨架屏由 `DataTable` 自己按列数
 * 生成，不走这里。`size="sm"` 是嵌在面板里的紧凑版。
 */
export function LoadingLine({
  children,
  size = "md",
}: {
  children: React.ReactNode
  size?: "sm" | "md"
}) {
  return (
    <p
      className={cn(
        "flex items-center gap-2 text-slate-600 dark:text-slate-400",
        size === "sm" ? "text-xs" : "text-sm",
      )}
    >
      <Loader2 className={cn("animate-spin", size === "sm" ? "size-3.5" : "size-4")} />
      {children}
    </p>
  )
}
