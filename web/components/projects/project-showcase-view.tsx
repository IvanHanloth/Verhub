"use client"

import * as React from "react"
import Link from "next/link"
import { BookOpen, ChevronLeft, ChevronRight, Download, ExternalLink, Pin } from "lucide-react"

import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"

import { ExpandableMarkdown } from "@/components/markdown/expandable-markdown"
import { MarkdownContent } from "@/components/markdown/markdown-content"
import type { AnnouncementItem } from "@/lib/announcements-api"
import type { ProjectItem } from "@/lib/projects-api"
import { platformLabel, type Platform } from "@/lib/platform"
import type { VersionItem } from "@/lib/versions-api"

type ProjectShowcaseViewProps = {
  project: ProjectItem
  versions: VersionItem[]
  announcements: AnnouncementItem[]
}

// 版本历史分批渲染的步长。服务端 public 接口上限 50 条，分批展开即可避免长列表
// 一次性挂载；若后续放开分页上限，再替换为按需测量的虚拟滚动。
const VERSION_PAGE_SIZE = 12

// 公告卡片堆叠的最大层数。实际层数还要对公告总数取小，否则同一条公告会被渲染
// 多次并撞车成重复 key。
const ANNOUNCEMENT_STACK_DEPTH = 3

// Markdown 折叠高度（px）。渲染后是多个块级元素，无法用 line-clamp 计行，
// 只能给一个视觉上合适的截断高度。
const COLLAPSED_HEIGHT = {
  description: 88,
  latest: 200,
  version: 132,
} as const

function pad(value: number): string {
  return String(value).padStart(2, "0")
}

function formatDateTime(timestamp: number): string {
  const date = new Date(timestamp * 1000)
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function formatDate(timestamp: number): string {
  const date = new Date(timestamp * 1000)
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())}`
}

function toIsoString(timestamp: number): string {
  return new Date(timestamp * 1000).toISOString()
}

function resolvePlatformLabels(platforms: Platform[] | undefined | null): string[] {
  if (!platforms || platforms.length === 0) {
    return ["全部平台"]
  }

  return platforms.map((platform) => platformLabel(platform) ?? platform)
}

// 时间戳在服务端与客户端所处时区可能不同，直接渲染会触发 hydration 不一致，
// 因此统一走 <time> 并放行该节点的文本比对。
function TimeText({ timestamp, mode = "datetime", className }: TimeTextProps) {
  return (
    <time dateTime={toIsoString(timestamp)} className={className} suppressHydrationWarning>
      {mode === "date" ? formatDate(timestamp) : formatDateTime(timestamp)}
    </time>
  )
}

type TimeTextProps = {
  timestamp: number
  mode?: "date" | "datetime"
  className?: string
}

function PlatformTags({ platforms, tone = "muted" }: PlatformTagsProps) {
  const labels = resolvePlatformLabels(platforms)
  const toneClass =
    tone === "accent"
      ? "bg-[#e86d2f]/12 text-[#a94d18] dark:bg-[#e86d2f]/20 dark:text-[#ffbc96]"
      : "bg-slate-900/5 text-slate-600 dark:bg-white/10 dark:text-slate-300"

  return (
    <>
      {labels.map((label) => (
        <span
          key={label}
          className={`rounded-full px-2.5 py-1 text-[11px] leading-none font-medium ${toneClass}`}
        >
          {label}
        </span>
      ))}
    </>
  )
}

type PlatformTagsProps = {
  platforms: Platform[] | undefined | null
  tone?: "muted" | "accent"
}

function Badge({ children, tone }: { children: React.ReactNode; tone: BadgeTone }) {
  const toneClasses: Record<BadgeTone, string> = {
    latest: "bg-[#e86d2f] text-white",
    milestone: "bg-amber-400/20 text-amber-800 dark:bg-amber-400/15 dark:text-amber-200",
    preview: "bg-slate-900/8 text-slate-600 dark:bg-white/10 dark:text-slate-300",
    deprecated: "bg-rose-500/15 text-rose-800 dark:bg-rose-500/20 dark:text-rose-200",
  }

  return (
    <span
      className={`rounded-md px-2 py-1 text-[10.5px] leading-none font-bold ${toneClasses[tone]}`}
    >
      {children}
    </span>
  )
}

type BadgeTone = "latest" | "milestone" | "preview" | "deprecated"

function VersionBadges({ version }: { version: VersionItem }) {
  return (
    <>
      {version.is_latest ? <Badge tone="latest">latest</Badge> : null}
      {version.is_milestone ? <Badge tone="milestone">里程碑</Badge> : null}
      {version.is_preview ? <Badge tone="preview">预发布</Badge> : null}
      {version.is_deprecated ? <Badge tone="deprecated">已废弃 · 建议更新</Badge> : null}
    </>
  )
}

function HeroAction({ href, children, variant }: HeroActionProps) {
  const variantClass =
    variant === "primary"
      ? "bg-[#e86d2f] text-white hover:bg-[#d15f24]"
      : "border border-slate-900/12 bg-white/80 text-slate-800 hover:bg-white dark:border-white/15 dark:bg-white/10 dark:text-slate-100 dark:hover:bg-white/15"

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={`inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold transition-colors ${variantClass}`}
    >
      {children}
    </a>
  )
}

type HeroActionProps = {
  href: string
  children: React.ReactNode
  variant: "primary" | "secondary"
}

function DownloadLinks({ version }: { version: VersionItem }) {
  const links =
    version.download_links.length > 0
      ? version.download_links
      : version.download_url
        ? [{ url: version.download_url, name: "下载", platform: undefined }]
        : []

  if (links.length === 0) {
    return null
  }

  return (
    <div className="flex flex-wrap gap-2">
      {links.map((link, index) => (
        <a
          key={`${version.id}-${index}`}
          href={link.url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-900/12 px-3 py-2 text-xs font-semibold text-slate-700 transition-colors hover:border-[#e86d2f]/50 hover:text-[#cb5f22] dark:border-white/15 dark:text-slate-200 dark:hover:text-[#ffa66f]"
        >
          {link.name ?? "下载"}
          {link.platform ? (
            <span className="text-slate-400 dark:text-slate-500">
              {platformLabel(link.platform)}
            </span>
          ) : null}
          <Download className="size-3.5" />
        </a>
      ))}
    </div>
  )
}

export function ProjectShowcaseView({
  project,
  versions,
  announcements: rawAnnouncements,
}: ProjectShowcaseViewProps) {
  const [activeAnnouncementIndex, setActiveAnnouncementIndex] = React.useState(0)
  const [paused, setPaused] = React.useState(false)
  const [openedAnnouncement, setOpenedAnnouncement] = React.useState<AnnouncementItem | null>(null)
  const [visibleVersionCount, setVisibleVersionCount] = React.useState(VERSION_PAGE_SIZE)

  // 置顶公告优先。Array.prototype.sort 在 ES2019 起保证稳定，其余顺序沿用接口返回。
  const announcements = React.useMemo(
    () =>
      [...rawAnnouncements].sort((left, right) => Number(right.is_pinned) - Number(left.is_pinned)),
    [rawAnnouncements],
  )

  const latestVersion = React.useMemo(
    () => versions.find((item) => item.is_latest) ?? versions[0] ?? null,
    [versions],
  )

  const visibleVersions = versions.slice(0, visibleVersionCount)
  const stackDepth = Math.min(ANNOUNCEMENT_STACK_DEPTH, announcements.length)

  React.useEffect(() => {
    if (announcements.length <= 1 || paused || openedAnnouncement) {
      return
    }

    const timer = window.setInterval(() => {
      setActiveAnnouncementIndex((previous) => (previous + 1) % announcements.length)
    }, 5000)

    return () => window.clearInterval(timer)
  }, [announcements.length, paused, openedAnnouncement])

  const stackedAnnouncements = React.useMemo(() => {
    if (announcements.length === 0) {
      return []
    }

    return Array.from({ length: stackDepth }, (_, offset) => {
      const index = (activeAnnouncementIndex + offset) % announcements.length
      return { item: announcements[index]!, offset, index }
    })
  }, [activeAnnouncementIndex, announcements, stackDepth])

  function moveAnnouncement(step: number) {
    if (announcements.length === 0) {
      return
    }

    setActiveAnnouncementIndex(
      (previous) => (previous + step + announcements.length) % announcements.length,
    )
  }

  return (
    <main className="min-h-svh bg-[#f4f1ea] text-slate-900 dark:bg-[#050812] dark:text-slate-100">
      <div className="mx-auto w-full max-w-[58rem] px-4 py-8 sm:px-8">
        <header className="relative overflow-hidden rounded-[2rem] border border-slate-900/10 bg-[linear-gradient(130deg,#ffffff_0%,#efe8d9_100%)] p-6 shadow-[0_30px_80px_-48px_rgba(15,23,42,0.7)] sm:p-9 dark:border-white/10 dark:bg-[linear-gradient(130deg,#121826_0%,#0a0f1e_100%)]">
          <div className="pointer-events-none absolute -right-24 -bottom-32 h-72 w-72 rounded-full bg-[#e86d2f]/20 blur-3xl" />
          <div className="pointer-events-none absolute -top-24 -left-28 h-72 w-72 rounded-full bg-[#2f8b85]/15 blur-3xl" />

          <div className="relative flex flex-col gap-7">
            <div className="flex items-start gap-5">
              <div className="size-20 shrink-0 overflow-hidden rounded-2xl border border-slate-900/10 bg-white/85 shadow-sm dark:border-white/15 dark:bg-white/10">
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

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2.5">
                  {/* 项目名可能是 owner/repo 这类无空格长串：min-w-0 让 flex 子项能收缩到
                      min-content 以下，break-words 才有机会在词内断行。 */}
                  <h1 className="min-w-0 text-3xl font-bold tracking-tight break-words sm:text-4xl">
                    {project.name}
                  </h1>
                  <span className="rounded-md bg-slate-900/6 px-2 py-1 font-mono text-xs font-semibold break-all text-slate-600 dark:bg-white/10 dark:text-slate-300">
                    {project.project_key}
                  </span>
                </div>

                {project.description ? (
                  <ExpandableMarkdown
                    collapsedHeight={COLLAPSED_HEIGHT.description}
                    className="mt-3 max-w-[60ch] text-[15px] text-slate-700 dark:text-slate-300"
                  >
                    {project.description}
                  </ExpandableMarkdown>
                ) : null}

                {project.author || project.published_at ? (
                  <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-slate-600 dark:text-slate-400">
                    {project.author ? (
                      <span className="inline-flex items-center gap-1.5">
                        by
                        {project.author_homepage_url ? (
                          <a
                            href={project.author_homepage_url}
                            target="_blank"
                            rel="noreferrer"
                            className="font-semibold text-[#cb5f22] hover:underline dark:text-[#ffa66f]"
                          >
                            {project.author}
                          </a>
                        ) : (
                          <span className="font-semibold text-slate-800 dark:text-slate-200">
                            {project.author}
                          </span>
                        )}
                      </span>
                    ) : null}
                    {project.author && project.published_at ? (
                      <span className="text-slate-400 dark:text-slate-600">·</span>
                    ) : null}
                    {project.published_at ? (
                      <span>
                        首次发布于 <TimeText timestamp={project.published_at} mode="date" />
                      </span>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>

            {project.website_url || project.repo_url || project.docs_url ? (
              <div className="flex flex-wrap gap-3">
                {project.website_url ? (
                  <HeroAction href={project.website_url} variant="primary">
                    <ExternalLink className="size-4" /> 访问官网
                  </HeroAction>
                ) : null}
                {project.docs_url ? (
                  <HeroAction href={project.docs_url} variant="secondary">
                    <BookOpen className="size-4" /> 查看文档
                  </HeroAction>
                ) : null}
                {project.repo_url ? (
                  <HeroAction href={project.repo_url} variant="secondary">
                    <ExternalLink className="size-4" /> 代码仓库
                  </HeroAction>
                ) : null}
              </div>
            ) : null}
          </div>
        </header>

        {latestVersion ? (
          <section className="mt-6">
            <article className="rounded-2xl border border-slate-900/10 bg-white p-6 shadow-[0_1px_2px_rgba(0,0,0,0.04)] dark:border-white/10 dark:bg-white/5">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2.5">
                  <span className="text-[11px] font-bold tracking-[0.08em] text-[#cb5f22] uppercase dark:text-[#ffa66f]">
                    最新版本
                  </span>
                  <span className="font-mono text-xl font-bold">{latestVersion.version}</span>
                  {latestVersion.is_milestone ? <Badge tone="milestone">里程碑</Badge> : null}
                  {latestVersion.is_preview ? <Badge tone="preview">预发布</Badge> : null}
                  {latestVersion.is_deprecated ? (
                    <Badge tone="deprecated">已废弃 · 建议更新</Badge>
                  ) : null}
                </div>
                <TimeText
                  timestamp={latestVersion.published_at}
                  className="text-[13px] text-slate-500 dark:text-slate-400"
                />
              </div>

              {latestVersion.title ? (
                <p className="mb-2 text-[15px] font-semibold text-slate-800 dark:text-slate-100">
                  {latestVersion.title}
                </p>
              ) : null}
              {latestVersion.content ? (
                <ExpandableMarkdown
                  collapsedHeight={COLLAPSED_HEIGHT.latest}
                  className="mb-4 max-w-[70ch] text-sm text-slate-600 dark:text-slate-300"
                >
                  {latestVersion.content}
                </ExpandableMarkdown>
              ) : null}

              <div className="mb-4 flex flex-wrap gap-2">
                <PlatformTags platforms={latestVersion.platforms} tone="accent" />
              </div>

              <DownloadLinks version={latestVersion} />
            </article>
          </section>
        ) : null}

        {announcements.length > 0 ? (
          <section
            className="mt-6"
            onMouseEnter={() => setPaused(true)}
            onMouseLeave={() => setPaused(false)}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-bold tracking-tight">公告动态</h2>
              {announcements.length > 1 ? (
                <div className="flex items-center gap-1.5">
                  <span className="mr-1 text-xs text-slate-500 dark:text-slate-400">
                    {activeAnnouncementIndex + 1} / {announcements.length}
                  </span>
                  <button
                    type="button"
                    className="rounded-lg border border-slate-900/12 p-1.5 transition-colors hover:bg-slate-900/5 dark:border-white/15 dark:hover:bg-white/10"
                    onClick={() => moveAnnouncement(-1)}
                    aria-label="上一条公告"
                  >
                    <ChevronLeft className="size-4" />
                  </button>
                  <button
                    type="button"
                    className="rounded-lg border border-slate-900/12 p-1.5 transition-colors hover:bg-slate-900/5 dark:border-white/15 dark:hover:bg-white/10"
                    onClick={() => moveAnnouncement(1)}
                    aria-label="下一条公告"
                  >
                    <ChevronRight className="size-4" />
                  </button>
                </div>
              ) : null}
            </div>

            {/* 卡片堆叠：底层卡片仅作为视觉厚度，用不透明背景挡住下层文字。 */}
            <div className="relative" style={{ height: `${11 + (stackDepth - 1) * 0.75}rem` }}>
              {stackedAnnouncements.map(({ item, offset }) => {
                const layerClasses = [
                  "translate-y-0 scale-100 opacity-100 z-30",
                  "translate-y-3 scale-[0.97] opacity-70 z-20",
                  "translate-y-6 scale-[0.94] opacity-45 z-10",
                ]
                const isTop = offset === 0

                return (
                  <article
                    key={item.id}
                    className={`absolute inset-x-0 top-0 h-44 overflow-hidden rounded-2xl border border-slate-900/10 bg-white p-5 shadow-[0_10px_30px_-20px_rgba(15,23,42,0.5)] transition-all duration-500 dark:border-white/10 dark:bg-[#0f1524] ${layerClasses[offset] ?? layerClasses[2]}`}
                    aria-hidden={isTop ? undefined : "true"}
                  >
                    <div className="mb-2 flex items-start justify-between gap-3">
                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                        {item.is_pinned ? (
                          <span className="inline-flex items-center gap-1 rounded-md bg-[#e86d2f] px-2 py-1 text-[10.5px] leading-none font-bold text-white">
                            <Pin className="size-3" />
                            置顶
                          </span>
                        ) : null}
                        <h3 className="truncate text-[15px] font-bold">{item.title}</h3>
                      </div>
                      <TimeText
                        timestamp={item.published_at}
                        className="shrink-0 text-xs whitespace-nowrap text-slate-500 dark:text-slate-400"
                      />
                    </div>

                    {/* 卡片高度固定，正文按 mask 渐隐截断，完整内容走「查看全文」弹窗 */}
                    <div
                      className="max-h-[4.5rem] overflow-hidden text-sm text-slate-600 dark:text-slate-300"
                      style={{
                        maskImage: "linear-gradient(to bottom, #000 60%, transparent 100%)",
                        WebkitMaskImage: "linear-gradient(to bottom, #000 60%, transparent 100%)",
                      }}
                    >
                      <MarkdownContent>{item.content}</MarkdownContent>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {item.author ? (
                        <span className="text-xs text-slate-500 dark:text-slate-400">
                          by {item.author}
                        </span>
                      ) : null}
                      <PlatformTags platforms={item.platforms} />
                      {isTop ? (
                        <button
                          type="button"
                          onClick={() => setOpenedAnnouncement(item)}
                          className="ml-auto text-xs font-semibold text-[#cb5f22] hover:underline dark:text-[#ffa66f]"
                        >
                          查看全文
                        </button>
                      ) : null}
                    </div>
                  </article>
                )
              })}
            </div>

            {announcements.length > 1 ? (
              <div className="mt-4 flex items-center justify-center gap-1.5">
                {announcements.map((announcement, index) => (
                  <button
                    key={announcement.id}
                    type="button"
                    className={`h-2 rounded-full transition-all ${
                      index === activeAnnouncementIndex
                        ? "w-6 bg-[#d15f24]"
                        : "w-2 bg-slate-300 dark:bg-slate-700"
                    }`}
                    aria-label={`切换到第 ${index + 1} 条公告`}
                    onClick={() => setActiveAnnouncementIndex(index)}
                  />
                ))}
              </div>
            ) : null}
          </section>
        ) : null}

        <section className="mt-10">
          <div className="mb-6 flex items-center justify-between">
            <h2 className="text-xl font-bold tracking-tight">版本历史</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">共 {versions.length} 条</p>
          </div>

          {versions.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-900/15 p-10 text-center text-sm text-slate-500 dark:border-white/15 dark:text-slate-400">
              当前暂无版本记录
            </div>
          ) : (
            <>
              <div className="flex flex-col">
                {visibleVersions.map((item, index) => {
                  const dotClass = item.is_deprecated
                    ? "bg-rose-500"
                    : item.is_latest
                      ? "bg-[#e86d2f]"
                      : "bg-slate-300 dark:bg-slate-600"

                  return (
                    <div key={item.id} className="flex gap-5">
                      <div className="flex w-3 flex-none flex-col items-center">
                        <span
                          className={`mt-1.5 size-2.5 flex-none rounded-full ring-4 ring-[#f4f1ea] dark:ring-[#050812] ${dotClass}`}
                        />
                        {index < visibleVersions.length - 1 ? (
                          <span className="mt-1 w-0.5 flex-1 bg-slate-900/10 dark:bg-white/10" />
                        ) : null}
                      </div>

                      <div className="min-w-0 flex-1 pb-8">
                        <div className="mb-1.5 flex flex-wrap items-center gap-2.5">
                          <span className="font-mono text-base font-bold">{item.version}</span>
                          <VersionBadges version={item} />
                          <TimeText
                            timestamp={item.published_at}
                            className="text-[12.5px] text-slate-500 dark:text-slate-400"
                          />
                        </div>

                        {item.title ? (
                          <p className="mb-1.5 text-sm font-semibold text-slate-800 dark:text-slate-100">
                            {item.title}
                          </p>
                        ) : null}
                        {item.content ? (
                          <ExpandableMarkdown
                            collapsedHeight={COLLAPSED_HEIGHT.version}
                            className="mb-2.5 max-w-[65ch] text-[13.5px] text-slate-600 dark:text-slate-400"
                          >
                            {item.content}
                          </ExpandableMarkdown>
                        ) : null}

                        <div className="flex flex-wrap items-center gap-2">
                          <PlatformTags platforms={item.platforms} />
                          <DownloadLinks version={item} />
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>

              {visibleVersionCount < versions.length ? (
                <button
                  type="button"
                  onClick={() => setVisibleVersionCount((previous) => previous + VERSION_PAGE_SIZE)}
                  className="w-full rounded-xl border border-slate-900/12 py-3 text-sm font-semibold text-slate-700 transition-colors hover:border-[#e86d2f]/50 hover:text-[#cb5f22] dark:border-white/15 dark:text-slate-200 dark:hover:text-[#ffa66f]"
                >
                  加载更多（剩余 {versions.length - visibleVersionCount} 条）
                </button>
              ) : null}
            </>
          )}
        </section>

        <footer className="mt-12 flex flex-wrap items-center justify-between gap-3 border-t border-slate-900/10 pt-6 pb-4 text-[12.5px] text-slate-500 dark:border-white/10 dark:text-slate-400">
          <span>
            {project.name} · {project.project_key}
          </span>
          <div className="flex gap-4">
            {project.repo_url ? (
              <a
                href={project.repo_url}
                target="_blank"
                rel="noreferrer"
                className="hover:text-[#cb5f22] hover:underline dark:hover:text-[#ffa66f]"
              >
                仓库
              </a>
            ) : null}
            {project.website_url ? (
              <a
                href={project.website_url}
                target="_blank"
                rel="noreferrer"
                className="hover:text-[#cb5f22] hover:underline dark:hover:text-[#ffa66f]"
              >
                官网
              </a>
            ) : null}
            <Link
              href="/"
              className="hover:text-[#cb5f22] hover:underline dark:hover:text-[#ffa66f]"
            >
              返回首页
            </Link>
          </div>
        </footer>
      </div>

      <Dialog
        open={openedAnnouncement !== null}
        onOpenChange={(open) => {
          if (!open) {
            setOpenedAnnouncement(null)
          }
        }}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{openedAnnouncement?.title}</DialogTitle>
            <DialogDescription>
              {openedAnnouncement ? formatDateTime(openedAnnouncement.published_at) : ""}
              {openedAnnouncement?.author ? ` · by ${openedAnnouncement.author}` : ""}
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            {openedAnnouncement ? (
              <MarkdownContent className="text-sm text-slate-700 dark:text-slate-300">
                {openedAnnouncement.content}
              </MarkdownContent>
            ) : null}
          </DialogBody>
        </DialogContent>
      </Dialog>
    </main>
  )
}
