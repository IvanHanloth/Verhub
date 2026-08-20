import { act, renderHook } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const { confirmMock } = vi.hoisted(() => ({
  confirmMock: vi.fn<() => Promise<boolean>>(),
}))

vi.mock("@/components/common/confirm-dialog", () => ({
  useConfirm: () => confirmMock,
}))

import { useUnsavedChangesGuard } from "./unsaved-changes-guard"

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  value: unknown
  baselineKey?: unknown
}

function setup(initialProps: Props) {
  return renderHook((props: Props) => useUnsavedChangesGuard(props), { initialProps })
}

describe("useUnsavedChangesGuard", () => {
  beforeEach(() => {
    confirmMock.mockReset()
    confirmMock.mockResolvedValue(true)
  })

  it("未改动时直接关闭，不弹确认", async () => {
    const onOpenChange = vi.fn()
    const { result } = setup({ open: true, onOpenChange, value: { title: "a" } })

    await act(async () => result.current(false))

    expect(confirmMock).not.toHaveBeenCalled()
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it("打开弹窗本身不受拦截", async () => {
    const onOpenChange = vi.fn()
    const { result, rerender } = setup({ open: true, onOpenChange, value: { title: "a" } })
    rerender({ open: true, onOpenChange, value: { title: "改过了" } })

    await act(async () => result.current(true))

    expect(confirmMock).not.toHaveBeenCalled()
    expect(onOpenChange).toHaveBeenCalledWith(true)
  })

  it("改动后确认「放弃修改」才关闭", async () => {
    const onOpenChange = vi.fn()
    const { result, rerender } = setup({ open: true, onOpenChange, value: { title: "a" } })
    rerender({ open: true, onOpenChange, value: { title: "改过了" } })

    await act(async () => result.current(false))

    expect(confirmMock).toHaveBeenCalledTimes(1)
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it("确认框里选「继续编辑」则不关闭", async () => {
    confirmMock.mockResolvedValue(false)
    const onOpenChange = vi.fn()
    const { result, rerender } = setup({ open: true, onOpenChange, value: { title: "a" } })
    rerender({ open: true, onOpenChange, value: { title: "改过了" } })

    await act(async () => result.current(false))

    expect(confirmMock).toHaveBeenCalledTimes(1)
    expect(onOpenChange).not.toHaveBeenCalled()
  })

  it("确认框已经开着时再次触发不叠第二个", async () => {
    let resolveConfirm: ((ok: boolean) => void) | undefined
    confirmMock.mockReturnValue(
      new Promise<boolean>((resolve) => {
        resolveConfirm = resolve
      }),
    )
    const onOpenChange = vi.fn()
    const { result, rerender } = setup({ open: true, onOpenChange, value: { title: "a" } })
    rerender({ open: true, onOpenChange, value: { title: "改过了" } })

    act(() => {
      result.current(false)
      result.current(false)
      result.current(false)
    })

    expect(confirmMock).toHaveBeenCalledTimes(1)

    await act(async () => resolveConfirm?.(true))
    expect(onOpenChange).toHaveBeenCalledTimes(1)
  })

  it("改回原样后视为未改动", async () => {
    const onOpenChange = vi.fn()
    const { result, rerender } = setup({ open: true, onOpenChange, value: { title: "a" } })
    rerender({ open: true, onOpenChange, value: { title: "改过了" } })
    rerender({ open: true, onOpenChange, value: { title: "a" } })

    await act(async () => result.current(false))

    expect(confirmMock).not.toHaveBeenCalled()
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it("重新打开时按新记录重拍基线", async () => {
    const onOpenChange = vi.fn()
    const { result, rerender } = setup({ open: true, onOpenChange, value: { title: "a" } })
    rerender({ open: false, onOpenChange, value: { title: "a" } })
    // 换一条记录再开：内容不同于上一条，但相对本次打开没改过，不该弹确认。
    rerender({ open: true, onOpenChange, value: { title: "b" } })

    await act(async () => result.current(false))

    expect(confirmMock).not.toHaveBeenCalled()
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it("baselineKey 变化时重拍基线（异步填表 / 保存后不关闭）", async () => {
    const onOpenChange = vi.fn()
    const loaded = { id: 1 }
    const { result, rerender } = setup({
      open: true,
      onOpenChange,
      value: { title: "" },
      baselineKey: null,
    })
    // 数据到齐：value 与 baselineKey 同一批次更新，不该被当成用户改动。
    rerender({ open: true, onOpenChange, value: { title: "服务端值" }, baselineKey: loaded })

    await act(async () => result.current(false))

    expect(confirmMock).not.toHaveBeenCalled()
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it("value 为 undefined 时守卫不生效", async () => {
    const onOpenChange = vi.fn()
    const { result, rerender } = setup({ open: true, onOpenChange, value: undefined })
    rerender({ open: true, onOpenChange, value: undefined })

    await act(async () => result.current(false))

    expect(confirmMock).not.toHaveBeenCalled()
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})
