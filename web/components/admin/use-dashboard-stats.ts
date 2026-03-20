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
          forcedVersions: versionsStats.forced_versions,
          announcements: announcementsStats.count,
          pinnedAnnouncements: announcementsStats.pinned_count,
          feedbacks: feedbacksStats.count,
          feedbackRatingAvg: feedbacksStats.rate_avg,
          logs: logsStats.count,
          logsDebug: logsStats.debug_count,
          logsInfo: logsStats.info_count,
          logsWarning: logsStats.warning_count,
          logsError: logsStats.error_count,
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

  return stats
}
