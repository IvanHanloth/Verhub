import { requestJson } from "@/lib/api-client"

export type ProjectsStats = {
  count: number
}

export type VersionsStats = {
  total_versions: number
  total_projects: number
  forced_versions: number
  latest_version_time: number | null
  first_version_time: number | null
}

export type AnnouncementsStats = {
  count: number
  pinned_count: number
}

export type FeedbacksStats = {
  count: number
  rate_count: number
  rate_avg: number | null
}

export type LogsStats = {
  count: number
  debug_count: number
  info_count: number
  warning_count: number
  error_count: number
}

export type ActionsStats = {
  count: number
}

export type ActionRecordsStats = {
  count: number
}

export async function getProjectsStats(token: string): Promise<ProjectsStats> {
  return requestJson<ProjectsStats>("/admin/projects/statistics", { token })
}

export async function getVersionsStats(token: string): Promise<VersionsStats> {
  return requestJson<VersionsStats>("/admin/versions/statistics", { token })
}

export async function getAnnouncementsStats(token: string): Promise<AnnouncementsStats> {
  return requestJson<AnnouncementsStats>("/admin/announcements/statistics", { token })
}

export async function getFeedbacksStats(token: string): Promise<FeedbacksStats> {
  return requestJson<FeedbacksStats>("/admin/feedbacks/statistics", { token })
}

export async function getLogsStats(token: string): Promise<LogsStats> {
  return requestJson<LogsStats>("/admin/logs/statistics", { token })
}

export async function getActionsStats(token: string): Promise<ActionsStats> {
  return requestJson<ActionsStats>("/admin/actions/statistics", { token })
}

export async function getActionRecordsStats(token: string): Promise<ActionRecordsStats> {
  return requestJson<ActionRecordsStats>("/admin/actions/record/statistics", { token })
}
