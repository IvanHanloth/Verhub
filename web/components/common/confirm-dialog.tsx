"use client"

import * as React from "react"

import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"

export type ConfirmOptions = {
  title: string
  description?: React.ReactNode
  confirmLabel?: string
  cancelLabel?: string
  /** 危险操作：确认按钮用红色 destructive 样式。默认 false。 */
  destructive?: boolean
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>

const ConfirmContext = React.createContext<ConfirmFn | null>(null)

/**
 * 全站统一的确认框。替代原生 `window.confirm`：后者不跟随主题、无法聚焦管理、
 * 在 SPA 里还会同步阻塞。这里基于 Radix Dialog，拿到焦点陷阱、ESC 关闭与遮罩点击，
 * 危险操作用红色按钮区分。
 *
 * 用法与 `window.confirm` 几乎 1:1：`const ok = await confirm({...}); if (!ok) return`。
 */
export function ConfirmDialogProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false)
  // 关闭动画期间不清空，避免退场时标题/正文闪成空白；下次 confirm 覆盖即可。
  const [options, setOptions] = React.useState<ConfirmOptions | null>(null)
  const resolverRef = React.useRef<((ok: boolean) => void) | null>(null)

  const confirm = React.useCallback<ConfirmFn>((next) => {
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve
      setOptions(next)
      setOpen(true)
    })
  }, [])

  // 一切关闭途径（取消、ESC、点遮罩、确认）都经此结算未决 Promise，
  // resolverRef 置空保证只结算一次，调用方不会永远挂起。
  const settle = React.useCallback((ok: boolean) => {
    setOpen(false)
    const resolve = resolverRef.current
    resolverRef.current = null
    resolve?.(ok)
  }, [])

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Dialog
        open={open}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) settle(false)
        }}
      >
        <DialogContent showCloseButton={false} className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{options?.title ?? ""}</DialogTitle>
            {options?.description ? (
              <DialogDescription>{options.description}</DialogDescription>
            ) : null}
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => settle(false)}>
              {options?.cancelLabel ?? "取消"}
            </Button>
            <Button
              variant={options?.destructive ? "destructive" : "default"}
              onClick={() => settle(true)}
            >
              {options?.confirmLabel ?? "确认"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ConfirmContext.Provider>
  )
}

/**
 * 无 Provider（例如单测里单独渲染某个面板）时回退到原生 `window.confirm`，
 * 行为一致且可被 `vi.spyOn(window, "confirm")` 覆盖。与 `useAdminProjects` 的
 * standalone 降级同一套思路：组件既能挂在壳里用，也能被单独测。
 */
const fallbackConfirm: ConfirmFn = (options) =>
  Promise.resolve(
    typeof window !== "undefined"
      ? window.confirm(
          [options.title, typeof options.description === "string" ? options.description : ""]
            .filter(Boolean)
            .join("\n"),
        )
      : false,
  )

/** 取到 `confirm`。挂在 {@link ConfirmDialogProvider} 内用弹窗，否则回退原生 confirm。 */
export function useConfirm(): ConfirmFn {
  return React.useContext(ConfirmContext) ?? fallbackConfirm
}
