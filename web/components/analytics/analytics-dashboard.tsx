"use client"

import * as React from "react"
import { Activity, AlertTriangle, BarChart3, Loader2, RefreshCw } from "lucide-react"
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
import { ProjectSelectorCard } from "@/components/admin/project-selector-card"
import { useSharedProjectSelection } from "@/hooks/use-shared-project-selection"
import {
  ENDPOINT_LABELS,
  PLATFORM_LABELS,
  getRequestStatsOverview,
  getRequestStatsTimeseries,
  type Granularity,
  type PublicEndpoint,
  type RequestStatsOverview,
  type RequestStatsTimeseries,
  type StatPlatform,
} from "@/lib/analytics-api"
import { listProjects, type ProjectItem } from "@/lib/projects-api"

const PROJECT_PAGE_SIZE = 100
const DAY_SECONDS = 86400

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
  const [projects, setProjects] = React.useState<ProjectItem[]>([])
  const { selectedProjectKey, setSelectedProjectKey } = useSharedProjectSelection()
  const [rangeIndex, setRangeIndex] = React.useState(1)
  const [overview, setOverview] = React.useState<RequestStatsOverview | null>(null)
  const [timeseries, setTimeseries] = React.useState<RequestStatsTimeseries | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [reloadToken, setReloadToken] = React.useState(0)

  const range = RANGE_OPTIONS[rangeIndex] ?? RANGE_OPTIONS[1]!

  React.useEffect(() => {
    const token = getSessionToken()
    if (!token) return

    let cancelled = false
    listProjects(token, { limit: PROJECT_PAGE_SIZE, offset: 0 })
      .then((response) => {
        if (cancelled) return
        setProjects(response.data)
        if (!selectedProjectKey && response.data.length > 0) {
          setSelectedProjectKey(response.data[0]!.project_key)
        }
      })
      .catch((cause: unknown) => {
        if (cancelled || isAuthError(cause)) return
        setError(getErrorMessage(cause))
      })

    return () => {
      cancelled = true
    }
  }, [selectedProjectKey, setSelectedProjectKey])

  React.useEffect(() => {
    const token = getSessionToken()
    if (!token || !selectedProjectKey) {
      setOverview(null)
      setTimeseries(null)
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
    ])
      .then(([overviewResult, timeseriesResult]) => {
        if (controller.signal.aborted) return
        setOverview(overviewResult)
        setTimeseries(timeseriesResult)
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
  const platformConfig: ChartConfig = React.useMemo(() => {
    const config: ChartConfig = { count: { label: "请求数" } }
    for (const item of platformData) {
      config[item.platform] = { label: item.label, color: item.fill }
    }
    return config
  }, [platformData])

  const selectedProject = projects.find((project) => project.project_key === selectedProjectKey)

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="统计大屏"
        description="按项目查看公开接口的请求趋势、接口构成与来源平台分布。"
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

      {/* min-w-0 on both columns: a grid item defaults to min-width:auto, and the
          charts' intrinsic width would otherwise stop the column from shrinking
          and push the whole page into horizontal scroll on narrow screens. */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-6">
          <ProjectSelectorCard
            selectId="analytics-project"
            selectedProjectKey={selectedProjectKey}
            projects={projects}
            onChange={setSelectedProjectKey}
            warning={projects.length === 0 ? "暂无项目，请先在项目管理中创建项目。" : undefined}
          />

          <AdminCard className="space-y-4">
            <h2 className="text-lg font-semibold">统计范围</h2>
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
        </div>

        <div className="min-w-0 space-y-6">
          {error ? (
            <AdminCard className="flex items-center gap-2 text-sm text-rose-500 dark:text-rose-300">
              <AlertTriangle className="size-4" />
              {error}
            </AdminCard>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-3">
            <StatTile label="总请求数" value={formatNumber(total)} hint={range.label} />
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

          <AdminCard className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold">明细数据</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">按接口列出请求次数与占比</p>
            </div>
            <EndpointTable rows={endpointData} total={total} />
          </AdminCard>
        </div>
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

function EmptyHint({ loading }: { loading: boolean }) {
  return (
    <div className="flex h-40 items-center justify-center gap-2 text-sm text-slate-500 dark:text-slate-400">
      {loading ? (
        <>
          <Loader2 className="size-4 animate-spin" />
          加载中…
        </>
      ) : (
        "所选范围内暂无请求记录。"
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
