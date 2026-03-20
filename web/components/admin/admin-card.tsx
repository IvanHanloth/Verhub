import * as React from "react"

import { cn } from "@workspace/ui/lib/utils"

type BaseProps = {
  as?: "section" | "article" | "div" | "header"
  className?: string
  children: React.ReactNode
}

export function AdminCard({ as = "article", className, children }: BaseProps) {
  const Comp = as

  return <Comp className={cn("admin-card p-5", className)}>{children}</Comp>
}

export function AdminItemCard({ as = "article", className, children }: BaseProps) {
  const Comp = as

  return (
    <Comp
      className={cn(
        "rounded-2xl border border-slate-900/10 bg-white/80 p-4 dark:border-white/15 dark:bg-white/8",
        className,
      )}
    >
      {children}
    </Comp>
  )
}
