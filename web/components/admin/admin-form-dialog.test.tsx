import * as React from "react"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { ConfirmDialogProvider } from "@/components/common/confirm-dialog"

import { AdminFormDialog } from "./admin-form-dialog"

/** 受控外壳，跟真实调用方一样：确认放弃后才把 open 置 false。 */
function Harness({ onOpenChange }: { onOpenChange: (open: boolean) => void }) {
  const [open, setOpen] = React.useState(true)
  const [title, setTitle] = React.useState("原标题")

  return (
    <ConfirmDialogProvider>
      <AdminFormDialog
        open={open}
        onOpenChange={(next) => {
          onOpenChange(next)
          setOpen(next)
        }}
        title="编辑记录"
        description="改完记得保存。"
        submitLabel="保存记录"
        onSubmit={() => {}}
        formValue={{ title }}
      >
        <input aria-label="标题" value={title} onChange={(event) => setTitle(event.target.value)} />
      </AdminFormDialog>
    </ConfirmDialogProvider>
  )
}

describe("AdminFormDialog 未保存改动确认", () => {
  it("没改过内容时取消直接关闭", async () => {
    const user = userEvent.setup()
    const onOpenChange = vi.fn()
    render(<Harness onOpenChange={onOpenChange} />)

    await user.click(screen.getByRole("button", { name: "取消" }))

    expect(screen.queryByText("放弃未保存的修改？")).not.toBeInTheDocument()
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it("改过内容后取消先弹确认，选「继续编辑」保留改动", async () => {
    const user = userEvent.setup()
    const onOpenChange = vi.fn()
    render(<Harness onOpenChange={onOpenChange} />)

    await user.type(screen.getByLabelText("标题"), "改了")
    await user.click(screen.getByRole("button", { name: "取消" }))

    expect(await screen.findByText("放弃未保存的修改？")).toBeInTheDocument()
    expect(onOpenChange).not.toHaveBeenCalled()

    await user.click(screen.getByRole("button", { name: "继续编辑" }))

    await waitFor(() => {
      expect(screen.queryByText("放弃未保存的修改？")).not.toBeInTheDocument()
    })
    expect(screen.getByLabelText("标题")).toHaveValue("原标题改了")
    expect(onOpenChange).not.toHaveBeenCalled()
  })

  it("改过内容后按 ESC 也要确认，选「放弃修改」才关闭", async () => {
    const user = userEvent.setup()
    const onOpenChange = vi.fn()
    render(<Harness onOpenChange={onOpenChange} />)

    await user.type(screen.getByLabelText("标题"), "改了")
    await user.keyboard("{Escape}")

    expect(await screen.findByText("放弃未保存的修改？")).toBeInTheDocument()
    expect(onOpenChange).not.toHaveBeenCalled()

    await user.click(screen.getByRole("button", { name: "放弃修改" }))

    await waitFor(() => {
      expect(onOpenChange).toHaveBeenCalledWith(false)
    })
    expect(screen.queryByLabelText("标题")).not.toBeInTheDocument()
  })
})
