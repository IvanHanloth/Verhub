"use client"

import * as React from "react"
import { Globe2, MapPin, Monitor, Network } from "lucide-react"

import { formatPlatformVersion } from "@/lib/platform"

/**
 * The server-observed origin of a submission, rendered as a compact badge row.
 *
 * Shared by logs, feedbacks and action records because all three now capture
 * the same fields — a per-page copy would drift the moment one of them gained
 * a column the others also have.
 */

export type ClientOriginFields = {
  ip?: string | null
  user_agent?: string | null
  country_code?: string | null
  country_name?: string | null
  region_name?: string | null
  city?: string | null
  platform?: string | null
  platform_version?: string | null
}

/**
 * Most specific first: "Shibuya · Tokyo · 日本" beats a bare country when the
 * provider gave us the detail, and degrades cleanly when it did not.
 */
function formatLocation(origin: ClientOriginFields): string | null {
  const parts = [origin.city, origin.region_name, origin.country_name ?? origin.country_code]
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part))

  // Providers frequently repeat the city as the region name.
  const unique = parts.filter((part, index) => parts.indexOf(part) === index)
  return unique.length > 0 ? unique.join(" · ") : null
}

function Badge({
  icon: Icon,
  children,
  title,
  mono,
}: {
  icon: typeof Globe2
  children: React.ReactNode
  title?: string
  mono?: boolean
}) {
  return (
    <span
      title={title}
      className={`inline-flex max-w-full items-center gap-1 rounded-full border border-slate-900/10 bg-slate-900/[0.03] px-2 py-0.5 text-[11px] text-slate-600 dark:border-white/15 dark:bg-white/5 dark:text-slate-300 ${
        mono ? "font-mono" : ""
      }`}
    >
      <Icon className="size-3 shrink-0 text-slate-400" aria-hidden />
      <span className="truncate">{children}</span>
    </span>
  )
}

export function ClientOriginBadges({ origin }: { origin: ClientOriginFields }) {
  const location = formatLocation(origin)
  const platform = formatPlatformVersion(origin.platform, origin.platform_version)
  const userAgent = origin.user_agent?.trim() || null

  if (!origin.ip && !location && !platform && !userAgent) {
    return null
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {origin.ip ? (
        <Badge icon={Network} title={`来源 IP ${origin.ip}`} mono>
          {origin.ip}
        </Badge>
      ) : null}
      {location ? (
        <Badge icon={MapPin} title={`来源地区 ${location}`}>
          {location}
        </Badge>
      ) : null}
      {platform ? <Badge icon={Monitor}>{platform}</Badge> : null}
      {userAgent ? (
        // Full string in the tooltip: a User-Agent is long by nature and the
        // distinguishing part is often at the end.
        <Badge icon={Globe2} title={userAgent} mono>
          <span className="inline-block max-w-[22rem] truncate align-bottom">{userAgent}</span>
        </Badge>
      ) : null}
    </div>
  )
}
