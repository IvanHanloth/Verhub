import * as React from "react"
import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { DataTable, TruncatedCell, createDataTableColumns } from "./data-table"

type Row = { id: string; name: string; note: string }

const rows: Row[] = [
  { id: "r1", name: "第一行", note: "备注一\n第二段正文" },
  { id: "r2", name: "第二行", note: "备注二" },
]

const helper = createDataTableColumns<Row>()

const columns = [
  helper.display({
    id: "name",
    header: "名称",
    enableHiding: false,
    cell: ({ row }) => row.original.name,
  }),
  helper.display({
    id: "note",
    header: "备注",
    cell: ({ row }) => <TruncatedCell title={row.original.note}>{row.original.note}</TruncatedCell>,
  }),
  helper.display({
    id: "id",
    header: "ID",
    cell: ({ row }) => row.original.id,
    meta: { defaultHidden: true },
  }),
]

function renderTable(props: Partial<React.ComponentProps<typeof DataTable<Row>>> = {}) {
  return render(<DataTable columns={columns} rows={rows} getRowId={(row) => row.id} {...props} />)
}

async function openDetail(user: ReturnType<typeof userEvent.setup>, index = 0) {
  await user.click(screen.getAllByRole("button", { name: "查看详情" })[index]!)
  return screen.getByRole("dialog")
}

describe("DataTable", () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it("默认隐藏 meta.defaultHidden 的列，勾选后显示", async () => {
    const user = userEvent.setup()
    renderTable()

    expect(screen.getByText("第一行")).toBeInTheDocument()
    expect(screen.queryByRole("columnheader", { name: "ID" })).not.toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: /^列（/ }))
    await user.click(screen.getByRole("checkbox", { name: "ID" }))

    expect(screen.getByRole("columnheader", { name: "ID" })).toBeInTheDocument()
    expect(screen.getByText("r1")).toBeInTheDocument()
  })

  it("enableHiding 为 false 的列不出现在列显隐菜单里", async () => {
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
   * 换 TanStack 底座之前存的就是「隐藏列 id 数组」，格式必须继续认，
   * 否则升级这一版会把所有人已经调好的列偏好清空。
   */
  it("认得换底座之前存下的列偏好格式", async () => {
    window.localStorage.setItem("verhub:table-columns:legacy", JSON.stringify(["note"]))
    renderTable({ storageKey: "legacy" })

    await waitFor(() => {
      expect(screen.queryByRole("columnheader", { name: "备注" })).not.toBeInTheDocument()
    })
    expect(screen.getByRole("columnheader", { name: "名称" })).toBeInTheDocument()
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

  it("详情抽屉只在点开后渲染", async () => {
    const user = userEvent.setup()
    renderTable()

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()

    const dialog = await openDetail(user)

    expect(within(dialog).getByRole("heading", { name: "第一行" })).toBeInTheDocument()
    expect(within(dialog).queryByText("第二行")).not.toBeInTheDocument()
  })

  /** 抽屉存在的意义之一：列表里关掉的列，在这里照样能看到。 */
  it("抽屉里连默认隐藏的列一起摊开", async () => {
    const user = userEvent.setup()
    renderTable()

    expect(screen.queryByRole("columnheader", { name: "ID" })).not.toBeInTheDocument()

    const dialog = await openDetail(user)

    expect(within(dialog).getByText("ID")).toBeInTheDocument()
    expect(within(dialog).getByText("r1")).toBeInTheDocument()
  })

  /** 表格里长文本截成一行，抽屉里必须保留换行地铺开——这正是这次改动要解决的问题。 */
  it("长文本在抽屉里完整展开并保留换行", async () => {
    const user = userEvent.setup()
    renderTable()

    const cellText = screen.getAllByText("备注一 第二段正文")[0]!
    expect(cellText).toHaveClass("truncate")

    const dialog = await openDetail(user)

    expect(within(dialog).getByText("备注一 第二段正文")).toHaveClass("whitespace-pre-wrap")
  })

  it("抽屉里可以直接翻到上一条 / 下一条", async () => {
    const user = userEvent.setup()
    renderTable()

    const dialog = await openDetail(user)
    expect(within(dialog).getByRole("button", { name: "上一条" })).toBeDisabled()

    await user.click(within(dialog).getByRole("button", { name: "下一条" }))
    expect(
      within(screen.getByRole("dialog")).getByRole("heading", { name: "第二行" }),
    ).toBeVisible()
    expect(
      within(screen.getByRole("dialog")).getByRole("button", { name: "下一条" }),
    ).toBeDisabled()

    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "上一条" }))
    expect(
      within(screen.getByRole("dialog")).getByRole("heading", { name: "第一行" }),
    ).toBeVisible()
  })

  it("Esc 关闭抽屉", async () => {
    const user = userEvent.setup()
    renderTable()

    await openDetail(user)
    await user.keyboard("{Escape}")

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    })
  })

  /** 行内操作按钮不能顺手把抽屉也弹出来，否则点「删除」会同时开一个抽屉。 */
  it("点行内按钮不触发详情抽屉", async () => {
    const user = userEvent.setup()
    const onAction = vi.fn()
    renderTable({
      columns: [
        ...columns,
        helper.display({
          id: "actions",
          header: "操作",
          enableHiding: false,
          cell: () => (
            <button type="button" onClick={onAction}>
              删除
            </button>
          ),
          meta: { hideInDetail: true, pin: "end" },
        }),
      ],
    })

    await user.click(screen.getAllByRole("button", { name: "删除" })[0]!)

    expect(onAction).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  })

  it("detail 为 false 时不给详情入口", () => {
    renderTable({ detail: false })

    expect(screen.queryByRole("button", { name: "查看详情" })).not.toBeInTheDocument()
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
