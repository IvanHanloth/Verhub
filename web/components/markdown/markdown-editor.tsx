"use client"

import * as React from "react"

import { MarkdownContent } from "@/components/markdown/markdown-content"

// 与 textarea 的 rows 对齐，让编辑/预览切换时容器高度不跳动
const ROW_HEIGHT_PX = 24
const VERTICAL_PADDING_PX = 16

/**
 * 带预览的 Markdown 输入框。展示页用 Markdown 渲染这些字段，编辑时必须能看到
 * 渲染结果，否则作者无法确认换行、列表、链接是否符合预期。
 */
export function MarkdownEditor({
  label,
  value,
  onChange,
  rows = 6,
  required,
  maxLength,
  placeholder,
  className,
}: MarkdownEditorProps) {
  const [previewing, setPreviewing] = React.useState(false)
  const fieldId = React.useId()

  const minHeight = rows * ROW_HEIGHT_PX + VERTICAL_PADDING_PX

  return (
    <div className="space-y-1 text-sm">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={fieldId} className="text-slate-700 dark:text-slate-300">
          {label}
        </label>
        <div className="flex items-center gap-1 text-xs">
          <button
            type="button"
            onClick={() => setPreviewing(false)}
            className={`rounded-md px-2 py-1 transition-colors ${
              previewing
                ? "text-slate-500 hover:bg-slate-900/5 dark:text-slate-400 dark:hover:bg-white/10"
                : "bg-slate-900/8 font-semibold text-slate-800 dark:bg-white/15 dark:text-slate-100"
            }`}
          >
            编写
          </button>
          <button
            type="button"
            onClick={() => setPreviewing(true)}
            className={`rounded-md px-2 py-1 transition-colors ${
              previewing
                ? "bg-slate-900/8 font-semibold text-slate-800 dark:bg-white/15 dark:text-slate-100"
                : "text-slate-500 hover:bg-slate-900/5 dark:text-slate-400 dark:hover:bg-white/10"
            }`}
          >
            预览
          </button>
        </div>
      </div>

      {previewing ? (
        <div
          className="overflow-y-auto rounded-xl border border-slate-900/20 bg-white/80 px-3 py-2 text-sm dark:border-white/20 dark:bg-white/10"
          style={{ minHeight }}
        >
          {value.trim() ? (
            <MarkdownContent>{value}</MarkdownContent>
          ) : (
            <p className="text-slate-400 dark:text-slate-500">暂无内容</p>
          )}
        </div>
      ) : (
        <textarea
          id={fieldId}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          rows={rows}
          required={required}
          maxLength={maxLength}
          placeholder={placeholder}
          className={className}
        />
      )}

      <p className="text-xs text-slate-400 dark:text-slate-500">支持 Markdown（GFM）语法</p>
    </div>
  )
}

type MarkdownEditorProps = {
  label: string
  value: string
  onChange: (value: string) => void
  rows?: number
  required?: boolean
  maxLength?: number
  placeholder?: string
  className?: string
}
