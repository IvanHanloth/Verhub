import * as React from "react"
import { FolderKanban, type LucideIcon } from "lucide-react"

type AdminPageHeaderProps = {
  title: string
  description: string
  badge?: string
  icon?: LucideIcon
  actions?: React.ReactNode
}

export function AdminPageHeader({
  title,
  description,
  badge = "Verhub Admin",
  icon: Icon = FolderKanban,
  actions,
}: AdminPageHeaderProps) {
  return (
    <section className="rounded-3xl border border-cyan-200/20 bg-white/8 p-6 shadow-2xl backdrop-blur-md">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-2">
          <p className="inline-flex items-center gap-2 rounded-full border border-cyan-200/25 bg-cyan-200/10 px-3 py-1 text-xs tracking-[0.16em] text-cyan-100 uppercase">
            <Icon className="size-3.5" />
            {badge}
          </p>
          <h1 className="text-2xl font-semibold sm:text-3xl">{title}</h1>
          <p className="max-w-3xl text-sm text-slate-200/90 sm:text-base">{description}</p>
        </div>
        {actions ? <div>{actions}</div> : null}
      </div>
    </section>
  )
}
