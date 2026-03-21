import Link from "next/link"
import { ExternalLink } from "lucide-react"

import { AdminItemCard } from "@/components/admin/admin-card"
import { createEndpointSlug } from "@/lib/api-docs/utils"

type ApiEndpoint = {
  method: "GET" | "POST" | "PATCH" | "DELETE"
  path: string
  description: string
  auth?: {
    tokenRequired: boolean
  }
  pathParams?: Record<string, string>
  queryParams?: Record<string, string>
  requestBody?: Record<string, unknown>
}

type ApiGroup = {
  label: string
  endpoints: ApiEndpoint[]
}

type ProjectApiOverviewProps = {
  title: string
  projectKey?: string
  groups: ApiGroup[]
}

const METHOD_CLASS: Record<ApiEndpoint["method"], string> = {
  GET: "border-sky-300/50 bg-sky-300/15 text-sky-700 dark:text-sky-200",
  POST: "border-emerald-300/50 bg-emerald-300/15 text-emerald-700 dark:text-emerald-200",
  PATCH: "border-amber-300/50 bg-amber-300/15 text-amber-700 dark:text-amber-200",
  DELETE: "border-rose-300/50 bg-rose-300/15 text-rose-700 dark:text-rose-200",
}

function replacePathVars(path: string, projectKey?: string): string {
  return path.replaceAll("{projectKey}", projectKey || "<projectKey>")
}

function stripApiPrefix(path: string): string {
  return path.startsWith("/api/v1") ? path.slice(7) : path
}

function buildDocHref(endpoint: ApiEndpoint, projectKey?: string): string {
  const docPath = stripApiPrefix(endpoint.path)
  const slug = createEndpointSlug(endpoint.method, docPath)
  const search = new URLSearchParams()

  if (docPath.includes("{projectKey}")) {
    search.set("path.projectKey", projectKey || "")
  }

  for (const [key, value] of Object.entries(endpoint.pathParams ?? {})) {
    search.set(`path.${key}`, value)
  }

  for (const [key, value] of Object.entries(endpoint.queryParams ?? {})) {
    search.set(`query.${key}`, value)
  }

  if (endpoint.requestBody) {
    search.set("body", JSON.stringify(replaceBodyVars(endpoint.requestBody, projectKey), null, 2))
  }

  const query = search.toString()
  return query ? `/doc/${slug}?${query}` : `/doc/${slug}`
}

function replaceBodyVars(value: unknown, projectKey?: string): unknown {
  if (typeof value === "string") {
    return value.replaceAll("{projectKey}", projectKey || "<projectKey>")
  }

  if (Array.isArray(value)) {
    return value.map((item) => replaceBodyVars(item, projectKey))
  }

  if (!value || typeof value !== "object") {
    return value
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [key, replaceBodyVars(child, projectKey)]),
  )
}

export function ProjectApiOverview({ title, projectKey, groups }: ProjectApiOverviewProps) {
  return (
    <AdminItemCard className="border-slate-900/10 bg-white/70 p-4 dark:border-white/15 dark:bg-white/5">
      <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{title}</p>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-300">
        点击接口进入文档页；已知参数会自动带入在线调试面板。
      </p>
      <div className="mt-3 space-y-3">
        {groups.map((group) => (
          <div key={group.label} className="space-y-2">
            <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-300">
              {group.label}
            </p>
            {group.endpoints.map((endpoint) => {
              const endpointPath = replacePathVars(endpoint.path, projectKey)
              const href = buildDocHref(endpoint, projectKey)

              return (
                <Link
                  key={`${group.label}:${endpoint.method}:${endpoint.path}`}
                  href={href}
                  className="block rounded-xl border border-slate-900/10 bg-white/80 px-3 py-2 text-xs transition hover:border-sky-400/40 hover:bg-sky-50/60 dark:border-white/10 dark:bg-black/20 dark:hover:bg-sky-500/10"
                >
                  <div className="flex list-none flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full border px-2 py-0.5 font-semibold ${METHOD_CLASS[endpoint.method]}`}
                    >
                      {endpoint.method}
                    </span>
                    <code className="text-slate-700 dark:text-slate-200">{endpointPath}</code>
                    <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-300">
                      {endpoint.auth?.tokenRequired ? "需要 Token" : "公开接口"}
                      <ExternalLink className="size-3" />
                    </span>
                  </div>

                  <p className="mt-2 text-slate-600 dark:text-slate-300">{endpoint.description}</p>
                </Link>
              )
            })}
          </div>
        ))}
      </div>
    </AdminItemCard>
  )
}
