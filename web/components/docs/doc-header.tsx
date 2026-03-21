"use client"

import Link from "next/link"
import * as React from "react"
import { Moon, Search, Sun } from "lucide-react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useTheme } from "next-themes"

export function DocHeader() {
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const { resolvedTheme, setTheme } = useTheme()

  const [keyword, setKeyword] = React.useState(searchParams.get("q") ?? "")

  React.useEffect(() => {
    setKeyword(searchParams.get("q") ?? "")
  }, [searchParams])

  function updateKeyword(value: string) {
    setKeyword(value)

    const next = new URLSearchParams(searchParams.toString())
    const trimmed = value.trim()
    if (trimmed) {
      next.set("q", trimmed)
    } else {
      next.delete("q")
    }

    const query = next.toString()
    router.replace(query ? `${pathname}?${query}` : pathname)
  }

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/70 backdrop-blur dark:border-white/10 dark:bg-black/30">
      <div className="mx-auto flex w-full max-w-[1700px] flex-col gap-3 px-4 py-4 md:flex-row md:items-center md:justify-between md:px-6">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <Link
            href="/doc"
            className="shrink-0 text-lg font-bold text-slate-900 dark:text-slate-50"
          >
            API 文档中心
          </Link>
          <label className="relative w-full max-w-xl">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
            <input
              value={keyword}
              onChange={(event) => updateKeyword(event.target.value)}
              placeholder="搜索 API（名称、路径、方法）"
              className="w-full rounded-lg border border-slate-300 bg-white py-2 pr-3 pl-9 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-sky-300 dark:border-white/20 dark:bg-slate-900 dark:text-slate-100"
            />
          </label>
        </div>

        <div className="flex items-center justify-end gap-2">
          <Link
            href="/"
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 transition hover:bg-slate-100 dark:border-white/20 dark:text-slate-100 dark:hover:bg-white/10"
          >
            首页
          </Link>
          <button
            type="button"
            onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
            className="inline-flex size-9 items-center justify-center rounded-lg border border-slate-300 text-slate-700 transition hover:bg-slate-100 dark:border-white/20 dark:text-slate-100 dark:hover:bg-white/10"
            aria-label="切换配色"
            title="切换配色"
          >
            {resolvedTheme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
          </button>
        </div>
      </div>
    </header>
  )
}
