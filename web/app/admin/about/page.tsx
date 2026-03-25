import type { Metadata } from "next"
import { headers } from "next/headers"
import Link from "next/link"
import { readFile } from "node:fs/promises"
import path from "node:path"
import { ArrowUpRight, ExternalLink, GitBranch, Info, Rocket, SquareChartGantt } from "lucide-react"

import { AdminCard } from "@/components/admin/admin-card"
import { AdminPageHeader } from "@/components/admin/admin-page-header"
import { ThemeLogo } from "@/components/branding/theme-logo"
import type { ProjectItem } from "@/lib/projects-api"
import type { CheckVersionUpdateResponse, VersionItem } from "@/lib/versions-api"

const ABOUT_CONFIG = {
  projectKey: "ivanhanloth-verhub",
  fallbackRepoUrl: "https://github.com/IvanHanloth/verhub",
  fallbackDocsUrl: process.env.NEXT_PUBLIC_ABOUT_DOCS_URL,
}

const FALLBACK_SITE_URL = "http://127.0.0.1:3000"
const COMPARABLE_VERSION_PATTERN =
  /^(?<core>\d+(?:\.\d+)*)(?:-(?<tag>alpha|beta|rc)(?:\.(?<tail>\d+(?:\.\d+)*))?)?$/

export const metadata: Metadata = {
  title: "关于 Verhub",
}

type BuildInfo = {
  version: string
  published_at: string
}

function formatUnixTimestamp(value?: number | null): string {
  if (!value || Number.isNaN(value)) {
    return "未知"
  }

  return new Date(value * 1000).toLocaleString("zh-CN", {
    hour12: false,
  })
}

function renderUpdateReason(code: string): string {
  const reasonMap: Record<string, string> = {
    newer_version_available: "有更新版本",
    outside_optional_update_range: "超出可选更新范围",
    current_version_deprecated: "当前版本已废弃",
    milestone_guard: "跨里程碑更新",
  }

  return reasonMap[code] ?? code
}

function extractComparableFromVersion(version: string): string | null {
  const trimmed = version.trim().replace(/^v/i, "")
  if (!trimmed) {
    return null
  }

  if (COMPARABLE_VERSION_PATTERN.test(trimmed)) {
    return trimmed
  }

  const coreMatch = trimmed.match(/\d+(?:\.\d+)*/)
  if (!coreMatch) {
    return null
  }

  const suffix = trimmed.slice(coreMatch.index! + coreMatch[0].length)
  const prereleaseMatch = suffix.match(/[-_.]?(alpha|beta|rc)(?:[-_.]?(\d+(?:[._]\d+)*))?/i)
  if (!prereleaseMatch) {
    return coreMatch[0]
  }

  const normalizedTag = prereleaseMatch[1]?.toLowerCase()
  if (!normalizedTag) {
    return coreMatch[0]
  }
  const normalizedTail = prereleaseMatch[2]?.replace(/_/g, ".")?.replace(/\.$/, "")
  const candidate = normalizedTail
    ? `${coreMatch[0]}-${normalizedTag}.${normalizedTail}`
    : `${coreMatch[0]}-${normalizedTag}`

  return COMPARABLE_VERSION_PATTERN.test(candidate) ? candidate : coreMatch[0]
}

async function readBuildInfo(): Promise<BuildInfo> {
  const candidatePaths = [
    path.join(process.cwd(), "build-info.json"),
    path.join(process.cwd(), "web", "public", "build-info.json"),
    path.join(process.cwd(), "public", "build-info.json"),
  ]

  for (const filePath of candidatePaths) {
    try {
      const content = await readFile(filePath, "utf8")
      const parsed = JSON.parse(content) as Partial<BuildInfo>
      if (typeof parsed.version === "string" && typeof parsed.published_at === "string") {
        return {
          version: parsed.version,
          published_at: parsed.published_at,
        }
      }
    } catch {
      // noop
    }
  }

  return {
    version: "1.0.0",
    published_at: "unknown",
  }
}

async function resolveRequestOrigin(): Promise<string> {
  const headersStore = await headers()
  const host = headersStore.get("x-forwarded-host") ?? headersStore.get("host")
  const proto = headersStore.get("x-forwarded-proto") ?? "http"

  if (host) {
    return `${proto}://${host}`
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? FALLBACK_SITE_URL
  const normalized =
    siteUrl.startsWith("http://") || siteUrl.startsWith("https://") ? siteUrl : `https://${siteUrl}`

  return normalized.replace(/\/$/, "")
}

async function resolveApiBaseUrl(): Promise<string> {
  const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? "/api/v1"
  const origin = await resolveRequestOrigin()
  return `${origin}${apiBase.startsWith("/") ? apiBase : `/${apiBase}`}`
}

async function requestPublicJson<T>(path: string, init?: RequestInit): Promise<T | null> {
  try {
    const apiBaseUrl = await resolveApiBaseUrl()
    const response = await fetch(`${apiBaseUrl}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
      next: { revalidate: 30 },
    })

    if (!response.ok) {
      return null
    }

    return (await response.json()) as T
  } catch {
    return null
  }
}

export default async function AdminAboutPage() {
  const buildInfo = await readBuildInfo()
  const currentVersion = buildInfo.version
  const currentComparableVersion = extractComparableFromVersion(currentVersion)

  const encodedProjectKey = encodeURIComponent(ABOUT_CONFIG.projectKey)
  const encodedCurrentVersion = encodeURIComponent(currentVersion)

  const [project, currentVersionInfo, updateResult] = await Promise.all([
    requestPublicJson<ProjectItem>(`/public/${encodedProjectKey}`),
    requestPublicJson<VersionItem>(
      `/public/${encodedProjectKey}/versions/by-version/${encodedCurrentVersion}`,
    ),
    requestPublicJson<CheckVersionUpdateResponse>(
      `/public/${encodedProjectKey}/versions/check-update`,
      {
        method: "POST",
        body: JSON.stringify({
          current_version: currentVersion,
          current_comparable_version: currentComparableVersion || undefined,
        }),
      },
    ),
  ])

  const docsUrl =
    project?.website_url != null
      ? `${project.website_url.replace(/\/$/, "")}/doc`
      : (ABOUT_CONFIG.fallbackDocsUrl ?? "https://verhub.hanloth.cn/doc")
  const repoUrl = project?.repo_url ?? ABOUT_CONFIG.fallbackRepoUrl
  const latestVersion = updateResult?.target_version

  return (
    <section className="space-y-6">
      <AdminPageHeader
        title="关于 Verhub"
        description="展示当前版本、发布时间与实时更新状态。除当前版本和项目信息外，其余更新数据来自 check-update 端点。"
        badge="Verhub About"
        icon={Info}
        actions={<ThemeLogo imgClassName="h-10 w-auto" alt="Verhub" />}
      />

      <div className="grid gap-4 lg:grid-cols-[1.1fr_1.4fr]">
        <AdminCard className="relative overflow-hidden">
          <div className="pointer-events-none absolute -top-16 -right-10 size-40 rounded-full bg-cyan-500/15 blur-2xl" />
          <div className="pointer-events-none absolute -bottom-16 -left-10 size-40 rounded-full bg-emerald-500/15 blur-2xl" />

          <p className="text-xs tracking-[0.12em] text-slate-500 uppercase dark:text-slate-400">
            当前运行版本
          </p>
          <p className="mt-3 inline-flex items-center gap-2 text-3xl font-semibold text-slate-900 dark:text-white">
            <Rocket className="size-7 text-cyan-500" />
            {currentVersion}
          </p>

          <div className="mt-4 grid gap-3 text-sm md:grid-cols-2">
            <div className="rounded-xl border border-slate-900/10 bg-white/70 p-3 dark:border-white/10 dark:bg-white/5">
              <p className="text-xs text-slate-500 dark:text-slate-400">版本标题</p>
              <p className="mt-1 font-medium text-slate-800 dark:text-slate-100">
                {currentVersionInfo?.title ?? "未配置"}
              </p>
            </div>
            <div className="rounded-xl border border-slate-900/10 bg-white/70 p-3 dark:border-white/10 dark:bg-white/5">
              <p className="text-xs text-slate-500 dark:text-slate-400">发布时间</p>
              <p className="mt-1 font-medium text-slate-800 dark:text-slate-100">
                {formatUnixTimestamp(currentVersionInfo?.published_at)}
              </p>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              href={repoUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 transition hover:bg-slate-100 dark:border-white/20 dark:text-slate-100 dark:hover:bg-white/10"
            >
              <GitBranch className="size-4" />
              项目仓库
              <ExternalLink className="size-3.5" />
            </Link>
            <Link
              href={docsUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 transition hover:bg-slate-100 dark:border-white/20 dark:text-slate-100 dark:hover:bg-white/10"
            >
              <SquareChartGantt className="size-4" />
              项目文档
              <ExternalLink className="size-3.5" />
            </Link>
          </div>
        </AdminCard>

        <AdminCard className="space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs tracking-[0.12em] text-slate-500 uppercase dark:text-slate-400">
                更新状态
              </p>
              <h2 className="mt-1 text-xl font-semibold">
                {updateResult?.should_update ? "发现可更新版本" : "当前已是最新"}
              </h2>
            </div>
            {updateResult?.should_update ? (
              <span className="rounded-full border border-amber-300/70 bg-amber-100/80 px-2.5 py-1 text-xs font-semibold text-amber-800 dark:border-amber-400/40 dark:bg-amber-500/15 dark:text-amber-200">
                {updateResult.required ? "必须更新" : "建议更新"}
              </span>
            ) : (
              <span className="rounded-full border border-emerald-300/70 bg-emerald-100/80 px-2.5 py-1 text-xs font-semibold text-emerald-800 dark:border-emerald-400/40 dark:bg-emerald-500/15 dark:text-emerald-200">
                Up to date
              </span>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-slate-900/10 bg-white/60 p-3 dark:border-white/10 dark:bg-white/5">
              <p className="text-xs text-slate-500 dark:text-slate-400">最新目标版本</p>
              <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">
                {latestVersion?.version ?? "未知"}
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                发布时间：{formatUnixTimestamp(latestVersion?.published_at)}
              </p>
            </div>
            <div className="rounded-xl border border-slate-900/10 bg-white/60 p-3 dark:border-white/10 dark:bg-white/5">
              <p className="text-xs text-slate-500 dark:text-slate-400">当前里程碑</p>
              <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">
                {updateResult?.milestone.current ? "是" : "否"}
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                最新里程碑：{updateResult?.milestone.latest ? "是" : "否"}
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-slate-900/10 bg-white/60 p-3 dark:border-white/10 dark:bg-white/5">
            <p className="text-xs text-slate-500 dark:text-slate-400">更新判断依据</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {(updateResult?.reason_codes ?? ["no_data"]).map((code) => (
                <span
                  key={code}
                  className="inline-flex items-center rounded-md border border-cyan-400/30 bg-cyan-500/10 px-2 py-1 text-xs text-cyan-700 dark:text-cyan-200"
                >
                  {renderUpdateReason(code)}
                </span>
              ))}
            </div>
          </div>
        </AdminCard>
      </div>

      <AdminCard>
        <h2 className="text-lg font-semibold">项目固有信息</h2>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <dt className="text-slate-500 dark:text-slate-400">Project Key</dt>
            <dd className="mt-1 font-medium">{ABOUT_CONFIG.projectKey}</dd>
          </div>
          <div>
            <dt className="text-slate-500 dark:text-slate-400">项目名称</dt>
            <dd className="mt-1 font-medium">{project?.name ?? "Verhub"}</dd>
          </div>
          <div>
            <dt className="text-slate-500 dark:text-slate-400">当前版本</dt>
            <dd className="mt-1 font-medium">{currentVersion}</dd>
          </div>
          <div>
            <dt className="text-slate-500 dark:text-slate-400">可比较版本号</dt>
            <dd className="mt-1 font-medium">
              {updateResult?.current_comparable_version ?? "未知"}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500 dark:text-slate-400">项目发布时间</dt>
            <dd className="mt-1 font-medium">{formatUnixTimestamp(project?.published_at)}</dd>
          </div>
          <div>
            <dt className="text-slate-500 dark:text-slate-400">当前版本发布时间</dt>
            <dd className="mt-1 font-medium">
              {currentVersionInfo?.published_at
                ? formatUnixTimestamp(currentVersionInfo.published_at)
                : buildInfo.published_at}
            </dd>
          </div>
        </dl>

        <div className="mt-5 flex flex-wrap gap-3">
          <Link
            href={project?.website_url ?? docsUrl.replace(/\/doc$/, "")}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 transition hover:bg-slate-100 dark:border-white/20 dark:text-slate-100 dark:hover:bg-white/10"
          >
            官网
            <ArrowUpRight className="size-3.5" />
          </Link>

          <Link
            href={docsUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 transition hover:bg-slate-100 dark:border-white/20 dark:text-slate-100 dark:hover:bg-white/10"
          >
            文档中心
            <ArrowUpRight className="size-3.5" />
          </Link>

          <Link
            href={repoUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 transition hover:bg-slate-100 dark:border-white/20 dark:text-slate-100 dark:hover:bg-white/10"
          >
            代码仓库
            <ArrowUpRight className="size-3.5" />
          </Link>
        </div>
      </AdminCard>
    </section>
  )
}
