"use client"

import * as React from "react"

/**
 * 「标题 + 开关」的功能块，关着时只留标题行。
 *
 * GitHub 集成的每项功能都带一大段配置，全部摊开会把页面变成一面表单墙 ——
 * 没打开的功能其实没有任何要填的东西，收起来才看得清哪些是真正在用的。
 */
export function FeaturePanel({
  title,
  description,
  checked,
  onCheckedChange,
  disabled = false,
  disabledHint,
  badge,
  children,
}: {
  title: React.ReactNode
  description?: React.ReactNode
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  disabled?: boolean
  /** 因实例级未启用等原因不可操作时，替代 description 显示的说明。 */
  disabledHint?: React.ReactNode
  badge?: React.ReactNode
  children?: React.ReactNode
}) {
  return (
    <section className="rounded-xl border border-slate-900/15 bg-slate-50/60 dark:border-white/15 dark:bg-white/5">
      <label className="flex cursor-pointer items-start gap-2.5 p-4">
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(event) => onCheckedChange(event.target.checked)}
          className="mt-0.5 size-4 shrink-0"
        />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2 text-sm font-semibold">
            {title}
            {badge}
          </span>
          <span className="mt-1 block text-xs text-slate-600 dark:text-slate-400">
            {disabled && disabledHint ? disabledHint : description}
          </span>
        </span>
      </label>

      {checked && children ? (
        <div className="space-y-3 border-t border-slate-900/10 p-4 dark:border-white/10">
          {children}
        </div>
      ) : null}
    </section>
  )
}

/** 卡片内的小节标题。用 div 而不是 header：admin 主题会把 header 画成一张圆角卡片。 */
export function SectionHeading({
  title,
  description,
  icon,
  actions,
}: {
  title: React.ReactNode
  description?: React.ReactNode
  icon?: React.ReactNode
  actions?: React.ReactNode
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0 space-y-1">
        <h2 className="flex items-center gap-2 text-base font-semibold">
          {icon}
          {title}
        </h2>
        {description ? (
          <p className="max-w-3xl text-xs text-slate-600 dark:text-slate-400">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  )
}
