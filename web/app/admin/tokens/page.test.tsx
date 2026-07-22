import * as React from "react"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { listApiKeys, listApiScopes, revokeApiKey, type ApiKeyItem } from "@/lib/auth-api"
import { listProjects } from "@/lib/projects-api"

import TokenManagementPage from "./page"

vi.mock("@/lib/auth-api", () => ({
  listApiKeys: vi.fn(),
  listApiScopes: vi.fn(),
  createApiKey: vi.fn(),
  updateApiKey: vi.fn(),
  rotateApiKey: vi.fn(),
  revokeApiKey: vi.fn(),
}))

vi.mock("@/lib/projects-api", () => ({
  listProjects: vi.fn(),
}))

const mockedListApiKeys = vi.mocked(listApiKeys)
const mockedListApiScopes = vi.mocked(listApiScopes)
const mockedListProjects = vi.mocked(listProjects)
const mockedRevokeApiKey = vi.mocked(revokeApiKey)

const CREATED_AT = Math.floor(Date.parse("2026-07-01T00:00:00.000Z") / 1000)

function apiKey(overrides: Partial<ApiKeyItem> = {}): ApiKeyItem {
  return {
    id: "key-1",
    name: "CI 部署密钥",
    scopes: ["versions:write"],
    all_projects: true,
    project_ids: [],
    is_active: true,
    expires_at: CREATED_AT + 30 * 24 * 60 * 60,
    last_used_at: null,
    created_at: CREATED_AT,
    revoked_at: null,
    ...overrides,
  }
}

describe("TokenManagementPage", () => {
  beforeEach(() => {
    window.localStorage.clear()
    window.localStorage.setItem("verhub-admin-token", "valid-token")

    mockedListApiKeys.mockReset()
    mockedListApiScopes.mockReset()
    mockedListProjects.mockReset()
    mockedRevokeApiKey.mockReset()

    mockedListApiScopes.mockResolvedValue({
      data: ["versions:write", "logs:read"],
      default: ["versions:write"],
    })
    mockedListProjects.mockResolvedValue({ total: 0, data: [] })
    mockedRevokeApiKey.mockResolvedValue({ success: true })
  })

  it("过期时间按秒解析，而不是当成毫秒落到 1970 年", async () => {
    mockedListApiKeys.mockResolvedValue({ data: [apiKey()] })

    render(React.createElement(TokenManagementPage))

    const expiry = await screen.findByText(/^过期: /)
    expect(expiry).toHaveTextContent("2026")
  })

  /**
   * 撤销是软删除，行会留在列表里。这条守的是「撤销后页面有可见变化」——
   * 少了它，接口调用成功但界面纹丝不动，用起来就像按钮失灵。
   */
  it("撤销后把该行标成已撤销并收起操作按钮", async () => {
    const user = userEvent.setup()
    vi.spyOn(window, "confirm").mockReturnValue(true)

    mockedListApiKeys.mockResolvedValueOnce({ data: [apiKey()] }).mockResolvedValue({
      data: [apiKey({ is_active: false, revoked_at: CREATED_AT + 3600 })],
    })

    render(React.createElement(TokenManagementPage))

    await user.click(await screen.findByRole("button", { name: "撤销" }))

    await waitFor(() => {
      expect(mockedRevokeApiKey).toHaveBeenCalledWith("key-1")
    })

    expect(await screen.findByText("已撤销")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "撤销" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "轮转" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "编辑" })).not.toBeInTheDocument()
  })

  it("已撤销的行展示撤销时间而不是过期时间", async () => {
    mockedListApiKeys.mockResolvedValue({
      data: [apiKey({ is_active: false, revoked_at: CREATED_AT })],
    })

    render(React.createElement(TokenManagementPage))

    expect(await screen.findByText(/^撤销于 /)).toBeInTheDocument()
    expect(screen.queryByText(/^过期: /)).not.toBeInTheDocument()
  })
})
