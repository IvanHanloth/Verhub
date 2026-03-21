import * as React from "react"

import { listApiKeys } from "@/lib/auth-api"
import { getSessionToken } from "@/lib/auth-session"
import {
  getActionRecordsStats,
  getActionsStats,
  getAnnouncementsStats,
  getFeedbacksStats,
  getLogsStats,
  getProjectsStats,
  getVersionsStats,
} from "@/lib/stats-api"

export type DashboardStatsState = {
  projects: number
  apiKeys: number
  activeApiKeys: number
  versions: number
  forcedVersions: number
  announcements: number
  pinnedAnnouncements: number
  feedbacks: number
  feedbackRatingAvg: number | null
  logs: number
  logsDebug: number
  logsInfo: number
  logsWarning: number
  logsError: number
  actions: number
  actionRecords: number
  loading: boolean
  error: string | null
}

const initialState: DashboardStatsState = {
  projects: 0,
  apiKeys: 0,
  activeApiKeys: 0,
  versions: 0,
  forcedVersions: 0,
  announcements: 0,
  pinnedAnnouncements: 0,
  feedbacks: 0,
  feedbackRatingAvg: null,
  logs: 0,
  logsDebug: 0,
  logsInfo: 0,
  logsWarning: 0,
  logsError: 0,
  actions: 0,
  actionRecords: 0,
  loading: false,
  error: null,
}

export function useDashboardStats(): DashboardStatsState {
  const [stats, setStats] = React.useState<DashboardStatsState>(initialState)

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
          projectsStatsResult,
          versionsStatsResult,
          announcementsStatsResult,
          feedbacksStatsResult,
          logsStatsResult,
          actionsStatsResult,
          actionRecordsStatsResult,
          tokenResponseResult,
        ] = await Promise.allSettled([
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

        const failedModules: string[] = []

        const projects =
          projectsStatsResult.status === "fulfilled"
            ? projectsStatsResult.value.count
            : (failedModules.push("项目统计"), 0)

        const versions =
          versionsStatsResult.status === "fulfilled"
            ? versionsStatsResult.value
            : (failedModules.push("版本统计"),
              {
                total_versions: 0,
                forced_versions: 0,
              })

        const announcements =
          announcementsStatsResult.status === "fulfilled"
            ? announcementsStatsResult.value
            : (failedModules.push("公告统计"),
              {
                count: 0,
                pinned_count: 0,
              })

        const feedbacks =
          feedbacksStatsResult.status === "fulfilled"
            ? feedbacksStatsResult.value
            : (failedModules.push("反馈统计"),
              {
                count: 0,
                rate_avg: null,
              })

        const logs =
          logsStatsResult.status === "fulfilled"
            ? logsStatsResult.value
            : (failedModules.push("日志统计"),
              {
                count: 0,
                debug_count: 0,
                info_count: 0,
                warning_count: 0,
                error_count: 0,
              })

        const actions =
          actionsStatsResult.status === "fulfilled"
            ? actionsStatsResult.value.count
            : (failedModules.push("行为分类统计"), 0)

        const actionRecords =
          actionRecordsStatsResult.status === "fulfilled"
            ? actionRecordsStatsResult.value.count
            : (failedModules.push("行为记录统计"), 0)

        const tokenResponse =
          tokenResponseResult.status === "fulfilled"
            ? tokenResponseResult.value
            : (failedModules.push("令牌统计"), { data: [] })

        setStats({
          projects,
          apiKeys: tokenResponse.data.length,
          activeApiKeys: tokenResponse.data.filter((item) => item.is_active).length,
          versions: versions.total_versions,
          forcedVersions: versions.forced_versions,
          announcements: announcements.count,
          pinnedAnnouncements: announcements.pinned_count,
          feedbacks: feedbacks.count,
          feedbackRatingAvg: feedbacks.rate_avg,
          logs: logs.count,
          logsDebug: logs.debug_count,
          logsInfo: logs.info_count,
          logsWarning: logs.warning_count,
          logsError: logs.error_count,
          actions,
          actionRecords,
          loading: false,
          error: failedModules.length > 0 ? `部分统计加载失败：${failedModules.join("、")}` : null,
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

  return stats
}
