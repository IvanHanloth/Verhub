"use client"

import * as React from "react"
import { ArrowDown, ArrowUp, Loader2, Trash2 } from "lucide-react"

import { Button } from "@workspace/ui/components/button"

import { AdminCard } from "@/components/admin/admin-card"
import { useConfirm } from "@/components/common/confirm-dialog"
import { getErrorMessage } from "@/lib/error-utils"
import {
  deleteDashboardCard,
  listDashboardCards,
  runEventQuery,
  updateDashboardCard,
  type DashboardCardItem,
  type EventQueryResponse,
  type EventRange,
  type Granularity,
} from "@/lib/events-api"

import { EmptyHint, EventsShell, ErrorBanner } from "./events-shell"
import { QueryResultView } from "./query-builder"

/**
 * 分析看板。
 *
 * 卡片只存查询定义不存结果——结果随时间范围变化，缓存下来只会给出过期数字。
 * 因此每张卡片在渲染时按当前选中的区间各自执行一次查询。
 */
export function EventsDashboard() {
  return (
    <EventsShell
      title="分析看板"
      description="保存下来的查询卡片。每张卡片按当前选中的区间实时计算——存的是定义不是结果，所以换个区间看到的就是那个区间的数字。"
      defaultRangeIndex={2}
    >
      {({ projectKey, range, granularity, reloadToken }) => (
        <DashboardBody
          projectKey={projectKey}
          range={range}
          granularity={granularity}
          reloadToken={reloadToken}
        />
      )}
    </EventsShell>
  )
}

function DashboardBody({
  projectKey,
  range,
  granularity,
  reloadToken,
}: {
  projectKey: string
  range: EventRange
  granularity: Granularity
  reloadToken: number
}) {
  const [cards, setCards] = React.useState<DashboardCardItem[]>([])
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [localToken, setLocalToken] = React.useState(0)
  const confirm = useConfirm()

  React.useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError(null)

    listDashboardCards(projectKey, controller.signal)
      .then((response) => setCards(response.data))
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === "AbortError") return
        setError(getErrorMessage(cause, "看板加载失败"))
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })

    return () => controller.abort()
  }, [projectKey, reloadToken, localToken])

  const refresh = () => setLocalToken((token) => token + 1)

  /**
   * 上下移动。两张卡交换 sort_order 而不是整体重排：只发两个请求，
   * 且中途失败时看板不会变成一半新一半旧的顺序。
   */
  const move = async (index: number, direction: -1 | 1) => {
    const current = cards[index]
    const neighbour = cards[index + direction]
    if (!current || !neighbour) return

    try {
      await Promise.all([
        updateDashboardCard(projectKey, current.card_id, { sort_order: neighbour.sort_order }),
        updateDashboardCard(projectKey, neighbour.card_id, { sort_order: current.sort_order }),
      ])
      refresh()
    } catch (cause: unknown) {
      setError(getErrorMessage(cause, "调整顺序失败"))
    }
  }

  const remove = async (card: DashboardCardItem) => {
    const ok = await confirm({
      title: "删除卡片",
      description: `将删除卡片「${card.title}」。事件数据不受影响。`,
      confirmLabel: "删除",
      destructive: true,
    })
    if (!ok) return

    try {
      await deleteDashboardCard(projectKey, card.card_id)
      refresh()
    } catch (cause: unknown) {
      setError(getErrorMessage(cause, "删除失败"))
    }
  }

  if (loading && cards.length === 0) {
    return (
      <EmptyHint>
        <Loader2 className="mx-auto size-4 animate-spin" />
      </EmptyHint>
    )
  }

  if (cards.length === 0) {
    return (
      <>
        {error ? <ErrorBanner message={error} /> : null}
        <EmptyHint>
          <p className="text-base text-slate-200">还没有保存任何卡片。</p>
          <p>去「查询构建器」搭一个查询，满意后点「保存为卡片」。</p>
        </EmptyHint>
      </>
    )
  }

  return (
    <div className="space-y-4">
      {error ? <ErrorBanner message={error} /> : null}

      <div className="grid gap-4 xl:grid-cols-2">
        {cards.map((card, index) => (
          <DashboardCard
            key={card.card_id}
            card={card}
            projectKey={projectKey}
            range={range}
            granularity={granularity}
            reloadToken={reloadToken}
            canMoveUp={index > 0}
            canMoveDown={index + 1 < cards.length}
            onMoveUp={() => void move(index, -1)}
            onMoveDown={() => void move(index, 1)}
            onRemove={() => void remove(card)}
          />
        ))}
      </div>
    </div>
  )
}

function DashboardCard({
  card,
  projectKey,
  range,
  granularity,
  reloadToken,
  canMoveUp,
  canMoveDown,
  onMoveUp,
  onMoveDown,
  onRemove,
}: {
  card: DashboardCardItem
  projectKey: string
  range: EventRange
  granularity: Granularity
  reloadToken: number
  canMoveUp: boolean
  canMoveDown: boolean
  onMoveUp: () => void
  onMoveDown: () => void
  onRemove: () => void
}) {
  const [result, setResult] = React.useState<EventQueryResponse | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError(null)

    // 用当前区间覆盖卡片里存的区间：卡片存的是「算什么」，区间由看板统一给，
    // 否则同一屏上的几张卡片可能各自停在不同的时间窗上。
    runEventQuery(projectKey, { ...card.query, ...range }, controller.signal)
      .then(setResult)
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === "AbortError") return
        setError(getErrorMessage(cause, "卡片计算失败"))
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })

    return () => controller.abort()
  }, [projectKey, card.query, range, reloadToken])

  return (
    <AdminCard className="space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-medium" title={card.title}>
            {card.title}
          </h2>
          {card.description ? (
            <p className="mt-0.5 truncate text-xs text-slate-500">{card.description}</p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          <Button
            variant="ghost"
            size="sm"
            aria-label="上移"
            disabled={!canMoveUp}
            onClick={onMoveUp}
          >
            <ArrowUp className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            aria-label="下移"
            disabled={!canMoveDown}
            onClick={onMoveDown}
          >
            <ArrowDown className="size-3.5" />
          </Button>
          <Button variant="ghost" size="sm" aria-label="删除卡片" onClick={onRemove}>
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      </div>

      {error ? (
        <p className="text-xs text-amber-200/80">{error}</p>
      ) : loading || !result ? (
        <div className="grid h-32 place-items-center">
          <Loader2 className="size-4 animate-spin text-slate-400" />
        </div>
      ) : (
        <QueryResultView result={result} granularity={granularity} />
      )}
    </AdminCard>
  )
}
