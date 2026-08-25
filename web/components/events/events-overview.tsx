"use client"

import * as React from "react"
import { BarChart3, Flame, Layers, MonitorSmartphone, TrendingUp } from "lucide-react"

import { getErrorMessage } from "@/lib/error-utils"
import {
  getEventBreakdown,
  getEventHeatmap,
  getEventOverview,
  getEventTimeseries,
  type EventBreakdown,
  type EventHeatmap,
  type EventOverview,
  type EventRange,
  type EventTimeseries,
  type EventTimeseriesGroupBy,
  type Granularity,
} from "@/lib/events-api"
import {
  ChartCard,
  ChartPlaceholder,
  ChartViewToggle,
  SegmentedToggle,
  type ChartView,
} from "@/components/analytics/chart-card"
import {
  PLATFORM_COLORS,
  formatNumber,
  seriesColor,
  type DistributionItem,
} from "@/components/analytics/chart-utils"
import { DistributionChart, ShareTable } from "@/components/analytics/distribution-chart"
import { RequestHeatmap } from "@/components/analytics/request-heatmap"
import { StackedTrendChart, TrendLineChart } from "@/components/analytics/trend-chart"
import { StatTile } from "@/components/analytics/stat-tile"
import { PLATFORM_LABELS, regionLabel } from "@/lib/analytics-api"
import type { StatPlatform } from "@/lib/platform"

import { EventsShell, ErrorBanner, NoEventsHint } from "./events-shell"

/** 趋势图的拆分方式。`total` 是不拆，画一条总量线。 */
type TrendMode = "total" | EventTimeseriesGroupBy

const TREND_MODES: Array<{ value: TrendMode; title: string }> = [
  { value: "total", title: "总量" },
  { value: "event", title: "按事件" },
  { value: "platform", title: "按平台" },
  { value: "region", title: "按地区" },
]

/** Top 事件的行数；尾巴由 total 减去本页之和还原。 */
const TOP_EVENT_LIMIT = 12

export function EventsOverview() {
  return (
    <EventsShell
      title="行为分析"
      description="事件由客户端自由上报，服务端自动登记——无需预先在后台建任何东西。这里是全部事件的总体情况。"
    >
      {({ projectKey, range, granularity, reloadToken }) => (
        <OverviewBody
          projectKey={projectKey}
          range={range}
          granularity={granularity}
          reloadToken={reloadToken}
        />
      )}
    </EventsShell>
  )
}

function OverviewBody({
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
  const [overview, setOverview] = React.useState<EventOverview | null>(null)
  const [timeseries, setTimeseries] = React.useState<EventTimeseries | null>(null)
  const [topEvents, setTopEvents] = React.useState<EventBreakdown | null>(null)
  const [platforms, setPlatforms] = React.useState<EventBreakdown | null>(null)
  const [regions, setRegions] = React.useState<EventBreakdown | null>(null)
  const [heatmap, setHeatmap] = React.useState<EventHeatmap | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [trendLoading, setTrendLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const [trendMode, setTrendMode] = React.useState<TrendMode>("total")
  const [eventView, setEventView] = React.useState<ChartView>("bar")
  const [platformView, setPlatformView] = React.useState<ChartView>("donut")

  React.useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError(null)

    Promise.all([
      getEventOverview(projectKey, range, controller.signal),
      getEventBreakdown(
        projectKey,
        { ...range, dimension: "event", limit: TOP_EVENT_LIMIT },
        controller.signal,
      ),
      getEventBreakdown(projectKey, { ...range, dimension: "platform" }, controller.signal),
      getEventBreakdown(
        projectKey,
        { ...range, dimension: "region", limit: 10 },
        controller.signal,
      ),
      getEventHeatmap(projectKey, range, controller.signal),
    ])
      .then(([overviewData, eventsData, platformData, regionData, heatmapData]) => {
        setOverview(overviewData)
        setTopEvents(eventsData)
        setPlatforms(platformData)
        setRegions(regionData)
        setHeatmap(heatmapData)
      })
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === "AbortError") return
        setError(getErrorMessage(cause, "统计加载失败"))
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })

    return () => controller.abort()
  }, [projectKey, range, reloadToken])

  // 趋势单独拉：切换拆分维度时只该重画这一张图，不该把整页都转一遍。
  React.useEffect(() => {
    const controller = new AbortController()
    setTrendLoading(true)

    getEventTimeseries(
      projectKey,
      {
        ...range,
        granularity,
        ...(trendMode === "total" ? {} : { group_by: trendMode }),
      },
      controller.signal,
    )
      .then(setTimeseries)
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === "AbortError") return
        setError(getErrorMessage(cause, "趋势加载失败"))
      })
      .finally(() => {
        if (!controller.signal.aborted) setTrendLoading(false)
      })

    return () => controller.abort()
  }, [projectKey, range, granularity, trendMode, reloadToken])

  const eventItems = React.useMemo<DistributionItem[]>(
    () =>
      (topEvents?.data ?? []).map((bucket, index) => ({
        key: bucket.key,
        label: bucket.label,
        count: bucket.count,
        fill: seriesColor(index),
      })),
    [topEvents],
  )

  const platformItems = React.useMemo<DistributionItem[]>(
    () =>
      (platforms?.data ?? []).map((bucket, index) => ({
        key: bucket.key,
        label: PLATFORM_LABELS[bucket.key as StatPlatform] ?? bucket.label,
        count: bucket.count,
        fill: PLATFORM_COLORS[bucket.key as StatPlatform] ?? seriesColor(index),
      })),
    [platforms],
  )

  const regionItems = React.useMemo<DistributionItem[]>(
    () =>
      (regions?.data ?? []).map((bucket, index) => ({
        key: bucket.key,
        label: regionLabel(bucket.key),
        count: bucket.count,
        fill: seriesColor(index),
      })),
    [regions],
  )

  // 概览与趋势都拉完了却一条都没有，才是真的「还没接入」；加载中不下这个判断。
  const empty = !loading && overview !== null && overview.total === 0 && overview.event_types === 0

  if (empty) {
    return (
      <>
        {error ? <ErrorBanner message={error} /> : null}
        <NoEventsHint />
      </>
    )
  }

  return (
    <div className="space-y-4">
      {error ? <ErrorBanner message={error} /> : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="事件总量"
          value={overview ? formatNumber(overview.total) : "—"}
          hint="区间内的上报条数"
          spark={timeseries?.data.map((point) => point.count)}
        />
        <StatTile
          label="独立用户"
          value={overview ? formatNumber(overview.unique_users) : "—"}
          hint="区间内出现过的匿名标识数"
        />
        <StatTile
          label="活跃会话"
          value={overview ? formatNumber(overview.unique_sessions) : "—"}
          hint="区间内的会话数"
        />
        <StatTile
          label="事件种类"
          value={overview ? formatNumber(overview.event_types) : "—"}
          hint="有过上报的事件名数量"
        />
      </div>

      <ChartCard
        title="事件量趋势"
        subtitle={trendMode === "total" ? "全部事件的总量" : "按维度拆分，堆叠后即总量"}
        icon={TrendingUp}
        actions={
          <SegmentedToggle
            value={trendMode}
            label="趋势拆分"
            options={TREND_MODES}
            onChange={setTrendMode}
          />
        }
      >
        {trendLoading || !timeseries ? (
          <ChartPlaceholder loading={trendLoading} className="aspect-[16/7]" />
        ) : trendMode === "total" || !timeseries.series?.length ? (
          <TrendLineChart
            points={timeseries.data}
            granularity={timeseries.granularity}
            measureLabel="事件数"
          />
        ) : (
          <StackedTrendChart
            series={timeseries.series}
            granularity={timeseries.granularity}
            naming={trendMode === "platform" ? "platform" : "raw"}
          />
        )}
      </ChartCard>

      <div className="grid gap-4 xl:grid-cols-2">
        <ChartCard
          title="事件排行"
          subtitle={`按上报量降序，最多 ${TOP_EVENT_LIMIT} 项`}
          icon={BarChart3}
          actions={<ChartViewToggle value={eventView} onChange={setEventView} label="事件分布" />}
        >
          {loading || !topEvents ? (
            <ChartPlaceholder loading={loading} className="aspect-[4/3]" />
          ) : (
            <div className="space-y-4">
              <DistributionChart
                items={eventItems}
                view={eventView}
                measureLabel="事件数"
                extraTail={tailOf(topEvents)}
                labelMaxChars={16}
              />
              <ShareTable
                items={eventItems}
                total={topEvents.total}
                categoryHeader="事件"
                measureHeader="事件数"
                tailCount={tailOf(topEvents)}
              />
            </div>
          )}
        </ChartCard>

        <ChartCard
          title="平台分布"
          icon={MonitorSmartphone}
          actions={
            <ChartViewToggle value={platformView} onChange={setPlatformView} label="平台分布" />
          }
        >
          {loading || !platforms ? (
            <ChartPlaceholder loading={loading} className="aspect-[4/3]" />
          ) : (
            <div className="space-y-4">
              <DistributionChart items={platformItems} view={platformView} measureLabel="事件数" />
              <ShareTable
                items={platformItems}
                total={platforms.total}
                categoryHeader="平台"
                measureHeader="事件数"
              />
            </div>
          )}
        </ChartCard>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <ChartCard title="来源地区" subtitle="按上报量降序，最多 10 项" icon={Layers}>
          {loading || !regions ? (
            <ChartPlaceholder loading={loading} className="aspect-[4/3]" />
          ) : (
            <ShareTable
              items={regionItems}
              total={regions.total}
              categoryHeader="地区"
              measureHeader="事件数"
              tailCount={tailOf(regions)}
            />
          )}
        </ChartCard>

        <ChartCard
          title="活跃节律"
          subtitle="按每条上报来源国家的当地时区折叠，回答「用户在当地几点活跃」"
          icon={Flame}
        >
          <RequestHeatmap cells={heatmap?.data ?? []} loading={loading} />
        </ChartCard>
      </div>
    </div>
  )
}

/** 被 limit 截掉的尾巴。后端返回的 total 是全量，减去本页之和即得。 */
function tailOf(breakdown: EventBreakdown): number {
  const shown = breakdown.data.reduce((sum, bucket) => sum + bucket.count, 0)
  return Math.max(0, breakdown.total - shown)
}
