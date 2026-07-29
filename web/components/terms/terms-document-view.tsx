import Link from "next/link"

import { ThemeLogo } from "@/components/branding/theme-logo"
import { MarkdownContent } from "@/components/markdown/markdown-content"
import type { TermsDocument, TermsDocumentSummary } from "@/lib/terms-api"

/**
 * 条款页按 UTC 日期显示「最后更新」。
 *
 * 这一页由 SSR 渲染后直接水合，用 toLocaleString 会让服务端与浏览器所在时区
 * 各算一份，触发 hydration mismatch；条款只需要精确到天，固定成一种写法即可。
 */
function formatUtcDate(seconds: number): string {
  const date = new Date(seconds * 1000)
  const month = `${date.getUTCMonth() + 1}`.padStart(2, "0")
  const day = `${date.getUTCDate()}`.padStart(2, "0")
  return `${date.getUTCFullYear()}-${month}-${day}`
}

/**
 * 条款正文的排版覆盖。
 *
 * MarkdownContent 的默认尺寸是给卡片内摘要用的，整页长条款照搬会又小又窄：
 * 这里按文档比例放大标题与正文，并把一级标题居中当作文档题名。表格自身带
 * 横向滚动，窄屏下不会把页面撑出横向滚动条。
 */
const DOCUMENT_TYPOGRAPHY = [
  "text-[15px] leading-8 sm:text-base sm:leading-8 lg:text-[17px] lg:leading-9",
  "[&_h1]:mt-0 [&_h1]:mb-8 [&_h1]:text-center [&_h1]:text-2xl [&_h1]:leading-normal sm:[&_h1]:text-3xl",
  "[&_h2]:mt-9 [&_h2]:mb-3 [&_h2]:text-xl sm:[&_h2]:text-[22px]",
  "[&_h3]:mt-6 [&_h3]:mb-2 [&_h3]:text-lg",
  "[&_p]:my-4 [&_p]:leading-8 lg:[&_p]:leading-9",
  "[&_li]:leading-8 lg:[&_li]:leading-9 [&_ul]:my-4 [&_ol]:my-4",
  "[&_table]:text-[14px] lg:[&_table]:text-[15px]",
].join(" ")

export function TermsDocumentView({
  document,
  documents,
  activeSlug,
}: {
  document: TermsDocument | null
  documents: TermsDocumentSummary[]
  activeSlug: string
}) {
  return (
    <div className="min-h-svh bg-[radial-gradient(circle_at_12%_10%,rgba(14,165,233,0.12),transparent_34%),radial-gradient(circle_at_88%_0%,rgba(249,115,22,0.1),transparent_32%),linear-gradient(180deg,#f8fafc_0%,#f1f5f9_100%)] text-slate-900 dark:bg-[radial-gradient(circle_at_12%_10%,rgba(14,165,233,0.15),transparent_34%),radial-gradient(circle_at_88%_0%,rgba(249,115,22,0.1),transparent_32%),linear-gradient(180deg,#020617_0%,#020617_100%)] dark:text-slate-50">
      <header className="border-b border-slate-200/80 bg-white/70 backdrop-blur dark:border-white/10 dark:bg-black/30">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6 xl:max-w-6xl">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-lg font-bold text-slate-900 dark:text-slate-50"
          >
            <ThemeLogo imgClassName="h-7 w-auto" alt="Verhub" />
            Verhub
          </Link>
          <Link
            href="/"
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 transition hover:bg-slate-100 dark:border-white/20 dark:text-slate-100 dark:hover:bg-white/10"
          >
            返回首页
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-10 xl:max-w-6xl">
        {documents.length > 1 ? (
          <nav className="mb-6 flex flex-wrap gap-2">
            {documents.map((item) => {
              const active = item.slug === activeSlug
              return (
                <Link
                  key={item.slug}
                  href={`/terms/${item.slug}`}
                  aria-current={active ? "page" : undefined}
                  className={`rounded-xl border px-3 py-1.5 text-sm transition ${
                    active
                      ? "border-[#e6662a]/45 bg-[#e6662a]/10 text-[#cb5f22] dark:text-[#ffa66f]"
                      : "border-slate-300 text-slate-600 hover:bg-slate-100 dark:border-white/20 dark:text-slate-300 dark:hover:bg-white/10"
                  }`}
                >
                  {item.title}
                </Link>
              )
            })}
          </nav>
        ) : null}

        {document ? (
          <article className="rounded-2xl border border-slate-200 bg-white/80 px-5 py-8 shadow-sm backdrop-blur sm:px-10 sm:py-12 lg:px-16 dark:border-white/10 dark:bg-black/25">
            <MarkdownContent className={DOCUMENT_TYPOGRAPHY}>{document.content}</MarkdownContent>

            <p className="mt-10 border-t border-slate-900/10 pt-5 text-sm text-slate-500 dark:border-white/10 dark:text-slate-400">
              最后更新：{formatUtcDate(document.updated_at)}（UTC）
            </p>
          </article>
        ) : (
          <p className="rounded-2xl border border-slate-200 bg-white/80 p-6 text-sm text-slate-600 dark:border-white/10 dark:bg-black/25 dark:text-slate-300">
            暂时无法加载该文档，请稍后重试。
          </p>
        )}
      </main>
    </div>
  )
}
