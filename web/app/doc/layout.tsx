import type { Metadata } from "next"
import { Suspense } from "react"

import { DocHeader } from "@/components/docs/doc-header"
import { ApiSidebar } from "@/components/docs/api-sidebar"

export const metadata: Metadata = {
  title: "Verhub API Docs",
  description: "Verhub 对外 API 文档与管理 API 文档中心",
}

export default function DocLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-svh bg-[radial-gradient(circle_at_12%_10%,rgba(14,165,233,0.12),transparent_34%),radial-gradient(circle_at_88%_0%,rgba(249,115,22,0.1),transparent_32%),linear-gradient(180deg,#f8fafc_0%,#f1f5f9_100%)] text-slate-900 dark:bg-[radial-gradient(circle_at_12%_10%,rgba(14,165,233,0.15),transparent_34%),radial-gradient(circle_at_88%_0%,rgba(249,115,22,0.1),transparent_32%),linear-gradient(180deg,#020617_0%,#020617_100%)] dark:text-slate-50">
      <Suspense
        fallback={
          <div className="h-[74px] border-b border-slate-200/80 bg-white/70 dark:border-white/10 dark:bg-black/30" />
        }
      >
        <DocHeader />
      </Suspense>

      <div className="mx-auto grid w-full max-w-[1700px] gap-4 px-4 py-4 md:grid-cols-[300px_minmax(0,1fr)] md:px-6">
        <div className="hidden md:block">
          <Suspense
            fallback={
              <div className="h-[calc(100svh-6rem)] rounded-2xl border border-slate-200 bg-white/70 p-4 shadow-sm backdrop-blur dark:border-white/10 dark:bg-black/25" />
            }
          >
            <ApiSidebar />
          </Suspense>
        </div>
        <main className="min-w-0">{children}</main>
      </div>
    </div>
  )
}
