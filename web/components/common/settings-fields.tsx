"use client"

import * as React from "react"
import { Copy } from "lucide-react"

import { Button } from "@workspace/ui/components/button"

import { copyToClipboard } from "@/lib/clipboard"

/**
 * 后台设置类界面的公共零件。
 *
 * GitHub 集成、AI 翻译两个实例级设置页与项目级集成弹窗长得几乎一样，之前各写各的
 * label + input + 类名字符串，改一处样式要翻四个文件。这里只收真正重复的部分，
 * 不做通用设计系统 —— 列表与内容表单用的是另一套 rounded-xl 风格，不在这里统一。
 */

export const FIELD_CLASS =
  "w-full rounded-lg border border-slate-900/20 bg-white/80 px-3 py-2 text-sm disabled:opacity-60 dark:border-white/20 dark:bg-white/10"

export const MONO_FIELD_CLASS =
  "w-full rounded-lg border border-slate-900/20 bg-white/80 px-3 py-2 font-mono text-xs leading-6 disabled:opacity-60 dark:border-white/20 dark:bg-white/10"

/** 标题在上、控件在下的一栏表单项。控件自带 label 语义时传 as="div"。 */
export function LabeledField({
  label,
  hint,
  as: Tag = "label",
  children,
}: {
  label: React.ReactNode
  /** 控件下方的补充说明。 */
  hint?: React.ReactNode
  as?: "label" | "div"
  children: React.ReactNode
}) {
  return (
    <Tag className="block space-y-1 text-sm">
      <span className="text-slate-700 dark:text-slate-300">{label}</span>
      {children}
      {hint ? (
        <span className="block text-xs text-slate-500 dark:text-slate-400">{hint}</span>
      ) : null}
    </Tag>
  )
}

/** LabeledField + 单行输入框，本模块里最高频的组合。 */
export function TextField({
  label,
  hint,
  value,
  onChange,
  placeholder,
  maxLength,
  mono = false,
}: {
  label: React.ReactNode
  hint?: React.ReactNode
  value: string
  onChange: (value: string) => void
  placeholder?: string
  maxLength?: number
  mono?: boolean
}) {
  return (
    <LabeledField label={label} hint={hint}>
      <input
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        maxLength={maxLength}
        className={mono ? MONO_FIELD_CLASS : FIELD_CLASS}
      />
    </LabeledField>
  )
}

/** 分段控件里的一个按钮。选项卡与「编辑 / 预览」切换共用。 */
export function SegmentedButton({
  active,
  onClick,
  icon,
  label,
  role,
  grow = false,
}: {
  active: boolean
  onClick: () => void
  icon?: React.ReactNode
  label: React.ReactNode
  /** 传 "tab" 时按 tab 语义暴露选中态，否则用 aria-pressed。 */
  role?: "tab"
  grow?: boolean
}) {
  return (
    <button
      type="button"
      role={role}
      {...(role === "tab" ? { "aria-selected": active } : { "aria-pressed": active })}
      onClick={onClick}
      className={`inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 ${
        grow ? "flex-1" : ""
      } ${
        active
          ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
          : "text-slate-600 hover:bg-slate-900/5 dark:text-slate-300 dark:hover:bg-white/10"
      }`}
    >
      {icon}
      {label}
    </button>
  )
}

/** 分段控件的外框。 */
export function SegmentedGroup({
  role,
  className,
  children,
}: {
  role?: "tablist"
  className?: string
  children: React.ReactNode
}) {
  return (
    <div
      role={role}
      className={`inline-flex gap-1 rounded-lg border border-slate-900/15 bg-slate-50/60 p-1 text-xs dark:border-white/15 dark:bg-white/5 ${className ?? ""}`}
    >
      {children}
    </div>
  )
}

const BADGE_TONES = {
  ok: "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300",
  warn: "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-300",
  error: "border-rose-500/40 bg-rose-500/10 text-rose-600 dark:text-rose-300",
} as const

export function StatusBadge({
  tone,
  children,
}: {
  tone: keyof typeof BADGE_TONES
  children: React.ReactNode
}) {
  return (
    <span className={`rounded-md border px-2 py-0.5 text-xs font-medium ${BADGE_TONES[tone]}`}>
      {children}
    </span>
  )
}

/** 只读地址 + 复制按钮。Payload URL / Webhook URL 都是这个形状。 */
export function CopyableUrl({
  label,
  url,
  copiedMessage,
}: {
  label: React.ReactNode
  url: string
  copiedMessage: string
}) {
  return (
    <div className="space-y-1 text-sm">
      <span className="text-slate-700 dark:text-slate-300">{label}</span>
      <div className="flex items-center gap-2">
        <code className="flex-1 truncate rounded-lg border border-slate-900/15 bg-white/70 px-2 py-1.5 text-xs dark:border-white/15 dark:bg-white/10">
          {url}
        </code>
        <Button
          type="button"
          variant="outline"
          onClick={() => void copyToClipboard(url, copiedMessage)}
        >
          <Copy className="size-4" />
          复制
        </Button>
      </div>
    </div>
  )
}
