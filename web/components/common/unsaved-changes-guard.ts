"use client"

import * as React from "react"

import { useConfirm } from "@/components/common/confirm-dialog"

type UnsavedChangesGuardOptions = {
  open: boolean
  /** 弹窗自己的受控开关。守卫只在确认放弃后才调它，因此拦截期间弹窗不会关。 */
  onOpenChange: (open: boolean) => void
  /**
   * 当前表单值，按 JSON 序列化后比较。传 `undefined` 等于不启用守卫。
   * 字段散在多个 useState 时内联组一个对象即可，只比较序列化结果，不看引用。
   */
  value: unknown
  /**
   * 基线标记。弹窗开着时它一变就把当前 value 重拍为基线。
   * 用于异步填表、或保存成功后不关闭的弹窗——把服务端数据落定时会换引用的那个
   * state 传进来即可；同步填表的弹窗不用管。
   */
  baselineKey?: unknown
}

/** 表单快照。undefined 归一成 null，避免"未启用"与"空表单"混淆。 */
function snapshot(value: unknown): string | null {
  return value === undefined ? null : JSON.stringify(value)
}

/**
 * 表单弹窗的"未保存改动"关闭守卫。
 *
 * 弹窗内容相对打开那一刻有变化时，遮罩点击、ESC、右上角 X、底部取消都先弹一次确认；
 * 没改动则原样放行。走「保存」成功后调用方直接 `setOpen(false)`，不经过这里，不会被打扰。
 *
 * 返回值直接接到 `<Dialog onOpenChange>` 与取消按钮上。
 */
export function useUnsavedChangesGuard({
  open,
  onOpenChange,
  value,
  baselineKey,
}: UnsavedChangesGuardOptions): (open: boolean) => void {
  const confirm = useConfirm()
  // 确认框已经开着时再点一次遮罩，不该叠出第二个：后者会顶掉前者的 resolver，
  // 让第一个 Promise 永远挂起。
  const confirmingRef = React.useRef(false)

  const current = snapshot(value)

  // 在渲染期同步拍基线（React 官方的"用 props 变化调整 state"模式），而不是放进
  // useEffect：各处 beginEdit 都是 setForm 与 setOpen(true) 同批次，此刻 value 已是
  // 目标记录；effect 要晚一帧，那一帧里基线还是上一条记录，会误判成"有改动"。
  const [tracked, setTracked] = React.useState({ open, baselineKey, baseline: current })
  if (tracked.open !== open || !Object.is(tracked.baselineKey, baselineKey)) {
    setTracked({ open, baselineKey, baseline: open ? current : tracked.baseline })
  }

  const dirty = open && current !== null && current !== tracked.baseline

  return React.useCallback(
    (next: boolean) => {
      if (next || !dirty) {
        onOpenChange(next)
        return
      }
      if (confirmingRef.current) {
        return
      }

      confirmingRef.current = true
      void confirm({
        title: "放弃未保存的修改？",
        description: "表单里有还没保存的改动，关闭后这些内容会丢失。",
        confirmLabel: "放弃修改",
        cancelLabel: "继续编辑",
        destructive: true,
      }).then((discard) => {
        confirmingRef.current = false
        if (discard) {
          onOpenChange(false)
        }
      })
    },
    [confirm, dirty, onOpenChange],
  )
}
