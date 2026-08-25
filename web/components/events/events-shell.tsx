"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Activity, AlertTriangle, Loader2, RefreshCw } from "lucide-react"

import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"

import { AdminCard } from "@/components/admin/admin-card"
import { AdminPageHeader } from "@/components/admin/admin-page-header"
import { useAdminProjects } from "@/hooks/use-admin-projects"
import { DAY_SECONDS } from "@/components/analytics/chart-utils"
import { SegmentedToggle } from "@/components/analytics/chart-card"
import type { EventRange, Granularity } from "@/lib/events-api"

/**
 * 行为分析各页共用的外壳：项目守卫、区间选择、子导航与错误条。
 *
 * 抽出来是因为六个页面对「当前看哪个项目、看哪段时间」的语义必须完全一致——
 * 各写一份的话，用户在漏斗页选了近 30 天、切到留存页又变回 7 天，两张图对不上账
 * 却看不出原因。
 */

type RangeOption = {
  label: string
  seconds: number
  granularity: Granularity
}

/**
 * 粒度与区间绑定，折线图才不会画出上千个点：小时级明细只在一周内有意义。
 * 与统计大屏的档位保持一致，两处切换时用户的心智模型不用换。
 */
export const EVENT_RANGE_OPTIONS: RangeOption[] = [
  { label: "近 24 小时", seconds: DAY_SECONDS, granularity: "hour" },
  { label: "近 7 天", seconds: 7 * DAY_SECONDS, granularity: "hour" },
  { label: "近 30 天", seconds: 30 * DAY_SECONDS, granularity: "day" },
  { label: "近 90 天", seconds: 90 * DAY_SECONDS, granularity: "day" },
]

const SUB_NAV = [
  { href: "/admin/events", label: "概览" },
  { href: "/admin/events/definitions", label: "事件清单" },
  { href: "/admin/events/funnel", label: "漏斗" },
  { href: "/admin/events/retention", label: "留存" },
  { href: "/admin/events/paths", label: "路径" },
  { href: "/admin/events/explore", label: "查询构建器" },
  { href: "/admin/events/dashboard", label: "看板" },
]

export type EventsShellRender = {
  projectKey: string
  range: EventRange
  granularity: Granularity
  /** 变化时重新拉数据；「刷新」按钮靠它触发。 */
  reloadToken: number
}

type EventsShellProps = {
  title: string
  description: string
  /** 不需要时间区间的页面（如事件清单的编辑操作）可以隐藏选择器。 */
  showRange?: boolean
  /** 默认选中的区间档位，默认「近 7 天」。 */
  defaultRangeIndex?: number
  actions?: React.ReactNode
  children: (context: EventsShellRender) => React.ReactNode
}

export function EventsShell({
  title,
  description,
  showRange = true,
  defaultRangeIndex = 1,
  actions,
  children,
}: EventsShellProps) {
  const pathname = usePathname()
  const { selectedProjectKey, loading: projectsLoading, error: projectsError } = useAdminProjects()
  const [rangeIndex, setRangeIndex] = React.useState(defaultRangeIndex)
  const [reloadToken, setReloadToken] = React.useState(0)

  const option = EVENT_RANGE_OPTIONS[rangeIndex] ?? EVENT_RANGE_OPTIONS[1]!

  /**
   * 区间终点在 effect 里取而不是渲染时算。
   *
   * 渲染期读 `Date.now()` 是不纯的：组件因任何原因重渲染都会得到一个新的区间对象，
   * 下游以 `range` 为依赖的请求会跟着重发一轮。放进 state 后，只有换档位或者点
   * 刷新才会前进——这也正是「近 24 小时」应有的语义：它跟着刷新走，而不是随
   * 渲染悄悄滑动。
   */
  const [nowSeconds, setNowSeconds] = React.useState(0)

  React.useEffect(() => {
    setNowSeconds(Math.floor(Date.now() / 1000))
  }, [rangeIndex, reloadToken])

  const range = React.useMemo<EventRange>(
    () => ({
      start_time: nowSeconds - option.seconds,
      end_time: nowSeconds,
      tz_offset_minutes: -new Date(nowSeconds * 1000).getTimezoneOffset(),
    }),
    [nowSeconds, option.seconds],
  )

  // 首帧还没跑 effect，此时的区间是 [0, 0]，发出去等于查询全时段。
  const ready = nowSeconds > 0

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title={title}
        description={description}
        icon={Activity}
        badge="行为分析"
        actions={
          <>
            {actions}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setReloadToken((token) => token + 1)}
              disabled={!selectedProjectKey}
            >
              <RefreshCw className="size-4" />
              刷新
            </Button>
          </>
        }
      />

      <nav className="flex flex-wrap gap-1.5" aria-label="行为分析子页面">
        {SUB_NAV.map((item) => {
          // 概览是前缀最短的一条，用完全相等判断，否则它在每个子页都会高亮。
          const active =
            item.href === "/admin/events" ? pathname === item.href : pathname.startsWith(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "rounded-full border px-3 py-1.5 text-sm transition",
                active
                  ? "border-cyan-300/40 bg-cyan-300/15 text-cyan-100"
                  : "border-white/10 text-slate-300 hover:border-cyan-200/30 hover:text-cyan-100",
              )}
            >
              {item.label}
            </Link>
          )
        })}
      </nav>

      {showRange ? (
        <SegmentedToggle
          value={String(rangeIndex)}
          label="统计区间"
          options={EVENT_RANGE_OPTIONS.map((item, index) => ({
            value: String(index),
            title: item.label,
          }))}
          onChange={(value) => setRangeIndex(Number(value))}
        />
      ) : null}

      {projectsError ? <ErrorBanner message={projectsError} /> : null}

      {!selectedProjectKey || !ready ? (
        <AdminCard className="p-10 text-center text-sm text-slate-300">
          {projectsLoading || (selectedProjectKey && !ready) ? (
            <span className="inline-flex items-center gap-2">
              <Loader2 className="size-4 animate-spin" />
              正在加载…
            </span>
          ) : (
            "请先在右上角选择一个项目。"
          )}
        </AdminCard>
      ) : (
        children({
          projectKey: selectedProjectKey,
          range,
          granularity: option.granularity,
          reloadToken,
        })
      )}
    </div>
  )
}

export function ErrorBanner({ message }: { message: string }) {
  return (
    <AdminCard className="flex items-start gap-2 border-amber-300/30 bg-amber-300/10 p-4 text-sm text-amber-100">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
      <span>{message}</span>
    </AdminCard>
  )
}

/**
 * 空数据提示。
 *
 * 单独抽出来是因为「还没有任何事件」在这套页面里是个高频状态——接入方刚接完 SDK
 * 时每一页都是空的，文案要引导他去埋第一个点，而不是显示一个孤零零的「暂无数据」。
 */
export function EmptyHint({ children }: { children: React.ReactNode }) {
  return (
    <AdminCard className="space-y-2 p-10 text-center text-sm text-slate-300">{children}</AdminCard>
  )
}

/** 还没有任何事件时的统一引导，六个页面共用一份文案。 */
export function NoEventsHint() {
  return (
    <EmptyHint>
      <p className="text-base text-slate-200">这个项目还没有收到任何行为事件。</p>
      <p>
        在客户端调用一次{" "}
        <code className="rounded bg-white/10 px-1.5 py-0.5">
          client.public.track(&quot;事件名&quot;)
        </code>{" "}
        即可，<strong>无需预先在后台登记事件</strong>——服务端第一次收到就会自动建立定义。
      </p>
    </EmptyHint>
  )
}
