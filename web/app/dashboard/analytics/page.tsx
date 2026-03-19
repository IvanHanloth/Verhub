"use client"

import * as React from "react"

import { getSessionToken } from "@/lib/auth-session"
import {
  getAnnouncementsStats,
  getFeedbacksStats,
  getLogsStats,
  getVersionsStats,
} from "@/lib/stats-api"

type AnalyticsState = {
  versions: number
  forcedVersions: number
  announcements: number
  pinnedAnnouncements: number
  feedbacks: number
  ratingAverage: number | null
  logsTotal: number
  logsDebug: number
  logsInfo: number
  logsWarning: number
  logsError: number
  loading: boolean
  error: string | null
}

export default function AnalyticsPage() {
  const [state, setState] = React.useState<AnalyticsState>({
    versions: 0,
    forcedVersions: 0,
    announcements: 0,
    pinnedAnnouncements: 0,
    feedbacks: 0,
    ratingAverage: null,
    logsTotal: 0,
    logsDebug: 0,
    logsInfo: 0,
    logsWarning: 0,
    logsError: 0,
    loading: false,
    error: null,
  })

  React.useEffect(() => {
    let cancelled = false

    async function load() {
      const token = getSessionToken()
      if (!token) {
        return
      }

      setState((prev) => ({ ...prev, loading: true, error: null }))

      try {
        const [versionsStats, announcementsStats, feedbacksStats, logsStats] = await Promise.all([
          getVersionsStats(token),
          getAnnouncementsStats(token),
          getFeedbacksStats(token),
          getLogsStats(token),
        ])

        if (cancelled) {
          return
        }

        setState({
          versions: versionsStats.total_versions,
          forcedVersions: versionsStats.forced_versions,
          announcements: announcementsStats.count,
          pinnedAnnouncements: announcementsStats.pinned_count,
          feedbacks: feedbacksStats.count,
          ratingAverage: feedbacksStats.rate_avg,
          logsTotal: logsStats.count,
          logsDebug: logsStats.debug_count,
          logsInfo: logsStats.info_count,
          logsWarning: logsStats.warning_count,
          logsError: logsStats.error_count,
          loading: false,
          error: null,
        })
      } catch (error) {
        if (cancelled) {
          return
        }

        setState((prev) => ({
          ...prev,
          loading: false,
          error: error instanceof Error ? error.message : "统计加载失败",
        }))
      }
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [])

  const logsBars = [
    { label: "DEBUG", value: state.logsDebug, color: "bg-sky-300/70" },
    { label: "INFO", value: state.logsInfo, color: "bg-emerald-300/70" },
    { label: "WARN", value: state.logsWarning, color: "bg-amber-300/80" },
    { label: "ERROR", value: state.logsError, color: "bg-rose-300/80" },
  ]

  const maxValue = Math.max(1, ...logsBars.map((item) => item.value))

  return (
    <section className="space-y-4">
      <header className="rounded-3xl border border-white/10 bg-white/5 p-6">
        <h2 className="text-xl font-semibold">统计分析</h2>
        <p className="mt-2 text-sm text-slate-300">
          已接入真实统计接口，数据来自后端实时聚合结果。
        </p>
        {state.loading ? <p className="mt-2 text-sm text-cyan-200">统计加载中...</p> : null}
        {state.error ? <p className="mt-2 text-sm text-rose-300">{state.error}</p> : null}
      </header>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-2xl border border-white/10 bg-black/20 p-5">
          <p className="text-sm text-slate-300">版本总数</p>
          <p className="mt-2 text-3xl font-semibold">{state.versions}</p>
          <p className="mt-1 text-xs text-slate-400">强制更新：{state.forcedVersions}</p>
        </article>
        <article className="rounded-2xl border border-white/10 bg-black/20 p-5">
          <p className="text-sm text-slate-300">公告总数</p>
          <p className="mt-2 text-3xl font-semibold">{state.announcements}</p>
          <p className="mt-1 text-xs text-slate-400">置顶公告：{state.pinnedAnnouncements}</p>
        </article>
        <article className="rounded-2xl border border-white/10 bg-black/20 p-5">
          <p className="text-sm text-slate-300">反馈总数</p>
          <p className="mt-2 text-3xl font-semibold">{state.feedbacks}</p>
          <p className="mt-1 text-xs text-slate-400">
            平均评分：{state.ratingAverage === null ? "暂无" : state.ratingAverage.toFixed(2)}
          </p>
        </article>
        <article className="rounded-2xl border border-white/10 bg-black/20 p-5">
          <p className="text-sm text-slate-300">日志总数</p>
          <p className="mt-2 text-3xl font-semibold">{state.logsTotal}</p>
          <p className="mt-1 text-xs text-slate-400">按级别分布见下方图表</p>
        </article>
      </div>

      <article className="rounded-2xl border border-white/10 bg-black/20 p-6">
        <h3 className="text-base font-medium">日志级别分布</h3>
        <div className="mt-4 grid h-72 grid-cols-4 items-end gap-3">
          {logsBars.map((item) => {
            const height = Math.max(12, Math.round((item.value / maxValue) * 220))

            return (
              <div key={item.label} className="space-y-2">
                <div
                  className={`rounded-md ${item.color}`}
                  style={{ height }}
                  title={`${item.label}: ${item.value}`}
                />
                <p className="text-center text-xs text-slate-300">{item.label}</p>
                <p className="text-center text-xs text-slate-400">{item.value}</p>
              </div>
            )
          })}
        </div>
      </article>
    </section>
  )
}
