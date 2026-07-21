import * as React from "react"
import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { MarkdownContent } from "./markdown-content"

describe("MarkdownContent", () => {
  it("将 GitHub Release 正文渲染为结构化元素", () => {
    const { container } = render(
      <MarkdownContent>
        {[
          "## What's Changed",
          "* 新增进程冻结工具 by @someone in https://github.com/org/repo/pull/86",
          "* 修复已知问题",
          "",
          "**Full Changelog**: https://github.com/org/repo/compare/v1...v2",
        ].join("\n")}
      </MarkdownContent>,
    )

    expect(screen.getByRole("heading", { level: 2, name: "What's Changed" })).toBeInTheDocument()
    expect(container.querySelectorAll("li")).toHaveLength(2)
    expect(screen.getByText("Full Changelog").tagName).toBe("STRONG")
    // GFM 的 autolink：裸 URL 应变成可点击链接
    expect(container.querySelectorAll("a").length).toBeGreaterThan(0)
  })

  it("外链统一新窗口打开且不传递引荐信息", () => {
    const { container } = render(<MarkdownContent>{"[站点](https://example.com)"}</MarkdownContent>)

    const link = container.querySelector("a")
    expect(link).toHaveAttribute("target", "_blank")
    expect(link?.getAttribute("rel")).toContain("noreferrer")
  })

  it("剥离脚本与事件处理属性", () => {
    const { container } = render(
      <MarkdownContent>
        {[
          "<script>window.__pwned = true</script>",
          '<img src="x" onerror="window.__pwned = true">',
          '<a href="javascript:window.__pwned=true">点我</a>',
        ].join("\n\n")}
      </MarkdownContent>,
    )

    expect(container.querySelector("script")).toBeNull()
    expect(container.querySelector("[onerror]")).toBeNull()
    expect(container.innerHTML).not.toContain("javascript:")
  })

  it("支持 GFM 表格与任务列表", () => {
    const { container } = render(
      <MarkdownContent>
        {[
          "| 平台 | 状态 |",
          "| --- | --- |",
          "| Windows | 可用 |",
          "",
          "- [x] 已完成",
          "- [ ] 待办",
        ].join("\n")}
      </MarkdownContent>,
    )

    expect(container.querySelector("table")).not.toBeNull()
    expect(container.querySelectorAll("th")).toHaveLength(2)
    expect(container.querySelectorAll('input[type="checkbox"]')).toHaveLength(2)
  })
})
