import Link from "next/link"

import { ApiMethodBadge } from "@/components/docs/api-method-badge"
import { listApiEndpointDocs } from "@/lib/api-docs/registry"

type DocIndexPageProps = {
  searchParams?: {
    q?: string | string[]
  }
}

export default function DocIndexPage({ searchParams }: DocIndexPageProps) {
  const rawKeyword = searchParams?.q
  const keyword = (Array.isArray(rawKeyword) ? (rawKeyword[0] ?? "") : (rawKeyword ?? ""))
    .trim()
    .toLowerCase()
  const docs = listApiEndpointDocs().filter((item) => {
    if (!keyword) {
      return true
    }

    const target =
      `${item.method} ${item.title} ${item.path} ${item.module} ${item.description}`.toLowerCase()
    return target.includes(keyword)
  })

  return (
    <section className="space-y-5 rounded-2xl border border-slate-200 bg-white/80 p-5 shadow-sm dark:border-white/10 dark:bg-black/25">
      <header className="space-y-2">
        <h2 className="text-2xl font-bold">欢迎使用 Verhub API 文档</h2>
        <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">
          文档覆盖全部公开 API，以及对外常用管理
          API（如新增版本、删除版本、新增公告等）。每个接口均提供独立页面，包含请求参数、响应体与在线调试能力。
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
              {doc.path}
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
