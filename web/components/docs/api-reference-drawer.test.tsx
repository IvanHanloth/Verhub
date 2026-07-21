import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it } from "vitest"

import { ApiReferenceDrawer } from "./api-reference-drawer"

describe("ApiReferenceDrawer", () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it("stays closed until the trigger is used", () => {
    render(<ApiReferenceDrawer tag="Versions" title="版本接口文档" projectKey="verhub" />)

    expect(screen.getByRole("button", { name: /接口文档/ })).toBeInTheDocument()
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  })

  it("lists the tag's endpoints split by visibility", async () => {
    const user = userEvent.setup()
    render(<ApiReferenceDrawer tag="Versions" title="版本接口文档" projectKey="verhub" />)

    await user.click(screen.getByRole("button", { name: /接口文档/ }))

    const nav = within(screen.getByRole("dialog")).getByRole("navigation", { name: "接口列表" })
    expect(within(nav).getByText("公开接口")).toBeInTheDocument()
    expect(within(nav).getByText("管理接口")).toBeInTheDocument()
    expect(within(nav).getByRole("button", { name: /获取公开版本列表/ })).toBeInTheDocument()
    expect(within(nav).getByRole("button", { name: /创建版本/ })).toBeInTheDocument()
  })

  it("shows full endpoint documentation and a prefilled playground", async () => {
    const user = userEvent.setup()
    window.localStorage.setItem("verhub-admin-token", "session-token")
    render(<ApiReferenceDrawer tag="Versions" title="版本接口文档" projectKey="verhub" />)

    await user.click(screen.getByRole("button", { name: /接口文档/ }))
    const dialog = screen.getByRole("dialog")

    expect(within(dialog).getByRole("heading", { name: "鉴权方式" })).toBeInTheDocument()
    expect(within(dialog).getByRole("heading", { name: "请求参数" })).toBeInTheDocument()
    expect(within(dialog).getByRole("heading", { name: "响应示例" })).toBeInTheDocument()
    expect(within(dialog).getByRole("heading", { name: "Try It Out" })).toBeInTheDocument()

    // 首个接口是公开的版本列表，projectKey 由当前页选中项目带入
    expect(
      within(dialog).getByText("/api/v1/public/verhub/versions?limit=20&offset=0"),
    ).toBeVisible()
  })

  it("carries the admin session token into the playground for admin endpoints", async () => {
    const user = userEvent.setup()
    window.localStorage.setItem("verhub-admin-token", "session-token")
    render(<ApiReferenceDrawer tag="Versions" title="版本接口文档" projectKey="verhub" />)

    await user.click(screen.getByRole("button", { name: /接口文档/ }))
    const dialog = screen.getByRole("dialog")
    await user.click(within(dialog).getByRole("button", { name: /创建版本/ }))

    expect(within(dialog).getByLabelText("Token")).toHaveValue("session-token")
    expect(within(dialog).getByLabelText("Path: projectKey")).toHaveValue("verhub")
  })

  it("renders nothing when the tag has no documented endpoint", () => {
    const { container } = render(<ApiReferenceDrawer tag="Unknown" title="未知" />)

    expect(container).toBeEmptyDOMElement()
  })
})
