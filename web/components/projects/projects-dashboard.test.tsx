import * as React from "react"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { ApiError } from "@/lib/api-client"
import { loginAdmin, listProjects } from "@/lib/projects-api"

import { ProjectsDashboard } from "./projects-dashboard"

vi.mock("@/lib/projects-api", () => ({
  loginAdmin: vi.fn(),
  listProjects: vi.fn(),
  createProject: vi.fn(),
  updateProject: vi.fn(),
  deleteProject: vi.fn(),
}))

const mockedLoginAdmin = vi.mocked(loginAdmin)
const mockedListProjects = vi.mocked(listProjects)

describe("ProjectsDashboard", () => {
  beforeEach(() => {
    window.localStorage.clear()
    mockedLoginAdmin.mockReset()
    mockedListProjects.mockReset()
  })

  it("shows empty state after loading projects", async () => {
    window.localStorage.setItem("verhub-admin-token", "valid-token")
    mockedListProjects.mockResolvedValue({ total: 0, data: [] })

    render(React.createElement(ProjectsDashboard))

    expect(await screen.findByText("暂无项目，使用上方表单创建第一条项目记录。")).toBeInTheDocument()
    expect(mockedListProjects).toHaveBeenCalledWith("valid-token", { limit: 10, offset: 0 }, expect.any(AbortSignal))
  })

  it("clears token and asks re-login when backend returns 401", async () => {
    window.localStorage.setItem("verhub-admin-token", "expired-token")
    mockedListProjects.mockRejectedValue(new ApiError("Invalid bearer token", 401))

    render(React.createElement(ProjectsDashboard))

    expect(await screen.findByText("登录状态已过期，请重新登录。")).toBeInTheDocument()
    expect(window.localStorage.getItem("verhub-admin-token")).toBeNull()
  })

  it("stores token after successful login form submit", async () => {
    mockedLoginAdmin.mockResolvedValue({
      access_token: "fresh-token",
      expires_in: 7200,
    })
    mockedListProjects.mockResolvedValue({ total: 0, data: [] })

    const user = userEvent.setup()
    render(React.createElement(ProjectsDashboard))

    const usernameInputs = screen.getAllByPlaceholderText("用户名")
    const passwordInputs = screen.getAllByPlaceholderText("密码")
    const usernameInput = usernameInputs[0]
    const passwordInput = passwordInputs[0]

    if (!usernameInput || !passwordInput) {
      throw new Error("Login inputs not found")
    }

    await user.type(usernameInput, "admin")
    await user.type(passwordInput, "admin123")
    await user.click(screen.getByRole("button", { name: "获取访问令牌" }))

    await waitFor(() => {
      expect(window.localStorage.getItem("verhub-admin-token")).toBe("fresh-token")
    })
  })
})
