import "server-only"
import { headers } from "next/headers"

import type { AnnouncementItem } from "@/lib/announcements-api"
import type { ProjectItem } from "@/lib/projects-api"
import type { VersionItem } from "@/lib/versions-api"

const FALLBACK_SITE_URL = "http://127.0.0.1:3000"

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

async function requestPublicJson<T>(path: string): Promise<T> {
  const apiBaseUrl = await resolveApiBaseUrl()
  const response = await fetch(`${apiBaseUrl}${path}`, {
    next: { revalidate: 60 },
  })

  if (!response.ok) {
    throw new Error(`Public API request failed: ${response.status}`)
  }

  return (await response.json()) as T
}

export type ProjectShowcasePayload = {
  project: ProjectItem
  versions: VersionItem[]
  announcements: AnnouncementItem[]
}

export async function getProjectShowcaseData(
  projectKey: string,
): Promise<ProjectShowcasePayload | null> {
  const encodedProjectKey = encodeURIComponent(projectKey)

  let projectResponse: Response
  try {
    const apiBaseUrl = await resolveApiBaseUrl()
    projectResponse = await fetch(`${apiBaseUrl}/public/${encodedProjectKey}`, {
      next: { revalidate: 60 },
    })
  } catch {
    return null
  }

  if (projectResponse.status === 404) {
    return null
  }

  if (!projectResponse.ok) {
    throw new Error(`Project request failed: ${projectResponse.status}`)
  }

  const project = (await projectResponse.json()) as ProjectItem

  let versionsResult: { total: number; data: VersionItem[] }
  let announcementsResult: { total: number; data: AnnouncementItem[] }

  try {
    ;[versionsResult, announcementsResult] = await Promise.all([
      requestPublicJson<{ total: number; data: VersionItem[] }>(
        `/public/${encodedProjectKey}/versions?limit=50&offset=0`,
      ),
      requestPublicJson<{ total: number; data: AnnouncementItem[] }>(
        `/public/${encodedProjectKey}/announcements?limit=20&offset=0`,
      ),
    ])
  } catch {
    return null
  }

  return {
    project,
    versions: versionsResult.data,
    announcements: announcementsResult.data,
  }
}
