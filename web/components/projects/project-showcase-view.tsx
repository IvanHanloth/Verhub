"use client"

import * as React from "react"
import Link from "next/link"
import { ChevronLeft, ChevronRight, ExternalLink, Globe, UserRound } from "lucide-react"

import type { AnnouncementItem } from "@/lib/announcements-api"
import type { ProjectItem } from "@/lib/projects-api"
import type { VersionItem } from "@/lib/versions-api"

type ProjectShowcaseViewProps = {
  project: ProjectItem
  versions: VersionItem[]
  announcements: AnnouncementItem[]
}

function formatPublishTime(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleString("zh-CN")
}

function getFieldRows(
  project: ProjectItem,
): Array<{ label: string; value: string; href?: string }> {
  const rows: Array<{ label: string; value: string; href?: string }> = []

  if (project.author) {
    rows.push({ label: "作者", value: project.author })
  }

  if (project.published_at) {
    rows.push({ label: "公开时间", value: formatPublishTime(project.published_at) })
  }

  if (project.website_url) {
    rows.push({ label: "官网", value: project.website_url, href: project.website_url })
  }

  if (project.repo_url) {
    rows.push({ label: "仓库", value: project.repo_url, href: project.repo_url })
  }

  if (project.author_homepage_url) {
    rows.push({
      label: "作者主页",
      value: project.author_homepage_url,
      href: project.author_homepage_url,
    })
  }

  return rows
}

export function ProjectShowcaseView({
  project,
  versions,
  announcements,
}: ProjectShowcaseViewProps) {
  const [activeAnnouncementIndex, setActiveAnnouncementIndex] = React.useState(0)
  const [paused, setPaused] = React.useState(false)

  const latestVersion = React.useMemo(() => {
    const latest = versions.find((item) => item.is_latest)
    if (latest) {
      return latest
    }

    return versions.length > 0 ? versions[0] : null
  }, [versions])

  const projectRows = React.useMemo(() => getFieldRows(project), [project])

  React.useEffect(() => {
    if (announcements.length <= 1 || paused) {
      return
    }

    const timer = window.setInterval(() => {
      setActiveAnnouncementIndex((prev) => (prev + 1) % announcements.length)
    }, 3500)

    return () => window.clearInterval(timer)
  }, [announcements.length, paused])

  const stackedAnnouncements = React.useMemo(() => {
    if (announcements.length === 0) {
      return []
    }

    return [0, 1, 2]
      .map((offset) => {
        const index = (activeAnnouncementIndex + offset) % announcements.length
        const item = announcements[index]
        if (!item) {
          return null
        }

        return {
          item,
          offset,
          index,
        }
      })
      .filter(
        (entry): entry is { item: AnnouncementItem; offset: number; index: number } =>
          entry !== null,
      )
  }, [activeAnnouncementIndex, announcements])

  function moveAnnouncement(step: number) {
    if (announcements.length === 0) {
      return
    }

    setActiveAnnouncementIndex((prev) => {
      const next = (prev + step + announcements.length) % announcements.length
      return next
    })
  }

  return (
    <main className="min-h-svh bg-[#f4f1ea] px-4 py-8 text-slate-900 sm:px-8 dark:bg-[#050812] dark:text-slate-100">
      <section className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <header className="relative overflow-hidden rounded-[2rem] border border-slate-900/10 bg-[linear-gradient(130deg,#ffffff_0%,#efe8d9_100%)] p-6 shadow-[0_30px_80px_-48px_rgba(15,23,42,0.7)] sm:p-9 dark:border-white/10 dark:bg-[linear-gradient(130deg,#121826_0%,#0a0f1e_100%)]">
          <div className="pointer-events-none absolute -right-24 -bottom-32 h-72 w-72 rounded-full bg-[#e86d2f]/20 blur-3xl" />
          <div className="pointer-events-none absolute -top-24 -left-28 h-72 w-72 rounded-full bg-[#2f8b85]/15 blur-3xl" />

          <div className="relative flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex items-start gap-4">
              <div className="size-20 shrink-0 overflow-hidden rounded-2xl border border-slate-900/10 bg-white/85 dark:border-white/15 dark:bg-white/10">
                {project.icon_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={project.icon_url}
                    alt={project.name}
                    className="size-full object-cover"
                  />
                ) : (
                  <div className="flex size-full items-center justify-center text-3xl font-bold text-slate-700 dark:text-white/80">
                    {project.name.slice(0, 1).toUpperCase()}
                  </div>
                )}
              </div>

              <div>
                <p className="inline-flex rounded-full border border-slate-900/10 bg-white/70 px-3 py-1 text-xs tracking-[0.16em] text-slate-700 uppercase dark:border-white/15 dark:bg-white/10 dark:text-slate-300">
                  Project Showcase
                </p>
                <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-5xl">
                  {project.name}
                </h1>
                {project.description ? (
                  <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-700 sm:text-base dark:text-slate-300">
                    {project.description}
                  </p>
                ) : null}
              </div>
            </div>

            {latestVersion ? (
              <div className="w-full max-w-xs rounded-2xl border border-[#e86d2f]/25 bg-white/75 p-4 dark:bg-black/25">
                <p className="text-xs tracking-[0.18em] text-slate-600 uppercase dark:text-slate-300">
                  Latest release
                </p>
                <p className="mt-2 text-3xl font-semibold">{latestVersion.version}</p>
                <p className="mt-2 text-xs text-slate-600 dark:text-slate-400">
                  发布于 {formatPublishTime(latestVersion.published_at)}
                </p>
              </div>
            ) : null}
          </div>

          {projectRows.length > 0 ? (
            <div className="relative mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {projectRows.map((row) => (
                <div
                  key={row.label}
                  className="rounded-xl border border-slate-900/10 bg-white/80 p-3 dark:border-white/10 dark:bg-black/20"
                >
                  <p className="mb-1 inline-flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                    {row.label === "作者" ? <UserRound className="size-3.5" /> : null}
                    {row.label === "官网" || row.label === "作者主页" ? (
                      <Globe className="size-3.5" />
                    ) : null}
                    {row.label}
                  </p>
                  {row.href ? (
                    <a
                      href={row.href}
                      target="_blank"
                      rel="noreferrer"
                      className="line-clamp-1 text-sm font-medium text-[#cb5f22] hover:underline dark:text-[#ffa66f]"
                    >
                      {row.value}
                    </a>
                  ) : (
                    <p className="line-clamp-1 text-sm font-medium">{row.value}</p>
                  )}
                </div>
              ))}
            </div>
          ) : null}
        </header>

        <section className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
          <article
            className="rounded-[1.75rem] border border-slate-900/10 bg-white/80 p-5 shadow-[0_25px_60px_-45px_rgba(15,23,42,0.6)] dark:border-white/10 dark:bg-white/5"
            onMouseEnter={() => setPaused(true)}
            onMouseLeave={() => setPaused(false)}
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold">公告动态</h2>
              {announcements.length > 1 ? (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    className="rounded-lg border border-slate-900/15 p-1.5 hover:bg-slate-900/5 dark:border-white/20 dark:hover:bg-white/10"
                    onClick={() => moveAnnouncement(-1)}
                    aria-label="上一条公告"
                  >
                    <ChevronLeft className="size-4" />
                  </button>
                  <button
                    type="button"
                    className="rounded-lg border border-slate-900/15 p-1.5 hover:bg-slate-900/5 dark:border-white/20 dark:hover:bg-white/10"
                    onClick={() => moveAnnouncement(1)}
                    aria-label="下一条公告"
                  >
                    <ChevronRight className="size-4" />
                  </button>
                </div>
              ) : null}
            </div>

            {announcements.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-900/15 p-8 text-center text-sm text-slate-500 dark:border-white/15 dark:text-slate-400">
                当前暂无公告
              </div>
            ) : (
              <>
                <div className="relative h-72">
                  {stackedAnnouncements.map(({ item, offset, index }) => {
                    const transformByOffset = [
                      "translate-y-0 scale-100 opacity-100",
                      "translate-y-3 scale-[0.975] opacity-80",
                      "translate-y-6 scale-[0.95] opacity-55",
                    ]
                    const zByOffset = ["z-30", "z-20", "z-10"]

                    const transformClass = transformByOffset[offset] ?? transformByOffset[2]
                    const zClass = zByOffset[offset] ?? zByOffset[2]

                    return (
                      <article
                        key={item.id}
                        className={`absolute inset-0 rounded-2xl border border-slate-900/10 bg-[linear-gradient(160deg,rgba(255,255,255,0.95),rgba(242,232,213,0.75))] p-4 shadow-sm transition-all duration-500 dark:border-white/10 dark:bg-[linear-gradient(160deg,rgba(255,255,255,0.08),rgba(255,255,255,0.02))] ${transformClass} ${zClass}`}
                        aria-hidden={offset > 0 ? "true" : undefined}
                      >
                        <div className="mb-3 flex items-center gap-2">
                          <span className="rounded-full bg-[#e86d2f]/15 px-2 py-1 text-xs font-medium text-[#b7511c] dark:text-[#ffbc96]">
                            {item.is_pinned ? "置顶公告" : "公告"}
                          </span>
                          <span className="text-xs text-slate-500 dark:text-slate-400">
                            #{index + 1}
                          </span>
                        </div>
                        <h3 className="line-clamp-2 text-lg font-semibold">{item.title}</h3>
                        <p className="mt-2 line-clamp-6 text-sm leading-6 text-slate-700 dark:text-slate-300">
                          {item.content}
                        </p>
                        <p className="mt-4 text-xs text-slate-500 dark:text-slate-400">
                          {formatPublishTime(item.published_at)}
                        </p>
                      </article>
                    )
                  })}
                </div>

                {announcements.length > 1 ? (
                  <div className="mt-4 flex items-center justify-center gap-1.5">
                    {announcements.map((announcement, index) => {
                      const active = index === activeAnnouncementIndex
                      return (
                        <button
                          key={announcement.id}
                          type="button"
                          className={`h-2 rounded-full transition-all ${active ? "w-6 bg-[#d15f24]" : "w-2 bg-slate-300 dark:bg-slate-700"}`}
                          aria-label={`切换到第 ${index + 1} 条公告`}
                          onClick={() => setActiveAnnouncementIndex(index)}
                        />
                      )
                    })}
                  </div>
                ) : null}
              </>
            )}
          </article>

          <article className="rounded-[1.75rem] border border-slate-900/10 bg-white/80 p-5 shadow-[0_25px_60px_-45px_rgba(15,23,42,0.6)] dark:border-white/10 dark:bg-white/5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">版本历史</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">共 {versions.length} 条</p>
            </div>

            {versions.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-900/15 p-8 text-center text-sm text-slate-500 dark:border-white/15 dark:text-slate-400">
                当前暂无版本记录
              </div>
            ) : (
              <div className="space-y-3">
                {versions.map((item) => (
                  <article
                    key={item.id}
                    className="rounded-2xl border border-slate-900/10 bg-white/75 p-4 dark:border-white/10 dark:bg-black/20"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-base font-semibold">{item.version}</p>
                      {item.is_latest ? (
                        <span className="rounded-full bg-emerald-300/25 px-2 py-0.5 text-xs text-emerald-900 dark:text-emerald-100">
                          latest
                        </span>
                      ) : null}
                      {item.is_preview ? (
                        <span className="rounded-full bg-sky-300/25 px-2 py-0.5 text-xs text-sky-900 dark:text-sky-100">
                          preview
                        </span>
                      ) : null}
                      {item.forced ? (
                        <span className="rounded-full bg-rose-300/25 px-2 py-0.5 text-xs text-rose-900 dark:text-rose-100">
                          forced
                        </span>
                      ) : null}
                    </div>

                    {item.title ? (
                      <p className="mt-2 text-sm font-medium text-slate-800 dark:text-slate-100">
                        {item.title}
                      </p>
                    ) : null}
                    {item.content ? (
                      <p className="mt-1 text-sm leading-6 text-slate-700 dark:text-slate-300">
                        {item.content}
                      </p>
                    ) : null}
                    <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                      发布时间 {formatPublishTime(item.published_at)}
                    </p>

                    {item.download_links.length > 0 || item.download_url ? (
                      <div className="mt-3 space-y-1.5">
                        {item.download_links.map((link, index) => (
                          <a
                            key={`${item.id}-${index}`}
                            href={link.url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-sm text-[#cb5f22] hover:underline dark:text-[#ffa66f]"
                          >
                            {link.name ? `${link.name} ` : ""}
                            {link.platform ? `[${link.platform}]` : "下载"}
                            <ExternalLink className="size-3.5" />
                          </a>
                        ))}
                        {item.download_links.length === 0 && item.download_url ? (
                          <a
                            href={item.download_url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-sm text-[#cb5f22] hover:underline dark:text-[#ffa66f]"
                          >
                            下载
                            <ExternalLink className="size-3.5" />
                          </a>
                        ) : null}
                      </div>
                    ) : null}
                  </article>
                ))}
              </div>
            )}
          </article>
        </section>

        <footer className="pb-4 text-center text-sm text-slate-600 dark:text-slate-400">
          <Link href="/" className="hover:text-slate-900 hover:underline dark:hover:text-white">
            返回首页
          </Link>
        </footer>
      </section>
    </main>
  )
}
