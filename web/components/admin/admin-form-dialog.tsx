"use client"

import * as React from "react"
import { Loader2 } from "lucide-react"

import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"

import { useUnsavedChangesGuard } from "@/components/common/unsaved-changes-guard"

type AdminFormDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  /** 主按钮文案，同时用于测试与无障碍定位，必须在页面内唯一。 */
  submitLabel: string
  submitIcon?: React.ReactNode
  submitting?: boolean
  submitDisabled?: boolean
  onSubmit: () => void
  /** 放在页脚左侧的辅助操作，如"清空表单"。 */
  footerExtra?: React.ReactNode
  /**
   * 当前表单值。传了就启用未保存改动确认：内容相对打开那一刻有变化时，
   * 关闭前先问一次。不传则维持原来的直接关闭。
   */
  formValue?: unknown
  className?: string
  children: React.ReactNode
}

/**
 * 后台新增/编辑表单的统一弹窗外壳。
 *
 * 包一层 form 而不是纯按钮：回车提交是长表单的默认预期，各处自己拼容易漏掉。
 */
export function AdminFormDialog({
  open,
  onOpenChange,
  title,
  description,
  submitLabel,
  submitIcon,
  submitting = false,
  submitDisabled = false,
  onSubmit,
  footerExtra,
  formValue,
  className = "sm:max-w-4xl",
  children,
}: AdminFormDialogProps) {
  const handleOpenChange = useUnsavedChangesGuard({ open, onOpenChange, value: formValue })

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className={className}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <form
          className="flex min-h-0 flex-1 flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault()
            onSubmit()
          }}
        >
          <DialogBody>
            <div className="grid gap-3">{children}</div>
          </DialogBody>

          <DialogFooter className="mt-0 sm:justify-between">
            <div className="flex flex-wrap gap-2">{footerExtra}</div>
            <div className="flex flex-wrap gap-2 sm:justify-end">
              <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
                取消
              </Button>
              <Button type="submit" disabled={submitting || submitDisabled}>
                {submitting ? <Loader2 className="size-4 animate-spin" /> : submitIcon}
                {submitLabel}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
