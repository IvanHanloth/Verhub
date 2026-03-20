"use client"

import * as React from "react"
import { Activity, FolderKanban, KeySquare } from "lucide-react"

import { AdminCard } from "@/components/admin/admin-card"
import { useDashboardStats } from "@/components/admin/use-dashboard-stats"

const BAR_HEIGHT_CLASSES = [
  "h-4",
  "h-6",
  "h-8",
  "h-10",
  "h-12",
  "h-14",
  "h-16",
  "h-20",
  "h-24",
  "h-28",
  "h-32",
  "h-36",
  "h-40",
] as const

const DEFAULT_BAR_HEIGHT_CLASS = "h-4"

function resolveBarHeightClass(value: number): string {
  if (value <= 0) {
    return DEFAULT_BAR_HEIGHT_CLASS
  }

  const scaled = Math.log10(value + 1) * 3.5
  const index = Math.min(BAR_HEIGHT_CLASSES.length - 1, Math.max(0, Math.floor(scaled)))
  return BAR_HEIGHT_CLASSES[index] ?? DEFAULT_BAR_HEIGHT_CLASS
}

function resolveRelativeBarHeightClass(value: number, max: number): string {
  if (value <= 0 || max <= 0) {
    return DEFAULT_BAR_HEIGHT_CLASS
  }

  const ratio = value / max
  const index = Math.min(
    BAR_HEIGHT_CLASSES.length - 1,
    Math.max(0, Math.round(ratio * (BAR_HEIGHT_CLASSES.length - 1))),
  )
  return BAR_HEIGHT_CLASSES[index] ?? DEFAULT_BAR_HEIGHT_CLASS
}

export default function DashboardHomePage() {
  const stats = useDashboardStats()

  return (
    <section className="space-y-6">
      <AdminCard as="header" className="p-6">
        <p className="text-xs tracking-[0.2em] text-cyan-200 uppercase">Overview</p>
        <h2 className="mt-2 text-2xl font-semibold">后台首页</h2>
        <p className="mt-2 text-sm text-slate-700 dark:text-slate-300">
          展示关键统计信息，并作为管理入口总览。
        </p>
        {stats.loading ? <p className="mt-2 text-sm text-cyan-200">统计数据加载中...</p> : null}
        {stats.error ? <p className="mt-2 text-sm text-rose-300">{stats.error}</p> : null}
      </AdminCard>

      <div className="grid gap-4 md:grid-cols-3">
        <AdminCard>
          <div className="flex items-center justify-between text-slate-700 dark:text-slate-300">
            <span>项目数</span>
            <FolderKanban className="size-4" />
          </div>
          <p className="mt-3 text-3xl font-semibold">{stats.projects}</p>
        </AdminCard>

        <AdminCard>
          <div className="flex items-center justify-between text-slate-700 dark:text-slate-300">
            <span>Token 总数</span>
            <KeySquare className="size-4" />
          </div>
          <p className="mt-3 text-3xl font-semibold">{stats.apiKeys}</p>
        </AdminCard>

        <AdminCard>
          <div className="flex items-center justify-between text-slate-700 dark:text-slate-300">
            <span>有效 Token</span>
            <Activity className="size-4" />
          </div>
          <p className="mt-3 text-3xl font-semibold">{stats.activeApiKeys}</p>
        </AdminCard>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <AdminCard>
          <p className="text-sm text-slate-700 dark:text-slate-300">强制更新版本</p>
          <p className="mt-2 text-3xl font-semibold">{stats.forcedVersions}</p>
        </AdminCard>
        <AdminCard>
          <p className="text-sm text-slate-700 dark:text-slate-300">置顶公告</p>
          <p className="mt-2 text-3xl font-semibold">{stats.pinnedAnnouncements}</p>
        </AdminCard>
        <AdminCard>
          <p className="text-sm text-slate-700 dark:text-slate-300">反馈总数</p>
          <p className="mt-2 text-3xl font-semibold">{stats.feedbacks}</p>
        </AdminCard>
        <AdminCard>
          <p className="text-sm text-slate-700 dark:text-slate-300">反馈平均分</p>
          <p className="mt-2 text-3xl font-semibold">
            {stats.feedbackRatingAvg === null ? "暂无" : stats.feedbackRatingAvg.toFixed(2)}
          </p>
        </AdminCard>
      </div>

      <AdminCard as="article" className="p-6">
        <h3 className="text-lg font-medium">访问趋势（实时聚合）</h3>
        <p className="mt-1 text-sm text-slate-700 dark:text-slate-300">
          基于后端统计接口实时计算，反映模块数据体量。
        </p>
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
            const heightClass = resolveBarHeightClass(item.value)
            return (
              <div key={item.label} className="space-y-2">
                <div
                  className={`rounded-md bg-cyan-300/70 ${heightClass}`}
                  title={`${item.label}: ${item.value}`}
                />
                <p className="truncate text-center text-xs text-slate-700 dark:text-slate-300">
                  {item.label}
                </p>
              </div>
            )
          })}
        </div>
      </AdminCard>

      <AdminCard as="article" className="p-6">
        <h3 className="text-lg font-medium">日志级别分布</h3>
        <p className="mt-1 text-sm text-slate-700 dark:text-slate-300">
          首页与统计图表已合并，保留关键图形洞察。
        </p>
        <div className="mt-5 grid h-64 grid-cols-4 items-end gap-3">
          {[
            { label: "DEBUG", value: stats.logsDebug, color: "bg-sky-300/70" },
            { label: "INFO", value: stats.logsInfo, color: "bg-emerald-300/70" },
            { label: "WARN", value: stats.logsWarning, color: "bg-amber-300/80" },
            { label: "ERROR", value: stats.logsError, color: "bg-rose-300/80" },
          ].map((item) => {
            const max = Math.max(
              stats.logsDebug,
              stats.logsInfo,
              stats.logsWarning,
              stats.logsError,
              1,
            )
            const heightClass = resolveRelativeBarHeightClass(item.value, max)

            return (
              <div key={item.label} className="space-y-2">
                <div
                  className={`rounded-md ${item.color} ${heightClass}`}
                  title={`${item.label}: ${item.value}`}
                />
                <p className="text-center text-xs text-slate-700 dark:text-slate-300">
                  {item.label}
                </p>
                <p className="text-center text-xs text-slate-500 dark:text-slate-400">
                  {item.value}
                </p>
              </div>
            )
          })}
        </div>
      </AdminCard>
    </section>
  )
}
