"use client"

import * as React from "react"
import {
  Activity,
  AlertTriangle,
  BarChart3,
  CalendarDays,
  Flame,
  Layers,
  Loader2,
  RefreshCw,
} from "lucide-react"
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from "recharts"

import { Button } from "@workspace/ui/components/button"
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@workspace/ui/components/chart"

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
  getRequestStatsHeatmap,
  getRequestStatsOverview,
  getRequestStatsTimeseries,
  type ClientVersionStats,
  type Granularity,
  type PublicEndpoint,
  type RequestStatsHeatmap,
  type RequestStatsOverview,
  type RequestStatsTimeseries,
  type StatPlatform,
} from "@/lib/analytics-api"

import { ActivityCalendar } from "./activity-calendar"
import { RequestHeatmap } from "./request-heatmap"

const DAY_SECONDS = 86400

/** Rows in the version chart; everything past this is folded into 其他. */
const VERSION_CHART_LIMIT = 12

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

/**
 * Categorical slots, assigned in fixed order and never cycled. Platform count is
 * bounded at 6 by the backend enum, so the 8-slot palette always suffices.
 */
const PLATFORM_COLORS: Record<StatPlatform, string> = {
  IOS: "var(--series-1)",
  ANDROID: "var(--series-2)",
  WINDOWS: "var(--series-3)",
  MAC: "var(--series-5)",
  WEB: "var(--series-6)",
  UNKNOWN: "var(--series-8)",
}

function formatBucket(bucket: number, granularity: Granularity): string {
  const date = new Date(bucket * 1000)
  if (granularity === "hour") {
    return `${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(
      2,
      "0",
    )} ${String(date.getHours()).padStart(2, "0")}:00`
  }
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`
}

function formatNumber(value: number): string {
  return value.toLocaleString("zh-CN")
}

function percent(value: number, total: number): string {
  if (total <= 0) return "0%"
  return `${((value / total) * 100).toFixed(1)}%`
}

export function AnalyticsDashboard() {
  const { selectedProject, selectedProjectKey, error: projectsError } = useAdminProjects()
  const [rangeIndex, setRangeIndex] = React.useState(1)
  const [overview, setOverview] = React.useState<RequestStatsOverview | null>(null)
  const [timeseries, setTimeseries] = React.useState<RequestStatsTimeseries | null>(null)
  const [clientVersions, setClientVersions] = React.useState<ClientVersionStats | null>(null)
  const [heatmap, setHeatmap] = React.useState<RequestStatsHeatmap | null>(null)
  const [calendar, setCalendar] = React.useState<RequestStatsTimeseries | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [reloadToken, setReloadToken] = React.useState(0)

  const range = RANGE_OPTIONS[rangeIndex] ?? RANGE_OPTIONS[1]!

  React.useEffect(() => {
    const token = getSessionToken()
    if (!token || !selectedProjectKey) {
      setOverview(null)
      setTimeseries(null)
      setClientVersions(null)
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
      getRequestStatsTimeseries(
        token,
        selectedProjectKey,
        { startTime, endTime },
        range.granularity,
        undefined,
        controller.signal,
      ),
      getClientVersionStats(
        token,
        selectedProjectKey,
        { startTime, endTime },
        VERSION_CHART_LIMIT,
        controller.signal,
      ),
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
      .then(([overviewResult, timeseriesResult, versionsResult, heatmapResult, calendarResult]) => {
        if (controller.signal.aborted) return
        setOverview(overviewResult)
        setTimeseries(timeseriesResult)
        setClientVersions(versionsResult)
        setHeatmap(heatmapResult)
        setCalendar(calendarResult)
      })
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

  const total = overview?.total ?? 0

  const endpointData = React.useMemo(
    () =>
      (overview?.by_endpoint ?? []).map((item) => ({
        endpoint: item.endpoint,
        label: ENDPOINT_LABELS[item.endpoint] ?? item.endpoint,
        count: item.count,
      })),
    [overview],
  )

  const platformData = React.useMemo(
    () =>
      (overview?.by_platform ?? []).map((item) => ({
        platform: item.platform,
        label: PLATFORM_LABELS[item.platform] ?? item.platform,
        count: item.count,
        fill: PLATFORM_COLORS[item.platform] ?? "var(--series-8)",
      })),
    [overview],
  )

  const seriesData = React.useMemo(
    () =>
      (timeseries?.data ?? []).map((point) => ({
        bucket: point.bucket,
        label: formatBucket(point.bucket, timeseries?.granularity ?? "hour"),
        count: point.count,
      })),
    [timeseries],
  )

  const versionTotal = clientVersions?.total ?? 0
  const versionData = React.useMemo(
    () =>
      (clientVersions?.data ?? []).map((item) => ({
        version: item.version,
        count: item.count,
        share: versionTotal > 0 ? item.count / versionTotal : 0,
      })),
    [clientVersions, versionTotal],
  )

  // The API caps the rows it returns; the remainder is still part of the total,
  // so show it explicitly rather than letting the shares silently not add up.
  const versionTailCount = versionTotal - versionData.reduce((sum, item) => sum + item.count, 0)
  const topVersion = versionData[0] ?? null

  const checkUpdateCount =
    overview?.by_endpoint.find((item) => item.endpoint === "VERSION_CHECK_UPDATE")?.count ?? 0
  const announcementCount = (overview?.by_endpoint ?? [])
    .filter(
      (item) => item.endpoint === "ANNOUNCEMENT_LIST" || item.endpoint === "ANNOUNCEMENT_LATEST",
    )
    .reduce((sum, item) => sum + item.count, 0)
  const peak = seriesData.reduce((max, point) => Math.max(max, point.count), 0)

  // A single measure across categories: identity comes from the axis labels, so
  // one color rather than a redundant hue per bar.
  const endpointConfig: ChartConfig = { count: { label: "请求数", color: "var(--series-1)" } }
  const trendConfig: ChartConfig = { count: { label: "请求数", color: "var(--series-1)" } }
  const versionConfig: ChartConfig = { count: { label: "上报数", color: "var(--series-2)" } }
  const platformConfig: ChartConfig = React.useMemo(() => {
    const config: ChartConfig = { count: { label: "请求数" } }
    for (const item of platformData) {
      config[item.platform] = { label: item.label, color: item.fill }
    }
    return config
  }, [platformData])

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="统计大屏"
        description="按项目查看请求趋势、客户端版本分布、接口构成与访问活跃度。"
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

      {/* 筛选条整行置于页头下方，作用于下方所有图表（活跃度日历除外，它固定看一年）。 */}
      <AdminCard className="flex flex-wrap items-center gap-x-4 gap-y-3">
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
        <p className="text-xs text-slate-500 dark:text-slate-400">
          统计按小时聚合，{range.granularity === "hour" ? "按小时展示" : "按天汇总展示"}。
          数据保留时长可在项目管理中调整。
        </p>
      </AdminCard>

      {/* min-w-0: 图表的固有宽度否则会撑破容器，让窄屏出现横向滚动。 */}
      <div className="min-w-0 space-y-6">
        {error || projectsError ? (
          <AdminCard className="flex items-center gap-2 text-sm text-rose-500 dark:text-rose-300">
            <AlertTriangle className="size-4" />
            {error ?? projectsError}
          </AdminCard>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatTile label="总请求数" value={formatNumber(total)} hint={range.label} />
          <StatTile
            label="主流版本"
            value={topVersion?.version ?? "—"}
            hint={
              topVersion
                ? `占上报客户端 ${(topVersion.share * 100).toFixed(1)}%`
                : "暂无客户端上报版本"
            }
          />
          <StatTile
            label="检查更新"
            value={formatNumber(checkUpdateCount)}
            hint={percent(checkUpdateCount, total)}
          />
          <StatTile
            label="公告获取"
            value={formatNumber(announcementCount)}
            hint={percent(announcementCount, total)}
          />
        </div>

        <AdminCard className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">请求趋势</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {selectedProject?.name ?? "未选择项目"} · 峰值 {formatNumber(peak)}
              </p>
            </div>
            <Activity className="size-4 text-slate-400" />
          </div>

          {seriesData.length === 0 ? (
            <EmptyHint loading={loading} />
          ) : (
            <ChartContainer config={trendConfig} className="aspect-[16/6] w-full">
              <LineChart data={seriesData} margin={{ left: 4, right: 12, top: 8, bottom: 4 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  minTickGap={32}
                />
                <YAxis tickLine={false} axisLine={false} width={40} allowDecimals={false} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Line
                  dataKey="count"
                  type="monotone"
                  stroke="var(--color-count)"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              </LineChart>
            </ChartContainer>
          )}
        </AdminCard>

        {/* 客户端版本分布：图表与明细并排，左看形态、右看具体占比。 */}
        <div className="grid min-w-0 gap-6 xl:grid-cols-2">
          <AdminCard className="min-w-0 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">客户端版本分布</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  来自 check-update 上报的 current_version · 共 {formatNumber(versionTotal)} 次上报
                </p>
              </div>
              <Layers className="size-4 text-slate-400" />
            </div>

            {versionData.length === 0 ? (
              <EmptyHint loading={loading} emptyText="所选范围内没有客户端上报版本。" />
            ) : (
              <ChartContainer config={versionConfig} className="aspect-[4/3] w-full">
                <BarChart
                  data={versionData}
                  layout="vertical"
                  margin={{ left: 8, right: 40, top: 4, bottom: 4 }}
                >
                  <CartesianGrid horizontal={false} strokeDasharray="3 3" />
                  <XAxis type="number" dataKey="count" hide allowDecimals={false} />
                  {/* Identity lives on the axis here, so every tick must render. */}
                  <YAxis
                    type="category"
                    dataKey="version"
                    tickLine={false}
                    axisLine={false}
                    width={92}
                    interval={0}
                  />
                  <ChartTooltip content={<ChartTooltipContent hideLabel />} />
                  <Bar dataKey="count" fill="var(--color-count)" radius={4} barSize={14} />
                </BarChart>
              </ChartContainer>
            )}
          </AdminCard>

          <AdminCard className="min-w-0 space-y-4">
            <div>
              <h2 className="text-lg font-semibold">版本占比明细</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                按上报数降序，占比以全部上报为分母
              </p>
            </div>

            {versionData.length === 0 ? (
              <EmptyHint loading={loading} emptyText="所选范围内没有客户端上报版本。" />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs text-slate-500 dark:text-slate-400">
                    <tr className="border-b border-slate-900/10 dark:border-white/10">
                      <th className="py-2 text-left font-medium">版本</th>
                      <th className="py-2 text-right font-medium">上报数</th>
                      <th className="py-2 text-right font-medium">占比</th>
                    </tr>
                  </thead>
                  <tbody>
                    {versionData.map((item) => (
                      <tr
                        key={item.version}
                        className="border-b border-slate-900/5 last:border-0 dark:border-white/5"
                      >
                        <td className="py-2 font-mono text-xs">{item.version}</td>
                        <td className="py-2 text-right tabular-nums">{formatNumber(item.count)}</td>
                        <td className="py-2 text-right tabular-nums">
                          {(item.share * 100).toFixed(1)}%
                        </td>
                      </tr>
                    ))}
                    {versionTailCount > 0 ? (
                      <tr className="text-slate-500 dark:text-slate-400">
                        <td className="py-2 text-xs">其他版本</td>
                        <td className="py-2 text-right tabular-nums">
                          {formatNumber(versionTailCount)}
                        </td>
                        <td className="py-2 text-right tabular-nums">
                          {percent(versionTailCount, versionTotal)}
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            )}
          </AdminCard>
        </div>

        <div className="grid min-w-0 gap-6 xl:grid-cols-2">
          <AdminCard className="min-w-0 space-y-4">
            <div>
              <h2 className="text-lg font-semibold">接口构成</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">各公开接口请求次数</p>
            </div>

            {endpointData.length === 0 ? (
              <EmptyHint loading={loading} />
            ) : (
              <ChartContainer config={endpointConfig} className="aspect-[4/3] w-full">
                <BarChart
                  data={endpointData}
                  layout="vertical"
                  margin={{ left: 8, right: 40, top: 4, bottom: 4 }}
                >
                  <CartesianGrid horizontal={false} strokeDasharray="3 3" />
                  <XAxis type="number" dataKey="count" hide allowDecimals={false} />
                  {/* interval={0} forces every category label: this chart carries
                        identity on the axis, so a skipped tick is an unlabeled bar. */}
                  <YAxis
                    type="category"
                    dataKey="label"
                    tickLine={false}
                    axisLine={false}
                    width={92}
                    interval={0}
                  />
                  <ChartTooltip content={<ChartTooltipContent hideLabel />} />
                  <Bar dataKey="count" fill="var(--color-count)" radius={4} barSize={14} />
                </BarChart>
              </ChartContainer>
            )}
          </AdminCard>

          <AdminCard className="min-w-0 space-y-4">
            <div>
              <h2 className="text-lg font-semibold">来源平台</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                由 SDK 声明或 User-Agent 推断
              </p>
            </div>

            {platformData.length === 0 ? (
              <EmptyHint loading={loading} />
            ) : (
              <ChartContainer
                config={platformConfig}
                className="aspect-square max-h-[280px] w-full"
              >
                <PieChart>
                  <ChartTooltip content={<ChartTooltipContent nameKey="platform" hideLabel />} />
                  {/* isAnimationActive={false} is required, not cosmetic: with
                        recharts 3.9 on React 19 the Pie entry animation renders no
                        sectors at all, leaving an invisible chart with only a legend. */}
                  <Pie
                    data={platformData}
                    dataKey="count"
                    nameKey="platform"
                    innerRadius={48}
                    outerRadius={96}
                    strokeWidth={2}
                    isAnimationActive={false}
                  />
                  <ChartLegend content={<ChartLegendContent nameKey="platform" />} />
                </PieChart>
              </ChartContainer>
            )}
          </AdminCard>
        </div>

        <AdminCard className="min-w-0 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">活跃度日历</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                近一年每日请求量，不随上方统计范围变化
              </p>
            </div>
            <CalendarDays className="size-4 text-slate-400" />
          </div>
          <ActivityCalendar points={calendar?.data ?? []} loading={loading} />
        </AdminCard>

        <AdminCard className="min-w-0 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">访问热力图</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {range.label}内按「星期 × 小时」折叠的请求量，用于定位高峰时段
              </p>
            </div>
            <Flame className="size-4 text-slate-400" />
          </div>
          <RequestHeatmap cells={heatmap?.data ?? []} loading={loading} />
        </AdminCard>

        <AdminCard className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold">明细数据</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">按接口列出请求次数与占比</p>
          </div>
          <EndpointTable rows={endpointData} total={total} />
        </AdminCard>
      </div>
    </div>
  )
}

function StatTile({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <AdminCard className="space-y-1">
      <p className="text-xs tracking-wide text-slate-500 uppercase dark:text-slate-400">{label}</p>
      <p className="font-mono text-2xl font-semibold tabular-nums">{value}</p>
      <p className="text-xs text-slate-500 dark:text-slate-400">{hint}</p>
    </AdminCard>
  )
}

function EmptyHint({ loading, emptyText }: { loading: boolean; emptyText?: string }) {
  return (
    <div className="flex h-40 items-center justify-center gap-2 text-sm text-slate-500 dark:text-slate-400">
      {loading ? (
        <>
          <Loader2 className="size-4 animate-spin" />
          加载中…
        </>
      ) : (
        (emptyText ?? "所选范围内暂无请求记录。")
      )}
    </div>
  )
}

/**
 * The table view is the relief for the palette's sub-3:1 contrast slots: every
 * value is readable as text, not by color alone.
 */
function EndpointTable({
  rows,
  total,
}: {
  rows: { endpoint: PublicEndpoint; label: string; count: number }[]
  total: number
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-slate-500 dark:text-slate-400">暂无数据。</p>
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[360px] text-sm">
        <thead>
          <tr className="text-left text-xs text-slate-500 uppercase dark:text-slate-400">
            <th className="pb-2 font-medium">接口</th>
            <th className="pb-2 text-right font-medium">请求数</th>
            <th className="pb-2 text-right font-medium">占比</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.endpoint} className="border-t border-slate-900/10 dark:border-white/10">
              <td className="py-2">{row.label}</td>
              <td className="py-2 text-right font-mono tabular-nums">{formatNumber(row.count)}</td>
              <td className="py-2 text-right text-slate-500 dark:text-slate-400">
                {percent(row.count, total)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
