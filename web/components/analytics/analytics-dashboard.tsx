"use client"

import * as React from "react"
import dynamic from "next/dynamic"
import {
  Activity,
  AlertTriangle,
  BarChart3,
  CalendarDays,
  Flame,
  Globe2,
  Layers,
  Loader2,
  MapPin,
  MessageSquareHeart,
  MonitorSmartphone,
  RefreshCw,
  ScrollText,
  Table2,
  TrendingUp,
} from "lucide-react"

import { Button } from "@workspace/ui/components/button"

import { isAuthError } from "@/lib/api-client"
import { getErrorMessage } from "@/lib/error-utils"
import { getSessionToken } from "@/lib/auth-session"
import { AdminCard } from "@/components/admin/admin-card"
import { AdminPageHeader } from "@/components/admin/admin-page-header"
import { useAdminProjects } from "@/hooks/use-admin-projects"
import {
  ENDPOINT_LABELS,
  PLATFORM_LABELS,
  getClientVersionStats,
  getFeedbackRatingStats,
  getLogLevelStats,
  getPlatformVersionStats,
  getRequestStatsHeatmap,
  getRequestStatsOverview,
  getRequestStatsTimeseries,
  getVersionAdoptionStats,
  regionLabel,
  type ClientVersionStats,
  type FeedbackRatingStats,
  type Granularity,
  type LogLevelStats,
  type PlatformVersionStats,
  type PublicEndpoint,
  type RequestStatsHeatmap,
  type RequestStatsOverview,
  type RequestStatsTimeseries,
  type TimeseriesGroupBy,
  type VersionAdoptionStats,
} from "@/lib/analytics-api"
import { formatPlatformVersion } from "@/lib/platform"

import { ActivityCalendar } from "./activity-calendar"
import {
  ChartCard,
  ChartPlaceholder,
  ChartViewToggle,
  SegmentedToggle,
  type ChartView,
} from "./chart-card"
import {
  DAY_SECONDS,
  PLATFORM_COLORS,
  TAIL_COLOR,
  formatNumber,
  percent,
  seriesColor,
  type DistributionItem,
} from "./chart-utils"
import { DistributionChart, ShareTable } from "./distribution-chart"
import { CHINA_PROVINCE_MAP, WORLD_COUNTRY_MAP, toCountryHeat } from "./geo-map-sources"
import { RequestHeatmap } from "./request-heatmap"
import { StackedTrendChart, TrendLineChart } from "./trend-chart"
import { StatTile, computeDelta } from "./stat-tile"

// echarts 较重，懒加载以免进主 bundle；地图仅在统计大屏出现。
const GeoHeatMap = dynamic(() => import("./geo-heat-map").then((mod) => mod.GeoHeatMap), {
  ssr: false,
})

/** 地图粒度。国内看省级，全球看国家级——再细的境外行政区数据源给不出来。 */
type MapScope = "china" | "world"

const MAP_SCOPES: Array<{ value: MapScope; title: string }> = [
  { value: "china", title: "国内" },
  { value: "world", title: "全球" },
]

/** 省级图的 key 本身就是省名，无需翻译。模块级常量，免得每次渲染都换掉引用。 */
const identity = (key: string) => key

/** Rows in the version chart; everything past this is folded into 其他. */
const VERSION_CHART_LIMIT = 12

/** 系统版本比客户端版本更分散（多平台 × 多大版本），行数放宽一档。 */
const PLATFORM_VERSION_CHART_LIMIT = 16

/** 采纳曲线的序列数：超过六条，颜色就分不清了。 */
const ADOPTION_SERIES_LIMIT = 6

/** The activity calendar always shows a fixed year, independent of the range picker. */
const CALENDAR_DAYS = 364

type RangeOption = {
  label: string
  seconds: number
  granularity: Granularity
}

/**
 * Granularity is tied to the range so the line chart never renders thousands of
 * points: hourly detail is only meaningful up to about a week.
 */
const RANGE_OPTIONS: RangeOption[] = [
  { label: "近 24 小时", seconds: DAY_SECONDS, granularity: "hour" },
  { label: "近 7 天", seconds: 7 * DAY_SECONDS, granularity: "hour" },
  { label: "近 30 天", seconds: 30 * DAY_SECONDS, granularity: "day" },
  { label: "近 90 天", seconds: 90 * DAY_SECONDS, granularity: "day" },
  { label: "近一年", seconds: 365 * DAY_SECONDS, granularity: "day" },
]

/** 趋势图的拆分方式。`total` 是不拆，画一条总量线。 */
type TrendMode = "total" | TimeseriesGroupBy

const TREND_MODES: Array<{ value: TrendMode; label: string }> = [
  { value: "total", label: "总量" },
  { value: "endpoint", label: "按接口" },
  { value: "platform", label: "按平台" },
]

const LOG_LEVEL_LABELS = ["DEBUG", "INFO", "WARN", "ERROR"]

/** 等级色沿用告警语义，而不是定类调色板的取号顺序：ERROR 必须是红的。 */
const LOG_LEVEL_COLORS = [TAIL_COLOR, "var(--series-1)", "var(--series-3)", "var(--series-6)"]

/** 评分色按好差分档，让直方图不用读数字就能看出口碑偏向。 */
const RATING_COLORS = [
  "var(--series-6)",
  "var(--series-8)",
  "var(--series-3)",
  "var(--series-2)",
  "var(--series-4)",
]

export function AnalyticsDashboard() {
  const { selectedProject, selectedProjectKey, error: projectsError } = useAdminProjects()
  const [rangeIndex, setRangeIndex] = React.useState(1)
  const [overview, setOverview] = React.useState<RequestStatsOverview | null>(null)
  /** 上一个等长区间，只用来算 KPI 环比。 */
  const [previous, setPrevious] = React.useState<RequestStatsOverview | null>(null)
  const [timeseries, setTimeseries] = React.useState<RequestStatsTimeseries | null>(null)
  const [clientVersions, setClientVersions] = React.useState<ClientVersionStats | null>(null)
  const [adoption, setAdoption] = React.useState<VersionAdoptionStats | null>(null)
  const [platformVersions, setPlatformVersions] = React.useState<PlatformVersionStats | null>(null)
  const [logLevels, setLogLevels] = React.useState<LogLevelStats | null>(null)
  const [ratings, setRatings] = React.useState<FeedbackRatingStats | null>(null)
  const [heatmap, setHeatmap] = React.useState<RequestStatsHeatmap | null>(null)
  const [calendar, setCalendar] = React.useState<RequestStatsTimeseries | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [trendLoading, setTrendLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [reloadToken, setReloadToken] = React.useState(0)

  const [trendMode, setTrendMode] = React.useState<TrendMode>("total")
  const [versionView, setVersionView] = React.useState<ChartView>("bar")
  const [platformVersionView, setPlatformVersionView] = React.useState<ChartView>("bar")
  const [regionView, setRegionView] = React.useState<ChartView>("bar")
  const [endpointView, setEndpointView] = React.useState<ChartView>("bar")
  // 默认国内：主要流量在国内，省级粒度是常看的那张；全球图一键可切。
  const [mapScope, setMapScope] = React.useState<MapScope>("china")

  const range = RANGE_OPTIONS[rangeIndex] ?? RANGE_OPTIONS[1]!

  React.useEffect(() => {
    const token = getSessionToken()
    if (!token || !selectedProjectKey) {
      setOverview(null)
      setPrevious(null)
      setClientVersions(null)
      setAdoption(null)
      setPlatformVersions(null)
      setLogLevels(null)
      setRatings(null)
      setHeatmap(null)
      setCalendar(null)
      return
    }

    const controller = new AbortController()
    const endTime = Math.floor(Date.now() / 1000)
    const startTime = endTime - range.seconds

    setLoading(true)
    setError(null)

    Promise.all([
      getRequestStatsOverview(token, selectedProjectKey, { startTime, endTime }, controller.signal),
      // 紧邻的上一个等长区间，供 KPI 算环比。
      getRequestStatsOverview(
        token,
        selectedProjectKey,
        { startTime: startTime - range.seconds, endTime: startTime },
        controller.signal,
      ),
      getClientVersionStats(
        token,
        selectedProjectKey,
        { startTime, endTime },
        VERSION_CHART_LIMIT,
        controller.signal,
      ),
      getVersionAdoptionStats(
        token,
        selectedProjectKey,
        { startTime, endTime },
        range.granularity,
        ADOPTION_SERIES_LIMIT,
        controller.signal,
      ),
      getPlatformVersionStats(
        token,
        selectedProjectKey,
        { startTime, endTime },
        PLATFORM_VERSION_CHART_LIMIT,
        controller.signal,
      ),
      getLogLevelStats(token, selectedProjectKey, { startTime, endTime }, controller.signal),
      getFeedbackRatingStats(token, selectedProjectKey, { startTime, endTime }, controller.signal),
      getRequestStatsHeatmap(token, selectedProjectKey, { startTime, endTime }, controller.signal),
      // The calendar is deliberately not tied to the range picker: a year of
      // daily buckets is the whole point of the view, and re-fetching it for
      // "近 24 小时" would leave 364 empty cells.
      getRequestStatsTimeseries(
        token,
        selectedProjectKey,
        { startTime: endTime - CALENDAR_DAYS * DAY_SECONDS, endTime },
        "day",
        undefined,
        controller.signal,
      ),
    ])
      .then(
        ([
          overviewResult,
          previousResult,
          versionsResult,
          adoptionResult,
          platformVersionsResult,
          logResult,
          ratingResult,
          heatmapResult,
          calendarResult,
        ]) => {
          if (controller.signal.aborted) return
          setOverview(overviewResult)
          setPrevious(previousResult)
          setClientVersions(versionsResult)
          setAdoption(adoptionResult)
          setPlatformVersions(platformVersionsResult)
          setLogLevels(logResult)
          setRatings(ratingResult)
          setHeatmap(heatmapResult)
          setCalendar(calendarResult)
        },
      )
      .catch((cause: unknown) => {
        if (controller.signal.aborted || isAuthError(cause)) return
        setError(getErrorMessage(cause))
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })

    return () => {
      controller.abort()
    }
  }, [selectedProjectKey, range.seconds, range.granularity, reloadToken])

  // 趋势图单独拉：切换拆分维度只该重取这一张图，而不是把整屏十几个请求全打一遍。
  React.useEffect(() => {
    const token = getSessionToken()
    if (!token || !selectedProjectKey) {
      setTimeseries(null)
      return
    }

    const controller = new AbortController()
    const endTime = Math.floor(Date.now() / 1000)
    const startTime = endTime - range.seconds

    setTrendLoading(true)
    getRequestStatsTimeseries(
      token,
      selectedProjectKey,
      { startTime, endTime },
      range.granularity,
      undefined,
      controller.signal,
      trendMode === "total" ? undefined : trendMode,
    )
      .then((result) => {
        if (!controller.signal.aborted) setTimeseries(result)
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted || isAuthError(cause)) return
        setError(getErrorMessage(cause))
      })
      .finally(() => {
        if (!controller.signal.aborted) setTrendLoading(false)
      })

    return () => {
      controller.abort()
    }
  }, [selectedProjectKey, range.seconds, range.granularity, trendMode, reloadToken])

  const total = overview?.total ?? 0
  const trendPoints = React.useMemo(() => timeseries?.data ?? [], [timeseries])
  const sparkline = React.useMemo(() => trendPoints.map((point) => point.count), [trendPoints])

  const endpointItems = React.useMemo<DistributionItem[]>(
    () =>
      (overview?.by_endpoint ?? []).map((item, index) => ({
        key: item.endpoint,
        label: ENDPOINT_LABELS[item.endpoint] ?? item.endpoint,
        count: item.count,
        fill: seriesColor(index),
      })),
    [overview],
  )

  const platformItems = React.useMemo<DistributionItem[]>(
    () =>
      (overview?.by_platform ?? []).map((item) => ({
        key: item.platform,
        label: PLATFORM_LABELS[item.platform] ?? item.platform,
        count: item.count,
        fill: PLATFORM_COLORS[item.platform] ?? TAIL_COLOR,
      })),
    [overview],
  )

  const regionItems = React.useMemo<DistributionItem[]>(
    () =>
      (overview?.by_region ?? []).map((item, index) => ({
        key: item.region,
        label: regionLabel(item.region),
        count: item.count,
        fill: seriesColor(index),
      })),
    [overview],
  )

  const versionTotal = clientVersions?.total ?? 0
  const versionItems = React.useMemo<DistributionItem[]>(
    () =>
      (clientVersions?.data ?? []).map((item, index) => ({
        key: item.version,
        label: item.version,
        count: item.count,
        fill: seriesColor(index),
      })),
    [clientVersions],
  )
  // API 截断掉的行仍属于 total，显式列出来，免得占比悄悄不闭合。
  const versionTail = versionTotal - versionItems.reduce((sum, item) => sum + item.count, 0)
  const topVersion = versionItems[0] ?? null

  const platformVersionTotal = platformVersions?.total ?? 0
  const platformVersionItems = React.useMemo(
    () =>
      (platformVersions?.data ?? []).map((item) => ({
        key: `${item.platform}:${item.platform_version}`,
        // 明细为空串的桶是「报了平台没报版本」，标出来才不会被当成解析失败。
        label:
          formatPlatformVersion(item.platform.toLowerCase(), item.platform_version) ??
          item.platform,
        suffix: item.platform_version ? "" : " · 未报版本",
        count: item.count,
        fill: PLATFORM_COLORS[item.platform] ?? TAIL_COLOR,
      })),
    [platformVersions],
  )
  const platformVersionTail =
    platformVersionTotal - platformVersionItems.reduce((sum, item) => sum + item.count, 0)

  const logItems = React.useMemo<DistributionItem[]>(
    () =>
      (logLevels?.by_level ?? []).map((item) => ({
        key: String(item.level),
        label: LOG_LEVEL_LABELS[item.level] ?? String(item.level),
        count: item.count,
        fill: LOG_LEVEL_COLORS[item.level] ?? TAIL_COLOR,
      })),
    [logLevels],
  )
  const errorCount = logLevels?.by_level.find((item) => item.level === 3)?.count ?? 0

  const ratingItems = React.useMemo<DistributionItem[]>(
    () =>
      (ratings?.by_rating ?? []).map((item) => ({
        key: String(item.rating),
        label: "★".repeat(item.rating),
        count: item.count,
        fill: RATING_COLORS[item.rating - 1] ?? TAIL_COLOR,
      })),
    [ratings],
  )

  const adoptionSeries = React.useMemo(
    () => (adoption?.series ?? []).map((item) => ({ key: item.version, data: item.data })),
    [adoption],
  )

  const checkUpdateCount = countOf(overview, ["VERSION_CHECK_UPDATE"])
  const announcementCount = countOf(overview, ["ANNOUNCEMENT_LIST", "ANNOUNCEMENT_LATEST"])
  const peak = trendPoints.reduce((max, point) => Math.max(max, point.count), 0)

  const provinceData = React.useMemo(
    () => (overview?.by_province ?? []).map((item) => ({ key: item.name, count: item.count })),
    [overview],
  )

  const countryData = React.useMemo(() => toCountryHeat(overview?.by_region ?? []), [overview])

  const worldView = mapScope === "world"

  return (
    <div className="space-y-4">
      <AdminPageHeader
        title="统计大屏"
        description="按项目查看请求趋势、版本采纳、系统构成、来源分布与访问活跃度。"
        icon={BarChart3}
        actions={
          <Button
            variant="outline"
            onClick={() => setReloadToken((value) => value + 1)}
            disabled={loading || !selectedProjectKey}
          >
            {loading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <RefreshCw className="size-4" />
            )}
            刷新
          </Button>
        }
      />

      {/* 筛选条作用于下方所有图表（活跃度日历除外，它固定看一年）。 */}
      <AdminCard className="flex flex-wrap items-center gap-x-4 gap-y-3 py-3">
        <h2 className="text-sm font-semibold whitespace-nowrap">统计范围</h2>
        <div className="flex flex-wrap gap-2">
          {RANGE_OPTIONS.map((option, index) => (
            <button
              key={option.label}
              type="button"
              onClick={() => setRangeIndex(index)}
              aria-pressed={index === rangeIndex}
              className={`rounded-full border px-3 py-1.5 text-xs transition ${
                index === rangeIndex
                  ? "border-sky-400 bg-sky-500/20 text-sky-900 dark:text-sky-100"
                  : "border-slate-900/15 text-slate-600 hover:bg-slate-900/5 dark:border-white/20 dark:text-slate-300 dark:hover:bg-white/10"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
        <p className="hidden text-xs text-slate-500 lg:block dark:text-slate-400">
          统计按小时聚合，{range.granularity === "hour" ? "按小时展示" : "按天汇总展示"}
          。数据保留时长可在项目管理中调整。
        </p>
      </AdminCard>

      {error || projectsError ? (
        <AdminCard className="flex items-center gap-2 text-sm text-rose-500 dark:text-rose-300">
          <AlertTriangle className="size-4" />
          {error ?? projectsError}
        </AdminCard>
      ) : null}

      {/*
        Bento 栅格：手机单列，平板 6 列，桌面 12 列。每张卡自己声明跨度，卡片高度
        由内容决定而不是强行拉平——数据密度不同的卡硬撑成同高只会留出大片空白。
        min-w-0 贯穿到底：图表的固有宽度否则会撑破栅格，让窄屏横向滚动。
      */}
      <div className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-6 xl:grid-cols-12">
        {/* 六个磁贴在桌面一行排满（12 栅格 / 每个 2 格），平板折成两行三列。 */}
        <StatTile
          className="md:col-span-2 xl:col-span-2"
          label="总请求数"
          value={formatNumber(total)}
          hint={range.label}
          spark={sparkline}
          delta={computeDelta(total, previous?.total ?? 0)}
        />
        <StatTile
          className="md:col-span-2 xl:col-span-2"
          label="检查更新"
          value={formatNumber(checkUpdateCount)}
          hint={percent(checkUpdateCount, total)}
          delta={computeDelta(checkUpdateCount, countOf(previous, ["VERSION_CHECK_UPDATE"]))}
        />
        <StatTile
          className="md:col-span-2 xl:col-span-2"
          label="公告获取"
          value={formatNumber(announcementCount)}
          hint={percent(announcementCount, total)}
          delta={computeDelta(
            announcementCount,
            countOf(previous, ["ANNOUNCEMENT_LIST", "ANNOUNCEMENT_LATEST"]),
          )}
        />
        <StatTile
          className="md:col-span-2 xl:col-span-2"
          label="主流版本"
          value={topVersion?.label ?? "—"}
          hint={
            topVersion
              ? `占上报客户端 ${percent(topVersion.count, versionTotal)}`
              : "暂无客户端上报版本"
          }
        />
        {/* 错误数与评分没有上一区间的数据，不显示环比——留空好过编一个。 */}
        <StatTile
          className="md:col-span-2 xl:col-span-2"
          label="错误日志"
          value={formatNumber(errorCount)}
          hint={logLevels ? `共 ${formatNumber(logLevels.total)} 条日志` : "暂无日志"}
          higherIsBetter={false}
        />
        <StatTile
          className="md:col-span-2 xl:col-span-2"
          label="平均评分"
          value={ratings?.average_rating ? ratings.average_rating.toFixed(1) : "—"}
          hint={
            ratings && ratings.total > 0 ? `${formatNumber(ratings.total)} 条反馈` : "暂无用户反馈"
          }
        />

        <ChartCard
          className="md:col-span-6 xl:col-span-8"
          title="请求趋势"
          subtitle={`${selectedProject?.name ?? "未选择项目"} · 峰值 ${formatNumber(peak)}`}
          icon={Activity}
          actions={
            <div
              role="group"
              aria-label="趋势拆分维度"
              className="flex rounded-full border border-slate-900/15 p-0.5 text-xs dark:border-white/20"
            >
              {TREND_MODES.map((mode) => (
                <button
                  key={mode.value}
                  type="button"
                  aria-pressed={trendMode === mode.value}
                  onClick={() => setTrendMode(mode.value)}
                  className={`rounded-full px-2.5 py-1 transition ${
                    trendMode === mode.value
                      ? "bg-sky-500/20 text-sky-900 dark:text-sky-100"
                      : "text-slate-500 hover:bg-slate-900/5 dark:text-slate-400 dark:hover:bg-white/10"
                  }`}
                >
                  {mode.label}
                </button>
              ))}
            </div>
          }
        >
          {trendPoints.length === 0 ? (
            <ChartPlaceholder loading={trendLoading} />
          ) : trendMode === "total" || !timeseries?.series?.length ? (
            <TrendLineChart
              points={trendPoints}
              granularity={timeseries?.granularity ?? range.granularity}
              className="aspect-[16/9] w-full sm:aspect-[16/7]"
            />
          ) : (
            <StackedTrendChart
              series={timeseries.series}
              granularity={timeseries.granularity}
              naming={trendMode}
              className="aspect-[16/9] w-full sm:aspect-[16/7]"
            />
          )}
        </ChartCard>

        <ChartCard
          className="md:col-span-6 xl:col-span-4"
          title="来源平台"
          subtitle="按 SDK 声明或 User-Agent 推断"
          icon={MonitorSmartphone}
        >
          {platformItems.length === 0 ? (
            <ChartPlaceholder loading={loading} />
          ) : (
            <DistributionChart
              items={platformItems}
              view="donut"
              measureLabel="请求数"
              className="aspect-[4/3] w-full"
            />
          )}
        </ChartCard>

        <ChartCard
          className="md:col-span-6 xl:col-span-7"
          title="版本采纳曲线"
          subtitle={`头部 ${ADOPTION_SERIES_LIMIT} 个版本的上报量变化，看新版推广得多快`}
          icon={TrendingUp}
        >
          {adoptionSeries.length === 0 ? (
            <ChartPlaceholder loading={loading} emptyText="所选范围内没有客户端上报版本。" />
          ) : (
            <StackedTrendChart
              series={adoptionSeries}
              granularity={adoption?.granularity ?? range.granularity}
              naming="raw"
              className="aspect-[16/9] w-full sm:aspect-[16/7]"
            />
          )}
        </ChartCard>

        <ChartCard
          className="md:col-span-6 xl:col-span-5"
          title="客户端版本分布"
          subtitle={`来自 check-update 上报 · 共 ${formatNumber(versionTotal)} 次`}
          icon={Layers}
          actions={
            <ChartViewToggle value={versionView} onChange={setVersionView} label="版本分布" />
          }
        >
          {versionItems.length === 0 ? (
            <ChartPlaceholder loading={loading} emptyText="所选范围内没有客户端上报版本。" />
          ) : (
            <DistributionChart
              items={versionItems}
              view={versionView}
              measureLabel="上报数"
              barColor="var(--series-2)"
              extraTail={versionTail}
              labelWidth={84}
            />
          )}
        </ChartCard>

        <ChartCard
          className="md:col-span-6 xl:col-span-5"
          title="系统版本分布"
          subtitle={`调用方系统 · 共 ${formatNumber(platformVersionTotal)} 次请求`}
          icon={MonitorSmartphone}
          actions={
            <ChartViewToggle
              value={platformVersionView}
              onChange={setPlatformVersionView}
              label="系统版本分布"
            />
          }
        >
          {platformVersionItems.length === 0 ? (
            <ChartPlaceholder loading={loading} emptyText="所选范围内没有系统版本记录。" />
          ) : (
            <DistributionChart
              items={platformVersionItems}
              view={platformVersionView}
              measureLabel="请求数"
              extraTail={platformVersionTail}
              labelWidth={104}
              labelMaxChars={14}
              className="aspect-[4/5] w-full sm:aspect-[4/3]"
            />
          )}
        </ChartCard>

        <ChartCard
          className="md:col-span-6 xl:col-span-7"
          title="系统版本明细"
          subtitle="按请求数降序，占比以全部请求为分母"
          icon={Table2}
        >
          {platformVersionItems.length === 0 ? (
            <ChartPlaceholder loading={loading} emptyText="所选范围内没有系统版本记录。" />
          ) : (
            <ShareTable
              items={platformVersionItems}
              total={platformVersionTotal}
              categoryHeader="系统"
              measureHeader="请求数"
              tailCount={platformVersionTail}
              tailLabel="其他系统版本"
            />
          )}
        </ChartCard>

        <ChartCard
          className="md:col-span-6 xl:col-span-5"
          title="来源地区"
          subtitle="按调用方 IP 解析的国家/地区"
          icon={Globe2}
          actions={<ChartViewToggle value={regionView} onChange={setRegionView} label="来源地区" />}
        >
          {regionItems.length === 0 ? (
            <ChartPlaceholder loading={loading} />
          ) : (
            <DistributionChart
              items={regionItems}
              view={regionView}
              measureLabel="请求数"
              barColor="var(--series-4)"
              labelWidth={88}
            />
          )}
        </ChartCard>

        <ChartCard
          className="md:col-span-6 xl:col-span-7"
          title={worldView ? "全球国家分布" : "国内省份分布"}
          subtitle={
            worldView
              ? "按国家/地区请求量着色，不含无法定位的来源"
              : "按省级请求量着色，悬停查看省名与占比"
          }
          icon={MapPin}
          actions={
            <SegmentedToggle
              value={mapScope}
              onChange={setMapScope}
              label="地域分布"
              options={MAP_SCOPES}
            />
          }
        >
          <GeoHeatMap
            source={worldView ? WORLD_COUNTRY_MAP : CHINA_PROVINCE_MAP}
            data={worldView ? countryData : provinceData}
            loading={loading}
            label={worldView ? regionLabel : identity}
            emptyText={worldView ? "所选范围内暂无可定位的来源。" : "所选范围内暂无国内来源。"}
            ariaLabel={worldView ? "全球国家请求量热力地图" : "中国省级请求量热力地图"}
          />
        </ChartCard>

        <ChartCard
          className="md:col-span-6 xl:col-span-4"
          title="接口构成"
          subtitle="各公开接口的请求次数"
          icon={BarChart3}
          actions={
            <ChartViewToggle value={endpointView} onChange={setEndpointView} label="接口构成" />
          }
        >
          {endpointItems.length === 0 ? (
            <ChartPlaceholder loading={loading} />
          ) : (
            <DistributionChart
              items={endpointItems}
              view={endpointView}
              measureLabel="请求数"
              labelWidth={92}
              className="aspect-[4/5] w-full sm:aspect-[4/3]"
            />
          )}
        </ChartCard>

        <ChartCard
          className="md:col-span-3 xl:col-span-4"
          title="日志等级分布"
          subtitle={logLevels ? `共 ${formatNumber(logLevels.total)} 条日志` : "范围内的日志上报"}
          icon={ScrollText}
        >
          {!logLevels || logLevels.total === 0 ? (
            <ChartPlaceholder loading={loading} emptyText="所选范围内没有日志上报。" />
          ) : (
            <DistributionChart
              items={logItems}
              view="bar"
              measureLabel="条数"
              labelWidth={64}
              className="aspect-[4/3] w-full"
            />
          )}
        </ChartCard>

        <ChartCard
          className="md:col-span-3 xl:col-span-4"
          title="反馈评分分布"
          subtitle={
            ratings?.average_rating
              ? `平均 ${ratings.average_rating.toFixed(1)} 分 · ${formatNumber(ratings.unrated)} 条未评分`
              : "范围内的用户反馈"
          }
          icon={MessageSquareHeart}
        >
          {!ratings || ratings.total === 0 ? (
            <ChartPlaceholder loading={loading} emptyText="所选范围内没有用户反馈。" />
          ) : (
            <DistributionChart
              items={ratingItems}
              view="bar"
              measureLabel="条数"
              labelWidth={56}
              className="aspect-[4/3] w-full"
            />
          )}
        </ChartCard>

        <ChartCard
          className="col-span-full"
          title="活跃度日历"
          subtitle="近一年每日请求量，不随上方统计范围变化"
          icon={CalendarDays}
        >
          <ActivityCalendar points={calendar?.data ?? []} loading={loading} />
        </ChartCard>

        <ChartCard
          className="md:col-span-6 xl:col-span-7"
          title="访问热力图"
          subtitle={`${range.label}内按「星期 × 小时」折叠（按来源当地时区），用于定位用户活跃时段`}
          icon={Flame}
        >
          <RequestHeatmap cells={heatmap?.data ?? []} loading={loading} />
        </ChartCard>

        <ChartCard
          className="md:col-span-6 xl:col-span-5"
          title="接口明细"
          subtitle="按接口列出请求次数与占比"
          icon={Table2}
        >
          {endpointItems.length === 0 ? (
            <ChartPlaceholder loading={loading} />
          ) : (
            <ShareTable
              items={endpointItems}
              total={total}
              categoryHeader="接口"
              measureHeader="请求数"
            />
          )}
        </ChartCard>
      </div>
    </div>
  )
}

/** 若干接口的请求数之和；概览缺失时为 0，让环比在首次加载时也算得出来。 */
function countOf(overview: RequestStatsOverview | null, endpoints: PublicEndpoint[]): number {
  return (overview?.by_endpoint ?? [])
    .filter((item) => endpoints.includes(item.endpoint))
    .reduce((sum, item) => sum + item.count, 0)
}
