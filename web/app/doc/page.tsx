import type { Metadata } from "next"
import Link from "next/link"

import { ApiMethodBadge } from "@/components/docs/api-method-badge"
import { listApiEndpointDocs } from "@/lib/api-docs/registry"
import { toApiDocDisplayPath } from "@/lib/api-docs/utils"

type DocIndexPageProps = {
  searchParams?: {
    q?: string | string[]
  }
}

export const metadata: Metadata = {
  title: "API 文档总览",
  description: "查看 Verhub API 文档，按接口获取说明、参数、响应示例与在线调试入口。",
  alternates: {
    canonical: "/doc",
  },
  openGraph: {
    title: "Verhub API 文档总览",
    description: "查看 Verhub API 文档与在线调试入口。",
    url: "/doc",
    type: "website",
  },
}

export default function DocIndexPage({ searchParams }: DocIndexPageProps) {
  const rawKeyword = searchParams?.q
  const keyword = (Array.isArray(rawKeyword) ? (rawKeyword[0] ?? "") : (rawKeyword ?? ""))
    .trim()
    .toLowerCase()
  const docs = listApiEndpointDocs().filter((item) => {
    const displayPath = toApiDocDisplayPath(item.path)

    if (!keyword) {
      return true
    }

    const target =
      `${item.method} ${item.title} ${displayPath} ${item.module} ${item.description}`.toLowerCase()
    return target.includes(keyword)
  })

  return (
    <section className="space-y-5 rounded-2xl border border-slate-200 bg-white/80 p-5 shadow-sm dark:border-white/10 dark:bg-black/25">
      <header className="space-y-2">
        <h2 className="text-2xl font-bold">欢迎使用 Verhub API 文档</h2>
        <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">
          按模块查看接口说明。每个接口页提供请求参数、响应示例、鉴权方式和在线调试能力，便于联调与排错。
        </p>
      </header>

      <div className="grid gap-3 md:grid-cols-2">
        {docs.map((doc) => (
          <Link
            key={doc.id}
            href={
              keyword ? `/doc/${doc.slug}?q=${encodeURIComponent(keyword)}` : `/doc/${doc.slug}`
            }
            className="rounded-xl border border-slate-200 bg-white p-3 transition hover:-translate-y-0.5 hover:border-sky-400/60 hover:shadow-md dark:border-white/10 dark:bg-slate-950/40"
          >
            <div className="mb-2 flex items-center gap-2">
              <ApiMethodBadge method={doc.method} />
              <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                {doc.title}
              </span>
            </div>
            <p className="line-clamp-1 font-mono text-xs text-slate-500 dark:text-slate-400">
              {toApiDocDisplayPath(doc.path)}
            </p>
          </Link>
        ))}
      </div>

      {!docs.length ? (
        <p className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-600 dark:border-white/10 dark:text-slate-300">
          未搜索到匹配接口，请更换关键词。
        </p>
      ) : null}
    </section>
  )
}
