import { cn } from "@workspace/ui/lib/utils"

/**
 * 骨架屏基元：脉冲占位块。配色与 analytics 的 `ChartPlaceholder` 一致，
 * 让全站加载态是同一种视觉语言。
 */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded bg-slate-900/8 dark:bg-white/10", className)} />
}

/**
 * 列表加载骨架：按「展开箭头 + 徽章 + 时间 + 正文行」的行结构占位。
 *
 * 替代居中 spinner：骨架保留了真实行的高度与排布，加载完成时内容就地填入，
 * 不会像 spinner 那样先塌成一小团再撑开，避免布局跳动。放在与真实列表同一个
 * `divide-y` 容器里，分隔线与最终列表连续。
 */
export function ListRowsSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div
      className="divide-y divide-slate-900/10 dark:divide-white/10"
      role="status"
      aria-label="加载中"
    >
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="flex items-start gap-2 px-4 py-3">
          <Skeleton className="mt-1 size-4 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex items-center gap-2">
              <Skeleton className="h-4 w-12 rounded-full" />
              <Skeleton className="h-3 w-28" />
            </div>
            {/* 正文两行、后一行更短，贴近真实的 line-clamp 观感。 */}
            <Skeleton className="h-3.5 w-3/4" />
            <Skeleton className="h-3.5 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  )
}

/**
 * 表格加载骨架：一个带边框的容器内铺若干行等宽占位条，首列窄些贴近「标题列」。
 *
 * 给反馈 / 公告 / 行为这类表格列表用。同样保留行高，加载完成后表格就地填入，
 * 不像 spinner 卡片那样先显示一小条再突然长成整张表。
 */
export function TableSkeleton({ rows = 6, columns = 4 }: { rows?: number; columns?: number }) {
  return (
    <div
      className="overflow-hidden rounded-2xl border border-slate-900/10 dark:border-white/10"
      role="status"
      aria-label="加载中"
    >
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div
          key={rowIndex}
          className="flex items-center gap-4 border-b border-slate-900/5 px-4 py-3 last:border-b-0 dark:border-white/5"
        >
          {Array.from({ length: columns }).map((_, columnIndex) => (
            <Skeleton
              key={columnIndex}
              className={cn("h-3.5", columnIndex === 0 ? "w-2/5" : "flex-1")}
            />
          ))}
        </div>
      ))}
    </div>
  )
}
