import * as React from "react"
import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { listProjectLocales, listProjects } from "@/lib/projects-api"
import {
  createAnnouncement,
  deleteAnnouncement,
  listAnnouncements,
  updateAnnouncement,
} from "@/lib/announcements-api"

import { AnnouncementsDashboard } from "./announcements-dashboard"

vi.mock("@/lib/projects-api", () => ({
  listProjects: vi.fn(),
  listProjectLocales: vi.fn(),
}))

vi.mock("@/lib/announcements-api", () => ({
  listAnnouncements: vi.fn(),
  createAnnouncement: vi.fn(),
  updateAnnouncement: vi.fn(),
  deleteAnnouncement: vi.fn(),
}))

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

const mockedListProjects = vi.mocked(listProjects)
const mockedListProjectLocales = vi.mocked(listProjectLocales)
const mockedListAnnouncements = vi.mocked(listAnnouncements)
const mockedCreateAnnouncement = vi.mocked(createAnnouncement)
const mockedUpdateAnnouncement = vi.mocked(updateAnnouncement)

function buildAnnouncement(overrides: Record<string, unknown> = {}) {
  return {
    id: "ann-1",
    title: "维护通知",
    content: "本周六停机维护",
    is_pinned: false,
    is_hidden: false,
    platforms: [],
    author: null,
    min_comparable_version: null,
    max_comparable_version: null,
    locale: null,
    translations: [],
    published_at: 1774080000,
    created_at: 1774076400,
    updated_at: 1774078200,
    ...overrides,
  }
}

describe("AnnouncementsDashboard", () => {
  beforeEach(() => {
    window.localStorage.clear()
    window.localStorage.setItem("verhub-admin-token", "valid-token")

    mockedListProjects.mockReset()
    mockedListProjectLocales.mockReset()
    mockedListAnnouncements.mockReset()
    mockedCreateAnnouncement.mockReset()
    mockedUpdateAnnouncement.mockReset()
    vi.mocked(deleteAnnouncement).mockReset()

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
          created_at: 1774076400,
          updated_at: 1774076400,
        },
      ],
    } as never)
    mockedListProjectLocales.mockResolvedValue({ data: [] })
    mockedListAnnouncements.mockResolvedValue({ total: 1, data: [buildAnnouncement()] } as never)
    mockedCreateAnnouncement.mockResolvedValue(buildAnnouncement() as never)
    mockedUpdateAnnouncement.mockResolvedValue(buildAnnouncement() as never)
  })

  it("项目没注册语言时不显示语言页签", async () => {
    const user = userEvent.setup()
    render(React.createElement(AnnouncementsDashboard))

    await screen.findAllByText("维护通知")
    await user.click(screen.getByRole("button", { name: "新增公告" }))

    const dialog = await screen.findByRole("dialog")
    expect(within(dialog).queryByRole("tab", { name: "默认内容" })).not.toBeInTheDocument()
    // 退化成原来的单一表单：默认内容的字段直接可见，没有页签这一层
    expect(within(dialog).getByLabelText("公告标题")).toBeInTheDocument()
    expect(within(dialog).queryByLabelText("译文标题")).not.toBeInTheDocument()
  })

  it("注册了语言时按语言列出页签，并把译文一并提交", async () => {
    mockedListProjectLocales.mockResolvedValue({
      data: [
        { locale: "en-US", aliases: [], label: "English", created_at: 1 },
        { locale: "ja-JP", aliases: [], label: null, created_at: 2 },
      ],
    })

    const user = userEvent.setup()
    render(React.createElement(AnnouncementsDashboard))

    await screen.findAllByText("维护通知")
    await user.click(screen.getByRole("button", { name: "新增公告" }))

    const dialog = await screen.findByRole("dialog")
    // 有 label 的显示「展示名（标签）」，没 label 的直接显示标签
    await within(dialog).findByRole("tab", { name: "English（en-US）" })
    expect(within(dialog).getByRole("tab", { name: "ja-JP" })).toBeInTheDocument()

    await user.type(within(dialog).getByLabelText("公告标题"), "维护通知")
    await user.type(within(dialog).getByLabelText("公告内容"), "本周六停机")

    await user.click(within(dialog).getByRole("tab", { name: "English（en-US）" }))
    await user.type(within(dialog).getByLabelText("译文标题"), "Maintenance")
    await user.type(within(dialog).getByLabelText("译文内容"), "Down on Saturday")

    await user.click(within(dialog).getByRole("button", { name: "发布公告" }))

    await waitFor(() => {
      expect(mockedCreateAnnouncement).toHaveBeenCalled()
    })
    const payload = mockedCreateAnnouncement.mock.calls[0]?.[2]
    expect(payload).toMatchObject({
      title: "维护通知",
      content: "本周六停机",
      // 只提交填了内容的语言，ja-JP 一个字没写就不生成译文
      translations: [
        { locale: "en-US", title: "Maintenance", content: "Down on Saturday", is_hidden: false },
      ],
    })
  })

  it("可见版本范围填了才进 payload，留空发 null", async () => {
    const user = userEvent.setup()
    render(React.createElement(AnnouncementsDashboard))

    await screen.findAllByText("维护通知")
    await user.click(screen.getByRole("button", { name: "新增公告" }))

    const dialog = await screen.findByRole("dialog")
    await user.type(within(dialog).getByLabelText("公告标题"), "仅限 2.x")
    await user.type(within(dialog).getByLabelText("公告内容"), "请升级")
    await user.type(within(dialog).getByPlaceholderText("例如：2.0.0"), "2.0.0")

    await user.click(within(dialog).getByRole("button", { name: "发布公告" }))

    await waitFor(() => {
      expect(mockedCreateAnnouncement).toHaveBeenCalled()
    })
    expect(mockedCreateAnnouncement.mock.calls[0]?.[2]).toMatchObject({
      min_comparable_version: "2.0.0",
      max_comparable_version: null,
    })
  })

  it("编辑时把已有译文回填到对应语言页", async () => {
    mockedListProjectLocales.mockResolvedValue({
      data: [{ locale: "en-US", aliases: [], label: "English", created_at: 1 }],
    })
    mockedListAnnouncements.mockResolvedValue({
      total: 1,
      data: [
        buildAnnouncement({
          min_comparable_version: "2.0.0",
          translations: [
            {
              locale: "en-US",
              title: "Maintenance",
              content: "Down on Saturday",
              is_hidden: false,
            },
          ],
        }),
      ],
    } as never)

    const user = userEvent.setup()
    render(React.createElement(AnnouncementsDashboard))

    await screen.findAllByText("维护通知")
    await user.click(screen.getByRole("button", { name: "编辑" }))

    const dialog = await screen.findByRole("dialog")
    expect(within(dialog).getByDisplayValue("2.0.0")).toBeInTheDocument()

    await user.click(within(dialog).getByRole("tab", { name: "English（en-US）" }))
    expect(within(dialog).getByLabelText("译文标题")).toHaveValue("Maintenance")
    expect(within(dialog).getByLabelText("译文内容")).toHaveValue("Down on Saturday")
  })

  it("语言页的隐藏开关单独提交，不需要填译文", async () => {
    mockedListProjectLocales.mockResolvedValue({
      data: [{ locale: "en-US", aliases: [], label: "English", created_at: 1 }],
    })

    const user = userEvent.setup()
    render(React.createElement(AnnouncementsDashboard))

    await screen.findAllByText("维护通知")
    await user.click(screen.getByRole("button", { name: "新增公告" }))

    const dialog = await screen.findByRole("dialog")
    await user.type(within(dialog).getByLabelText("公告标题"), "只给中文用户")
    await user.type(within(dialog).getByLabelText("公告内容"), "正文")

    await user.click(within(dialog).getByRole("tab", { name: "English（en-US）" }))
    await user.click(within(dialog).getByRole("checkbox", { name: /隐藏这条公告/ }))

    await user.click(within(dialog).getByRole("button", { name: "发布公告" }))

    await waitFor(() => {
      expect(mockedCreateAnnouncement).toHaveBeenCalled()
    })
    // 标题正文都没填，但隐藏开关本身就是一项有意义的设置
    expect(mockedCreateAnnouncement.mock.calls[0]?.[2]).toMatchObject({
      translations: [{ locale: "en-US", title: null, content: null, is_hidden: true }],
    })
  })

  it("三项都没动的语言不会被提交", async () => {
    mockedListProjectLocales.mockResolvedValue({
      data: [{ locale: "en-US", aliases: [], label: "English", created_at: 1 }],
    })

    const user = userEvent.setup()
    render(React.createElement(AnnouncementsDashboard))

    await screen.findAllByText("维护通知")
    await user.click(screen.getByRole("button", { name: "新增公告" }))

    const dialog = await screen.findByRole("dialog")
    await user.type(within(dialog).getByLabelText("公告标题"), "标题")
    await user.type(within(dialog).getByLabelText("公告内容"), "正文")
    // 切进语言页看一眼但什么都没改
    await user.click(within(dialog).getByRole("tab", { name: "English（en-US）" }))
    await user.click(within(dialog).getByRole("tab", { name: "默认内容" }))

    await user.click(within(dialog).getByRole("button", { name: "发布公告" }))

    await waitFor(() => {
      expect(mockedCreateAnnouncement).toHaveBeenCalled()
    })
    expect(mockedCreateAnnouncement.mock.calls[0]?.[2]).toMatchObject({ translations: [] })
  })

  it("列表显示可见版本范围与译文数量", async () => {
    mockedListAnnouncements.mockResolvedValue({
      total: 1,
      data: [
        buildAnnouncement({
          min_comparable_version: "2.0.0",
          max_comparable_version: "2.9.9",
          translations: [{ locale: "en-US", title: "T", content: "C", is_hidden: false }],
        }),
      ],
    } as never)

    render(React.createElement(AnnouncementsDashboard))

    expect(await screen.findByText("2.0.0 ~ 2.9.9")).toBeInTheDocument()
    expect(screen.getByTitle("已录入译文：en-US")).toBeInTheDocument()
  })
})
