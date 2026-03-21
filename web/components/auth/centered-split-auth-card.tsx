import * as React from "react"

type CenteredSplitAuthCardProps = {
  left: React.ReactNode
  right: React.ReactNode
}

export function CenteredSplitAuthCard({ left, right }: CenteredSplitAuthCardProps) {
  return (
    <section className="rounded-3xl border border-slate-900/10 bg-white/75 p-4 shadow-2xl backdrop-blur-xl sm:p-6 lg:p-8 dark:border-white/15 dark:bg-black/35">
      <div className="grid gap-6 md:grid-cols-[1.05fr_0.95fr] md:items-stretch">
        <div className="rounded-2xl border border-slate-900/10 bg-white/80 p-6 dark:border-white/15 dark:bg-white/5">
          {left}
        </div>
        <div className="rounded-2xl border border-slate-900/10 bg-white/80 p-6 dark:border-white/15 dark:bg-white/5">
          {right}
        </div>
      </div>
    </section>
  )
}
