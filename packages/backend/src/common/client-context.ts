/**
 * Server-observed facts about the caller of a public endpoint: address,
 * User-Agent, and the platform inferred from them.
 *
 * These are read straight off the request rather than trusted from the body,
 * so every collection point (stats, logs, feedbacks, action records) records
 * the same thing and a client cannot claim to be somewhere it is not.
 */

import type { IncomingHttpHeaders } from "node:http"

/** The subset of an Express request this module needs; keeps callers testable. */
export type ClientRequestLike = {
  headers: IncomingHttpHeaders
  ip?: string
  socket?: { remoteAddress?: string }
}

export type ClientContext = {
  /** Normalized address, or null when nothing usable was present. */
  ip: string | null
  /** Trimmed User-Agent, capped at {@link MAX_USER_AGENT_LENGTH}. */
  userAgent: string | null
}

/**
 * A User-Agent longer than this is junk or an attempt to bloat the table —
 * real ones top out well under 512 characters.
 */
export const MAX_USER_AGENT_LENGTH = 512

/**
 * Proxy headers in precedence order.
 *
 * `x-forwarded-for` is first because it is what the bundled nginx sets, and it
 * is the only one that survives a chain of proxies. The rest cover deployments
 * fronted by Cloudflare or a proxy that only sets a single-value header.
 */
const FORWARDED_HEADERS = [
  "x-forwarded-for",
  "cf-connecting-ip",
  "true-client-ip",
  "x-real-ip",
] as const

function firstHeaderValue(headers: IncomingHttpHeaders, name: string): string | null {
  const raw = headers[name]
  if (Array.isArray(raw)) {
    return raw[0] ?? null
  }
  return typeof raw === "string" ? raw : null
}

/**
 * Strip the IPv6 form of an IPv4 address and any port suffix.
 *
 * Node reports IPv4 clients on a dual-stack socket as `::ffff:1.2.3.4`; storing
 * that verbatim would make the same client look like two different addresses
 * depending on how the server happened to bind.
 */
export function normalizeIp(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null
  }

  let ip = value.trim()
  if (!ip) {
    return null
  }

  // `[::1]:443` — bracketed IPv6 with a port.
  if (ip.startsWith("[")) {
    const closing = ip.indexOf("]")
    if (closing > 0) {
      ip = ip.slice(1, closing)
    }
  } else if (ip.includes(".") && ip.split(":").length === 2) {
    // `1.2.3.4:56789` — IPv4 with a port. Matching on *exactly one* colon is
    // what keeps `::ffff:1.2.3.4` out of this branch; a dot check alone would
    // truncate the mapped form to nothing.
    ip = ip.slice(0, ip.indexOf(":"))
  }

  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(ip)
  if (mapped) {
    ip = mapped[1]!
  }

  return ip.toLowerCase() || null
}

/**
 * Resolve the caller's address.
 *
 * The left-most entry of `x-forwarded-for` is the original client. It is
 * spoofable by that client, which is acceptable here: this is telemetry, not
 * authorization, and the alternative — the socket address — would record every
 * request as coming from the reverse proxy.
 */
export function extractClientIp(request: ClientRequestLike): string | null {
  for (const header of FORWARDED_HEADERS) {
    const value = firstHeaderValue(request.headers, header)
    if (!value) {
      continue
    }

    for (const candidate of value.split(",")) {
      const ip = normalizeIp(candidate)
      if (ip) {
        return ip
      }
    }
  }

  return normalizeIp(request.ip) ?? normalizeIp(request.socket?.remoteAddress)
}

export function extractUserAgent(request: ClientRequestLike): string | null {
  const value = firstHeaderValue(request.headers, "user-agent")
  if (!value) {
    return null
  }

  const trimmed = value.trim()
  if (!trimmed) {
    return null
  }

  return trimmed.slice(0, MAX_USER_AGENT_LENGTH)
}

export function extractClientContext(request: ClientRequestLike): ClientContext {
  return {
    ip: extractClientIp(request),
    userAgent: extractUserAgent(request),
  }
}

/**
 * Addresses that can never be located by a public geo API: loopback, RFC1918
 * and friends, link-local, CGNAT, and unique-local IPv6.
 *
 * Checked before any network call — a provider would answer "not found" for
 * these anyway, and in a Docker deployment they are the common case whenever
 * the proxy headers are missing.
 */
export function isPrivateIp(ip: string): boolean {
  if (ip === "::1" || ip === "::" || ip === "0.0.0.0") {
    return true
  }

  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip)
  if (ipv4) {
    const [a, b] = [Number(ipv4[1]), Number(ipv4[2])]
    if (a === 10 || a === 127) return true
    if (a === 192 && b === 168) return true
    if (a === 172 && b >= 16 && b <= 31) return true
    // 169.254/16 link-local, 100.64/10 carrier-grade NAT.
    if (a === 169 && b === 254) return true
    if (a === 100 && b >= 64 && b <= 127) return true
    return false
  }

  // fc00::/7 unique-local, fe80::/10 link-local.
  return /^f[cd][0-9a-f]{2}:/.test(ip) || /^fe[89ab][0-9a-f]:/.test(ip)
}
