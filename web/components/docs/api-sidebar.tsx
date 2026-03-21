"use client"

import Link from "next/link"
import { useSearchParams } from "next/navigation"

import { listApiEndpointDocs } from "@/lib/api-docs/registry"

import { ApiMethodBadge } from "./api-method-badge"

type Props = {
  activeSlug?: string
}

export function ApiSidebar({ activeSlug }: Props) {
  const searchParams = useSearchParams()
  const keyword = (searchParams.get("q") ?? "").trim().toLowerCase()

  const docs = listApiEndpointDocs().filter((item) => {
    if (!keyword) {
      return true
    }

    const target =
      `${item.method} ${item.title} ${item.path} ${item.module} ${item.description}`.toLowerCase()
    return target.includes(keyword)
  })
  const groups = docs.reduce<Record<string, typeof docs>>((acc, item) => {
    const current = acc[item.module] ?? []
    acc[item.module] = [...current, item]
    return acc
  }, {})

  return (
    <aside className="sticky top-20 h-[calc(100svh-6rem)] overflow-y-auto rounded-2xl border border-slate-200 bg-white/70 p-4 shadow-sm backdrop-blur dark:border-white/10 dark:bg-black/25">
      <h2 className="mb-3 text-sm font-semibold tracking-wide text-slate-600 uppercase dark:text-slate-300">
        API 目录
      </h2>
      <div className="space-y-5">
        {Object.entries(groups).map(([groupName, items]) => (
          <section key={groupName} className="space-y-2">
            <p className="text-xs font-semibold text-slate-500 uppercase dark:text-slate-400">
              {groupName}
            </p>
            <ul className="space-y-1">
              {items.map((item) => {
                const active = item.slug === activeSlug

                return (
                  <li key={item.id}>
                    <Link
                      href={
                        keyword
                          ? `/doc/${item.slug}?q=${encodeURIComponent(keyword)}`
                          : `/doc/${item.slug}`
                      }
                      className={`block rounded-lg border px-2 py-2 transition ${active ? "border-sky-500/60 bg-sky-50 text-sky-800 dark:border-sky-400/50 dark:bg-sky-500/15 dark:text-sky-200" : "border-transparent bg-transparent text-slate-700 hover:border-slate-200 hover:bg-slate-100 dark:text-slate-200 dark:hover:border-white/10 dark:hover:bg-white/5"}`}
                    >
                      <div className="mb-1 flex items-center gap-2">
                        <ApiMethodBadge method={item.method} />
                        <span className="line-clamp-1 text-sm font-medium">{item.title}</span>
                      </div>
                      <p className="line-clamp-1 font-mono text-[11px] text-slate-500 dark:text-slate-400">
                        {item.path}
                      </p>
                    </Link>
                  </li>
                )
              })}
            </ul>
          </section>
        ))}
      </div>

      {!docs.length ? (
        <p className="mt-4 rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-500 dark:border-white/10 dark:text-slate-300">
          未找到匹配 API，请尝试更换关键词。
        </p>
      ) : null}
    </aside>
  )
}
