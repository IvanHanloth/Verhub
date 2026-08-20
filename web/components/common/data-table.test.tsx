import * as React from "react"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { DataTable, type DataTableColumn } from "./data-table"

type Row = { id: string; name: string; note: string }

const rows: Row[] = [
  { id: "r1", name: "第一行", note: "备注一" },
  { id: "r2", name: "第二行", note: "备注二" },
]

const columns: Array<DataTableColumn<Row>> = [
  { id: "name", header: "名称", label: "名称", alwaysVisible: true, cell: (row) => row.name },
  { id: "note", header: "备注", label: "备注", cell: (row) => row.note },
  { id: "id", header: "ID", label: "ID", defaultHidden: true, cell: (row) => row.id },
]

function renderTable(props: Partial<React.ComponentProps<typeof DataTable<Row>>> = {}) {
  return render(<DataTable columns={columns} rows={rows} getRowId={(row) => row.id} {...props} />)
}

describe("DataTable", () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it("默认隐藏 defaultHidden 的列，勾选后显示", async () => {
    const user = userEvent.setup()
    renderTable()

    expect(screen.getByText("第一行")).toBeInTheDocument()
    expect(screen.queryByRole("columnheader", { name: "ID" })).not.toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: /^列（/ }))
    await user.click(screen.getByRole("checkbox", { name: "ID" }))

    expect(screen.getByRole("columnheader", { name: "ID" })).toBeInTheDocument()
    expect(screen.getByText("r1")).toBeInTheDocument()
  })

  it("alwaysVisible 的列不出现在列显隐菜单里", async () => {
    const user = userEvent.setup()
    renderTable()

    await user.click(screen.getByRole("button", { name: /^列（/ }))

    expect(screen.queryByRole("checkbox", { name: "名称" })).not.toBeInTheDocument()
    expect(screen.getByRole("checkbox", { name: "备注" })).toBeInTheDocument()
  })

  /** 列偏好要跨会话留存，否则每次进页面都得重新调一遍。 */
  it("把列显隐写进 localStorage，重新挂载后仍然生效", async () => {
    const user = userEvent.setup()
    const { unmount } = renderTable({ storageKey: "unit-test" })

    await user.click(screen.getByRole("button", { name: /^列（/ }))
    await user.click(screen.getByRole("checkbox", { name: "备注" }))
    expect(screen.queryByRole("columnheader", { name: "备注" })).not.toBeInTheDocument()

    unmount()
    renderTable({ storageKey: "unit-test" })

    await waitFor(() => {
      expect(screen.queryByRole("columnheader", { name: "备注" })).not.toBeInTheDocument()
    })
  })

  /**
   * 搜索是防抖后交回页面去请求服务端的，组件自己不过滤——只在当前页里过滤会让
   * 人以为「没搜到」，而实际只是不在这一页。
   */
  it("搜索框防抖后回调一次，且不在本地过滤行", async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    renderTable({ search: { value: "", onChange, placeholder: "搜索" } })

    await user.type(screen.getByRole("searchbox"), "第一")

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith("第一")
    })
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(screen.getByText("第二行")).toBeInTheDocument()
  })

  it("展开行只在点开后渲染", async () => {
    const user = userEvent.setup()
    renderTable({ renderExpanded: (row) => <span>详情 {row.id}</span> })

    expect(screen.queryByText("详情 r1")).not.toBeInTheDocument()

    await user.click(screen.getAllByRole("button", { name: "展开详情" })[0]!)

    expect(screen.getByText("详情 r1")).toBeInTheDocument()
    expect(screen.queryByText("详情 r2")).not.toBeInTheDocument()
  })

  it("加载中不渲染数据行，出错时只显示错误", () => {
    const { rerender } = renderTable({ loading: true })
    expect(screen.queryByText("第一行")).not.toBeInTheDocument()

    rerender(
      <DataTable columns={columns} rows={rows} getRowId={(row) => row.id} error="加载失败" />,
    )
    expect(screen.getByText("加载失败")).toBeInTheDocument()
    expect(screen.queryByText("第一行")).not.toBeInTheDocument()
  })

  it("没有数据时显示空态文案", () => {
    renderTable({ rows: [], emptyMessage: "这里什么都没有" })
    expect(screen.getByText("这里什么都没有")).toBeInTheDocument()
  })
})
