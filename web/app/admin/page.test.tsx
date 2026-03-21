import * as React from "react"
import { render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import DashboardHomePage from "./page"

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

vi.mock("@/lib/auth-session", () => ({
  getSessionToken: vi.fn(),
}))

vi.mock("@/lib/auth-api", () => ({
  listApiKeys: vi.fn(),
}))

vi.mock("@/lib/stats-api", () => ({
  getProjectsStats: vi.fn(),
  getVersionsStats: vi.fn(),
  getAnnouncementsStats: vi.fn(),
  getFeedbacksStats: vi.fn(),
  getLogsStats: vi.fn(),
  getActionsStats: vi.fn(),
  getActionRecordsStats: vi.fn(),
}))

const mockedGetSessionToken = vi.mocked(getSessionToken)
const mockedListApiKeys = vi.mocked(listApiKeys)
const mockedGetProjectsStats = vi.mocked(getProjectsStats)
const mockedGetVersionsStats = vi.mocked(getVersionsStats)
const mockedGetAnnouncementsStats = vi.mocked(getAnnouncementsStats)
const mockedGetFeedbacksStats = vi.mocked(getFeedbacksStats)
const mockedGetLogsStats = vi.mocked(getLogsStats)
const mockedGetActionsStats = vi.mocked(getActionsStats)
const mockedGetActionRecordsStats = vi.mocked(getActionRecordsStats)

function mockStatsSuccess() {
  mockedGetProjectsStats.mockResolvedValue({ count: 0 })
  mockedGetVersionsStats.mockResolvedValue({
    total_versions: 0,
    total_projects: 0,
    forced_versions: 0,
    latest_version_time: null,
    first_version_time: null,
  })
  mockedGetAnnouncementsStats.mockResolvedValue({ count: 0, pinned_count: 0 })
  mockedGetFeedbacksStats.mockResolvedValue({ count: 0, rate_count: 0, rate_avg: null })
  mockedGetLogsStats.mockResolvedValue({
    count: 0,
    debug_count: 0,
    info_count: 0,
    warning_count: 0,
    error_count: 0,
  })
  mockedGetActionsStats.mockResolvedValue({ count: 0 })
  mockedGetActionRecordsStats.mockResolvedValue({ count: 0 })
  mockedListApiKeys.mockResolvedValue({ data: [] })
}

describe("admin dashboard page", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedGetSessionToken.mockReturnValue("valid-token")
    mockStatsSuccess()
  })

  it("shows loading state before stats resolve", async () => {
    let resolveProjects: ((value: { count: number }) => void) | undefined
    mockedGetProjectsStats.mockReturnValue(
      new Promise((resolve) => {
        resolveProjects = resolve
      }),
    )

    render(React.createElement(DashboardHomePage))

    expect(await screen.findByText("统计数据加载中...")).toBeInTheDocument()

    resolveProjects?.({ count: 1 })
  })

  it("shows empty-state value when rating average is null", async () => {
    render(React.createElement(DashboardHomePage))

    expect(await screen.findByText("反馈平均分")).toBeInTheDocument()
    expect(screen.getByText("暂无")).toBeInTheDocument()
  })

  it("shows partial failure warning when one stats request fails", async () => {
    mockedGetProjectsStats.mockRejectedValueOnce(new Error("stats down"))

    render(React.createElement(DashboardHomePage))

    await waitFor(() => {
      expect(screen.getByText("部分统计加载失败：项目统计")).toBeInTheDocument()
    })
  })
})
