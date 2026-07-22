import * as React from "react"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"

import { JsonField, JsonViewer } from "./json-viewer"

describe("JsonViewer", () => {
  it("shows top-level keys but keeps nested branches folded", () => {
    render(<JsonViewer value={{ os: "windows", meta: { build: "1.0.0" } }} />)

    expect(screen.getByText("os")).toBeInTheDocument()
    expect(screen.getByText('"windows"')).toBeInTheDocument()
    // `meta` is visible as a branch; its contents are not rendered yet.
    expect(screen.getByText("meta")).toBeInTheDocument()
    expect(screen.queryByText("build")).not.toBeInTheDocument()
  })

  it("expands a nested branch on click", async () => {
    const user = userEvent.setup()
    render(<JsonViewer value={{ meta: { build: "1.0.0" } }} />)

    await user.click(screen.getByRole("button", { name: /meta/ }))

    expect(screen.getByText("build")).toBeInTheDocument()
    expect(screen.getByText('"1.0.0"')).toBeInTheDocument()
  })

  it("reports the size of a collapsed branch so you know whether to open it", () => {
    render(<JsonViewer value={{ meta: { a: 1, b: 2, c: 3 } }} />)

    expect(screen.getByText("{…} 3 项")).toBeInTheDocument()
  })

  it("indexes array entries by position", async () => {
    const user = userEvent.setup()
    render(<JsonViewer value={{ tags: ["alpha", "beta"] }} />)

    await user.click(screen.getByRole("button", { name: /tags/ }))

    expect(screen.getByText("0")).toBeInTheDocument()
    expect(screen.getByText('"alpha"')).toBeInTheDocument()
  })

  it("renders the empty state rather than an empty tree", () => {
    render(<JsonViewer value={null} emptyText="没有数据" />)

    expect(screen.getByText("没有数据")).toBeInTheDocument()
  })

  it("treats an empty object as empty", () => {
    render(<JsonViewer value={{}} emptyText="没有数据" />)

    expect(screen.getByText("没有数据")).toBeInTheDocument()
  })

  it("distinguishes a number from a numeric string", () => {
    render(<JsonViewer value={{ port: 8080, label: "8080" }} />)

    expect(screen.getByText("8080")).toBeInTheDocument()
    expect(screen.getByText('"8080"')).toBeInTheDocument()
  })
})

describe("JsonField", () => {
  it("stays collapsed until opened", async () => {
    const user = userEvent.setup()
    render(<JsonField label="device_info" value={{ os: "windows" }} />)

    expect(screen.queryByText("os")).not.toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: /device_info/ }))

    expect(screen.getByText("os")).toBeInTheDocument()
  })

  it("marks an empty payload and refuses to expand it", () => {
    render(<JsonField label="custom_data" value={{}} />)

    const toggle = screen.getByRole("button", { name: /custom_data/ })
    expect(toggle).toBeDisabled()
    expect(screen.getByText("空")).toBeInTheDocument()
  })
})
