import * as React from "react"

import { AdminItemCard } from "@/components/admin/admin-card"

type ManagementListItemProps = {
  title: React.ReactNode
  subtitle?: React.ReactNode
  meta?: React.ReactNode
  content?: React.ReactNode
  actions?: React.ReactNode
  children?: React.ReactNode
  className?: string
}

export function ManagementListItem({
  title,
  subtitle,
  meta,
  content,
  actions,
  children,
  className,
}: ManagementListItemProps) {
  return (
    <AdminItemCard className={className}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-base font-medium text-slate-900 dark:text-slate-100">{title}</p>
          {subtitle ? (
            <div className="text-xs text-slate-600 dark:text-slate-300">{subtitle}</div>
          ) : null}
          {meta ? <div className="text-xs text-slate-600 dark:text-slate-300">{meta}</div> : null}
          {content ? (
            <div className="text-sm text-slate-700 dark:text-slate-200/90">{content}</div>
          ) : null}
          {children}
        </div>

        {actions ? <div className="flex flex-wrap justify-end gap-2">{actions}</div> : null}
      </div>
    </AdminItemCard>
  )
}
