"use client"

import * as React from "react"
import { Activity, FolderKanban, KeySquare } from "lucide-react"

import { getSessionToken } from "@/lib/auth-session"
import { listApiKeys } from "@/lib/auth-api"
import {
  getActionRecordsStats,
  getActionsStats,
  getAnnouncementsStats,
  getFeedbacksStats,
  getLogsStats,
  getProjectsStats,
  getVersionsStats,
} from "@/lib/stats-api"

type StatState = {
  projects: number
  apiKeys: number
  activeApiKeys: number
  versions: number
  announcements: number
  feedbacks: number
  logs: number
  actions: number
  actionRecords: number
  loading: boolean
  error: string | null
}

export default function DashboardHomePage() {
  const [stats, setStats] = React.useState<StatState>({
    projects: 0,
    apiKeys: 0,
    activeApiKeys: 0,
    versions: 0,
    announcements: 0,
    feedbacks: 0,
    logs: 0,
    actions: 0,
    actionRecords: 0,
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

      setStats((prev) => ({ ...prev, loading: true, error: null }))

      try {
        const [
          projectsStats,
          versionsStats,
          announcementsStats,
          feedbacksStats,
          logsStats,
          actionsStats,
          actionRecordsStats,
          tokenResponse,
        ] = await Promise.all([
          getProjectsStats(token),
          getVersionsStats(token),
          getAnnouncementsStats(token),
          getFeedbacksStats(token),
          getLogsStats(token),
          getActionsStats(token),
          getActionRecordsStats(token),
          listApiKeys(),
        ])

        if (cancelled) {
          return
        }

        setStats({
          projects: projectsStats.count,
          apiKeys: tokenResponse.data.length,
          activeApiKeys: tokenResponse.data.filter((item) => item.is_active).length,
          versions: versionsStats.total_versions,
          announcements: announcementsStats.count,
          feedbacks: feedbacksStats.count,
          logs: logsStats.count,
          actions: actionsStats.count,
          actionRecords: actionRecordsStats.count,
          loading: false,
          error: null,
        })
      } catch (error) {
        if (cancelled) {
          return
        }

        setStats((prev) => ({
          ...prev,
          loading: false,
          error: error instanceof Error ? error.message : "统计数据加载失败",
        }))
      }
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [])

  return (
    <section className="space-y-6">
      <header className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur">
        <p className="text-xs tracking-[0.2em] text-cyan-200 uppercase">Overview</p>
        <h2 className="mt-2 text-2xl font-semibold">后台首页</h2>
        <p className="mt-2 text-sm text-slate-300">展示关键统计信息，并作为管理入口总览。</p>
        {stats.loading ? <p className="mt-2 text-sm text-cyan-200">统计数据加载中...</p> : null}
        {stats.error ? <p className="mt-2 text-sm text-rose-300">{stats.error}</p> : null}
      </header>

      <div className="grid gap-4 md:grid-cols-3">
        <article className="rounded-2xl border border-white/10 bg-black/20 p-5">
          <div className="flex items-center justify-between text-slate-300">
            <span>项目数</span>
            <FolderKanban className="size-4" />
          </div>
          <p className="mt-3 text-3xl font-semibold">{stats.projects}</p>
        </article>

        <article className="rounded-2xl border border-white/10 bg-black/20 p-5">
          <div className="flex items-center justify-between text-slate-300">
            <span>Token 总数</span>
            <KeySquare className="size-4" />
          </div>
          <p className="mt-3 text-3xl font-semibold">{stats.apiKeys}</p>
        </article>

        <article className="rounded-2xl border border-white/10 bg-black/20 p-5">
          <div className="flex items-center justify-between text-slate-300">
            <span>有效 Token</span>
            <Activity className="size-4" />
          </div>
          <p className="mt-3 text-3xl font-semibold">{stats.activeApiKeys}</p>
        </article>
      </div>

      <article className="rounded-3xl border border-white/10 bg-white/5 p-6">
        <h3 className="text-lg font-medium">访问趋势（实时聚合）</h3>
        <p className="mt-1 text-sm text-slate-300">基于后端统计接口实时计算，反映模块数据体量。</p>
        <div className="mt-5 grid grid-cols-7 items-end gap-2">
          {[
            { label: "版本", value: stats.versions },
            { label: "公告", value: stats.announcements },
            { label: "反馈", value: stats.feedbacks },
            { label: "日志", value: stats.logs },
            { label: "行为分类", value: stats.actions },
            { label: "行为记录", value: stats.actionRecords },
            { label: "项目", value: stats.projects },
          ].map((item) => {
            const height = Math.max(
              16,
              Math.min(160, item.value === 0 ? 16 : Math.log10(item.value + 1) * 56),
            )
            return (
              <div key={item.label} className="space-y-2">
                <div
                  className="rounded-md bg-cyan-300/70"
                  style={{ height }}
                  title={`${item.label}: ${item.value}`}
                />
                <p className="truncate text-center text-xs text-slate-300">{item.label}</p>
              </div>
            )
          })}
        </div>
      </article>
    </section>
  )
}
