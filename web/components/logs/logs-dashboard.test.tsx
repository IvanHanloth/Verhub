import * as React from "react"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { listLogs } from "@/lib/logs-api"
import { listProjects } from "@/lib/projects-api"

import { LogsDashboard } from "./logs-dashboard"

vi.mock("@/lib/projects-api", () => ({
  loginAdmin: vi.fn(),
  listProjects: vi.fn(),
}))

vi.mock("@/lib/logs-api", () => ({
  listLogs: vi.fn(),
}))

const mockedListProjects = vi.mocked(listProjects)
const mockedListLogs = vi.mocked(listLogs)

describe("LogsDashboard", () => {
  beforeEach(() => {
    window.localStorage.clear()
    window.localStorage.setItem("verhub-admin-token", "valid-token")

    mockedListProjects.mockReset()
    mockedListLogs.mockReset()

    mockedListProjects.mockResolvedValue({
      total: 1,
      data: [
        {
          id: "project-1",
          project_key: "verhub",
          name: "Verhub",
          repo_url: null,
          description: null,
          created_at: "2026-01-01T00:00:00.000Z",
          updated_at: "2026-01-01T00:00:00.000Z",
        },
      ],
    })

    mockedListLogs.mockResolvedValue({ total: 0, data: [] })
  })

  it("applies filters and requests logs with converted query params", async () => {
    const user = userEvent.setup()
    render(React.createElement(LogsDashboard))

    expect(await screen.findByText("当前筛选条件下暂无日志。")).toBeInTheDocument()

    await user.selectOptions(screen.getByLabelText("日志级别"), "3")
    await user.type(screen.getByLabelText("开始时间"), "2026-03-19T10:00")
    await user.type(screen.getByLabelText("结束时间"), "2026-03-19T11:00")
    await user.click(screen.getByRole("button", { name: "应用筛选" }))

    await waitFor(() => {
      expect(mockedListLogs).toHaveBeenLastCalledWith(
        "valid-token",
        "project-1",
        {
          limit: 10,
          offset: 0,
          level: 3,
          start_time: Date.parse("2026-03-19T10:00"),
          end_time: Date.parse("2026-03-19T11:00"),
        },
        expect.any(AbortSignal),
      )
    })
  })
})
