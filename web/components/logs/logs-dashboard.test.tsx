import * as React from "react"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { listLogs, updateLogVisibility } from "@/lib/logs-api"
import { listProjects } from "@/lib/projects-api"

import { LogsDashboard } from "./logs-dashboard"

vi.mock("@/lib/projects-api", () => ({
  loginAdmin: vi.fn(),
  listProjects: vi.fn(),
}))

vi.mock("@/lib/logs-api", () => ({
  listLogs: vi.fn(),
  createLog: vi.fn(),
  updateLogVisibility: vi.fn(),
}))

const mockedListProjects = vi.mocked(listProjects)
const mockedListLogs = vi.mocked(listLogs)
const mockedUpdateLogVisibility = vi.mocked(updateLogVisibility)

describe("LogsDashboard", () => {
  beforeEach(() => {
    window.localStorage.clear()
    window.localStorage.setItem("verhub-admin-token", "valid-token")

    mockedListProjects.mockReset()
    mockedListLogs.mockReset()
    mockedUpdateLogVisibility.mockReset()

    mockedListProjects.mockResolvedValue({
      total: 1,
      data: [
        {
          id: "project-1",
          project_key: "verhub",
          name: "Verhub",
          repo_url: null,
          description: null,
          author: null,
          author_homepage_url: null,
          icon_url: null,
          website_url: null,
          docs_url: null,
          published_at: null,
          created_at: Math.floor(Date.parse("2026-01-01T00:00:00.000Z") / 1000),
          updated_at: Math.floor(Date.parse("2026-01-01T00:00:00.000Z") / 1000),
        },
      ],
    })

    mockedListLogs.mockResolvedValue({ total: 0, data: [] })
  })

  it("applies filters and requests logs with converted query params", async () => {
    const user = userEvent.setup()
    render(React.createElement(LogsDashboard))

    expect(await screen.findByText("当前筛选条件下暂无日志。")).toBeInTheDocument()

    // 筛选即时生效，不再有「应用筛选」按钮：每个控件改完就重新拉一次列表。
    await user.selectOptions(screen.getByLabelText("级别"), "3")
    await user.selectOptions(screen.getByLabelText("平台"), "windows")
    await user.type(screen.getByLabelText("开始时间"), "2026-03-19T10:00")
    await user.type(screen.getByLabelText("结束时间"), "2026-03-19T11:00")

    await waitFor(() => {
      expect(mockedListLogs).toHaveBeenLastCalledWith(
        "valid-token",
        "verhub",
        {
          limit: 10,
          offset: 0,
          level: 3,
          platform: "windows",
          search: undefined,
          include_hidden: undefined,
          start_time: Math.floor(Date.parse("2026-03-19T10:00") / 1000),
          end_time: Math.floor(Date.parse("2026-03-19T11:00") / 1000),
        },
        expect.any(AbortSignal),
      )
    })
  })

  /** 隐藏是这一页新加的能力；开关必须真的把 include_hidden 带进请求。 */
  it("passes include_hidden when the hidden toggle is on", async () => {
    const user = userEvent.setup()
    render(React.createElement(LogsDashboard))

    expect(await screen.findByText("当前筛选条件下暂无日志。")).toBeInTheDocument()

    await user.click(screen.getByLabelText("显示已隐藏"))

    await waitFor(() => {
      expect(mockedListLogs).toHaveBeenLastCalledWith(
        "valid-token",
        "verhub",
        expect.objectContaining({ include_hidden: true }),
        expect.any(AbortSignal),
      )
    })
  })

  it("hides a log row and reloads the list", async () => {
    const user = userEvent.setup()
    mockedListLogs.mockResolvedValue({
      total: 1,
      data: [
        {
          id: "log-1",
          level: 3,
          content: "连接超时",
          device_info: null,
          custom_data: null,
          is_hidden: false,
          ip: "203.0.113.9",
          user_agent: null,
          country_code: null,
          country_name: null,
          region_name: null,
          city: null,
          platform: null,
          platform_version: null,
          created_at: Math.floor(Date.parse("2026-03-19T10:00:00.000Z") / 1000),
        },
      ],
    })
    mockedUpdateLogVisibility.mockResolvedValue({} as never)

    render(React.createElement(LogsDashboard))

    await user.click(await screen.findByRole("button", { name: "隐藏" }))

    await waitFor(() => {
      expect(mockedUpdateLogVisibility).toHaveBeenCalledWith("valid-token", "verhub", "log-1", true)
    })
  })
})
