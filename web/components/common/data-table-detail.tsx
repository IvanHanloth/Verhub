"use client"

import * as React from "react"
import { Check, ChevronLeft, ChevronRight, Copy } from "lucide-react"

import { Button } from "@workspace/ui/components/button"
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@workspace/ui/components/sheet"

import { DataTableCellVariantProvider } from "./data-table-cell-context"

/**
 * 行详情抽屉。
 *
 * 表格单元格一律截成一行，长内容（反馈正文、日志正文、发布说明）在列表里注定看不全；
 * 这里是唯一把一行数据摊开的地方——所有字段（含默认隐藏的列）、完整正文、JSON 全树。
 *
 * 字段由调用方按列算好后传进来，本组件只负责版式：抽屉不该知道 TanStack 的列模型，
 * 否则就和表格组件绕成了循环依赖。
 */

export type DataTableDetailField = {
  id: string
  label: React.ReactNode
  content: React.ReactNode
}

type DataTableDetailSheetProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: React.ReactNode
  fields: DataTableDetailField[]
  /** 列覆盖不到的补充内容，排在字段表之后。 */
  extra?: React.ReactNode
  /** 当前行在本页中的位置，从 1 开始。 */
  position?: { index: number; total: number }
  onPrev?: () => void
  onNext?: () => void
  hasPrev?: boolean
  hasNext?: boolean
}

/** 复制整份详情。取渲染后的纯文本，省得为每种单元格再定义一遍「原始值」。 */
function CopyDetailButton({ bodyRef }: { bodyRef: React.RefObject<HTMLDivElement | null> }) {
  const [copied, setCopied] = React.useState(false)

  async function copy() {
    const node = bodyRef.current
    if (!node) {
      return
    }

    try {
      await navigator.clipboard.writeText(node.innerText || node.textContent || "")
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      // 非安全上下文下剪贴板不可用；内容本来就能手工选中，不值得报错。
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() => void copy()}
      aria-label="复制详情"
    >
      {copied ? <Check className="size-4 text-emerald-500" /> : <Copy className="size-4" />}
      {copied ? "已复制" : "复制"}
    </Button>
  )
}

/** 左右方向键翻行。焦点在输入控件里时不接管，否则抽屉里没法编辑文本。 */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false
  }

  return (
    target.isContentEditable ||
    ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) ||
    target.getAttribute("role") === "textbox"
  )
}

export function DataTableDetailSheet({
  open,
  onOpenChange,
  title,
  fields,
  extra,
  position,
  onPrev,
  onNext,
  hasPrev = false,
  hasNext = false,
}: DataTableDetailSheetProps) {
  const bodyRef = React.useRef<HTMLDivElement>(null)

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (isTypingTarget(event.target)) {
      return
    }

    if (event.key === "ArrowLeft" && hasPrev) {
      event.preventDefault()
      onPrev?.()
    }

    if (event.key === "ArrowRight" && hasNext) {
      event.preventDefault()
      onNext?.()
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        onKeyDown={handleKeyDown}
        className="w-full max-w-[min(720px,95vw)] sm:max-w-[min(720px,95vw)]"
      >
        <SheetHeader>
          <SheetTitle className="truncate text-base font-semibold">{title}</SheetTitle>
          <SheetDescription>
            这一行的全部字段，包含列表里默认隐藏的列；长文本在这里完整展开。
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-wrap items-center gap-2 border-b border-slate-900/10 pb-3 dark:border-white/10">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!hasPrev}
            onClick={onPrev}
            aria-label="上一条"
          >
            <ChevronLeft className="size-4" />
            上一条
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!hasNext}
            onClick={onNext}
            aria-label="下一条"
          >
            下一条
            <ChevronRight className="size-4" />
          </Button>
          {position ? (
            <span className="text-xs text-slate-500 tabular-nums dark:text-slate-400">
              本页第 {position.index}/{position.total} 条
            </span>
          ) : null}
          <div className="ml-auto">
            <CopyDetailButton bodyRef={bodyRef} />
          </div>
        </div>

        <SheetBody className="-mr-2 pr-2">
          <div ref={bodyRef} className="space-y-4">
            <DataTableCellVariantProvider variant="detail">
              <dl className="divide-y divide-slate-900/8 dark:divide-white/8">
                {fields.map((field) => (
                  <div
                    key={field.id}
                    className="grid gap-1 py-2.5 sm:grid-cols-[10rem_minmax(0,1fr)] sm:gap-4"
                  >
                    <dt className="text-xs text-slate-500 dark:text-slate-400">{field.label}</dt>
                    <dd className="min-w-0 text-sm text-slate-800 dark:text-slate-100">
                      {field.content}
                    </dd>
                  </div>
                ))}
              </dl>

              {extra}
            </DataTableCellVariantProvider>
          </div>
        </SheetBody>
      </SheetContent>
    </Sheet>
  )
}
