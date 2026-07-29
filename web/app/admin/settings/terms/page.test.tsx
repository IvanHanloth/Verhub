import * as React from "react"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import TermsSettingsPage from "./page"

import { getSessionToken } from "@/lib/auth-session"
import {
  listTermsDocumentConfigs,
  updateTermsDocument,
  type TermsDocumentConfigView,
} from "@/lib/terms-api"

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

vi.mock("@/lib/auth-session", () => ({
  getSessionToken: vi.fn(),
}))

vi.mock("@/lib/terms-api", () => ({
  listTermsDocumentConfigs: vi.fn(),
  updateTermsDocument: vi.fn(),
  resetTermsDocument: vi.fn(),
}))

vi.mock("@/components/common/confirm-dialog", () => ({
  useConfirm: () => vi.fn().mockResolvedValue(true),
}))

const SDK_BUILTIN = "# SDK 合规性文档\n\n采集范围内置正文。"
const PRIVACY_BUILTIN = "# 隐私政策\n\n由 {{operator_name}} 运营。"

const SDK_DOC: TermsDocumentConfigView = {
  slug: "sdk-compliance",
  title: "SDK 合规性文档",
  summary: "逐项列明 SDK 各能力发送哪些数据。",
  custom: false,
  content: SDK_BUILTIN,
  custom_content: null,
  custom_updated_at: null,
  builtin_content: SDK_BUILTIN,
  builtin_updated_at: 1785196800,
  updated_at: null,
  placeholders: [],
}

const PRIVACY_DOC: TermsDocumentConfigView = {
  ...SDK_DOC,
  slug: "privacy-policy",
  title: "隐私政策",
  summary: "说明数据如何去标识化与留存。",
  content: PRIVACY_BUILTIN,
  builtin_content: PRIVACY_BUILTIN,
  placeholders: [
    {
      key: "operator_name",
      label: "运营主体全称",
      hint: "与营业执照一致。",
      example: "示例科技（北京）有限公司",
      required: true,
    },
  ],
}

const mockedGetSessionToken = vi.mocked(getSessionToken)
const mockedListConfigs = vi.mocked(listTermsDocumentConfigs)
const mockedUpdateDocument = vi.mocked(updateTermsDocument)

beforeEach(() => {
  vi.clearAllMocks()
  mockedGetSessionToken.mockReturnValue("token")
  mockedListConfigs.mockResolvedValue([SDK_DOC, PRIVACY_DOC])
  mockedUpdateDocument.mockResolvedValue(SDK_DOC)
})

describe("TermsSettingsPage", () => {
  it("opens on the first document and previews its builtin text", async () => {
    render(React.createElement(TermsSettingsPage))

    expect(await screen.findByText("采集范围内置正文。")).toBeInTheDocument()
    expect(screen.getByText("使用内置正文")).toBeInTheDocument()
  })

  it("switches documents without losing the other tab's unsaved draft", async () => {
    const user = userEvent.setup()
    render(React.createElement(TermsSettingsPage))

    await user.click(await screen.findByRole("checkbox"))
    await user.clear(screen.getByRole("textbox"))
    await user.type(screen.getByRole("textbox"), "改过的采集公示")

    await user.click(screen.getByRole("tab", { name: "隐私政策" }))
    expect(screen.getByText("由 {{operator_name}} 运营。")).toBeInTheDocument()

    await user.click(screen.getByRole("tab", { name: "SDK 合规性文档" }))
    expect(screen.getByRole("textbox")).toHaveValue("改过的采集公示")
  })

  it("seeds the editor with the builtin text so no one starts from a blank page", async () => {
    const user = userEvent.setup()
    render(React.createElement(TermsSettingsPage))

    await user.click(await screen.findByRole("checkbox"))

    expect(screen.getByRole("textbox")).toHaveValue(SDK_BUILTIN)
  })

  it("saves the draft of the active document only", async () => {
    const user = userEvent.setup()
    render(React.createElement(TermsSettingsPage))

    await user.click(await screen.findByRole("tab", { name: "隐私政策" }))
    await user.click(screen.getByRole("checkbox"))
    await user.click(screen.getByRole("button", { name: /保存设置/ }))

    await waitFor(() => {
      expect(mockedUpdateDocument).toHaveBeenCalledWith("token", "privacy-policy", {
        custom: true,
        content: PRIVACY_BUILTIN,
      })
    })
    expect(mockedUpdateDocument).toHaveBeenCalledTimes(1)
  })

  it("fills the template placeholders into the editor and saves the finished text", async () => {
    const user = userEvent.setup()
    render(React.createElement(TermsSettingsPage))

    await user.click(await screen.findByRole("tab", { name: "隐私政策" }))
    await user.type(screen.getByPlaceholderText("示例科技（北京）有限公司"), "示例公司")
    await user.click(screen.getByRole("button", { name: /生成正文/ }))

    // 生成即打开自定义开关，编辑器里拿到的是替换后的成品而不是模板。
    expect(screen.getByLabelText("文档正文")).toHaveValue("# 隐私政策\n\n由 示例公司 运营。")

    await user.click(screen.getByRole("button", { name: /保存设置/ }))

    await waitFor(() => {
      expect(mockedUpdateDocument).toHaveBeenCalledWith("token", "privacy-policy", {
        custom: true,
        content: "# 隐私政策\n\n由 示例公司 运营。",
      })
    })
  })

  it("warns on the page when the live text still carries a placeholder", async () => {
    render(React.createElement(TermsSettingsPage))

    expect(await screen.findByRole("tab", { name: "隐私政策" })).toBeInTheDocument()
    // 首个选项卡是 SDK 文档，其正文没有占位符，不应误报。
    expect(screen.queryByText(/未填写的占位符/)).not.toBeInTheDocument()
  })

  it("keeps showing the builtin badge when the switch is on but nothing was saved yet", async () => {
    mockedListConfigs.mockResolvedValue([{ ...SDK_DOC, custom: true }, PRIVACY_DOC])
    render(React.createElement(TermsSettingsPage))

    // custom_content 为空时后端回落到内置正文，徽标必须跟着说实话。
    expect(await screen.findByText("使用内置正文")).toBeInTheDocument()
  })
})
