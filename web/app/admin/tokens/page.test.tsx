import * as React from "react"
import { render, screen, waitFor, within } from "@testing-library/react"
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

    // 过期时间列是这行唯一渲染出的日期（创建时间列默认隐藏，最近使用为空）。
    expect(await screen.findByRole("cell", { name: /2026/ })).toBeInTheDocument()
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

    // 状态筛选下拉里也有「已撤销」这一项，所以限定在表格行内找。
    const statusCell = await screen.findByRole("cell", { name: "已撤销" })
    expect(statusCell).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "撤销" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "轮转" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "编辑" })).not.toBeInTheDocument()
  })

  it("已撤销的行填出撤销时间，未撤销的行留空", async () => {
    mockedListApiKeys.mockResolvedValue({
      data: [
        apiKey({ id: "key-revoked", name: "旧密钥", is_active: false, revoked_at: CREATED_AT }),
        apiKey({ id: "key-active", name: "在用密钥" }),
      ],
    })

    render(React.createElement(TokenManagementPage))

    // 先等真实数据到位：加载态渲染的是空的骨架行，直接取 row 会取到它们。
    await screen.findByText("旧密钥")
    const rows = screen.getAllByRole("row")
    // 按表头定位列序，避免以后插一列就把断言挪错位置。
    const headers = within(rows[0]!).getAllByRole("columnheader")
    const revokedAtIndex = headers.findIndex((header) => header.textContent === "撤销时间")

    const revokedCells = within(rows[1]!).getAllByRole("cell")
    const activeCells = within(rows[2]!).getAllByRole("cell")

    expect(revokedCells[revokedAtIndex]).toHaveTextContent("2026")
    expect(activeCells[revokedAtIndex]).toHaveTextContent("—")
  })

  it("状态筛选可以只看已撤销的 Token", async () => {
    const user = userEvent.setup()
    mockedListApiKeys.mockResolvedValue({
      data: [
        apiKey({ id: "key-revoked", name: "旧密钥", is_active: false, revoked_at: CREATED_AT }),
        apiKey({ id: "key-active", name: "在用密钥" }),
      ],
    })

    render(React.createElement(TokenManagementPage))

    expect(await screen.findByText("在用密钥")).toBeInTheDocument()

    await user.selectOptions(screen.getByLabelText("状态"), "revoked")

    expect(screen.getByText("旧密钥")).toBeInTheDocument()
    expect(screen.queryByText("在用密钥")).not.toBeInTheDocument()
  })
})
