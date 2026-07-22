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
 * 由边缘节点自己写入的「真实客户端地址」头，按优先级排列。
 *
 * 排在 `x-forwarded-for` 之前：CDN 会无条件覆盖这些头，客户端伪造的同名头到
 * 不了源站；而 `x-forwarded-for` 是一条逐跳追加的链，最左项来自客户端本身。
 * 套 CDN 上线时，命中其中之一即可拿到访客地址而不是边缘节点地址。
 */
const CDN_CLIENT_IP_HEADERS = [
  "cf-connecting-ip", // Cloudflare
  "true-client-ip", // Akamai / Cloudflare 企业版
  "eo-client-ip", // 腾讯云 EdgeOne
  "ali-cdn-real-ip", // 阿里云 CDN
  "fastly-client-ip", // Fastly
] as const

/** 逐跳追加的转发链。取值规则见 {@link pickFromForwardedChain}。 */
const FORWARDED_CHAIN_HEADER = "x-forwarded-for"

/** 单值兜底头。自带 nginx 会写成它的直连对端，故排在转发链之后。 */
const SINGLE_VALUE_FALLBACK_HEADER = "x-real-ip"

/**
 * 源站前面的可信反代层数，默认 1（自带的 nginx 网关）。
 *
 * 套 CDN 时应设为 2：CDN 与 nginx 各向 `x-forwarded-for` 追加一项。
 */
export const DEFAULT_TRUSTED_PROXY_COUNT = 1

/**
 * 可信反代层数，来自 `VERHUB_TRUSTED_PROXY_COUNT`。
 *
 * 0 表示后端直接对外，此时所有转发头都是客户端直接写的，一律不采信。
 */
export function resolveTrustedProxyCount(): number {
  const raw = process.env.VERHUB_TRUSTED_PROXY_COUNT
  if (raw === undefined || raw.trim() === "") {
    return DEFAULT_TRUSTED_PROXY_COUNT
  }

  const parsed = Number(raw)
  if (!Number.isFinite(parsed) || parsed < 0) {
    return DEFAULT_TRUSTED_PROXY_COUNT
  }

  return Math.trunc(parsed)
}

/**
 * `VERHUB_CLIENT_IP_HEADER` 指定的头名（逗号分隔）。
 *
 * 配置了就只认这些，用于自家 CDN 写的是内置清单以外的头（或反过来，要禁掉
 * 内置清单里那些在无 CDN 部署下可被伪造的头）。
 */
export function resolveConfiguredIpHeaders(): string[] {
  return (process.env.VERHUB_CLIENT_IP_HEADER ?? "")
    .split(",")
    .map((name) => name.trim().toLowerCase())
    .filter((name) => name.length > 0)
}

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

/** 一个头里的地址列表，已归一化并剔除空项。 */
function readIpChain(headers: IncomingHttpHeaders, name: string): string[] {
  const raw = firstHeaderValue(headers, name)
  if (!raw) {
    return []
  }

  return raw
    .split(",")
    .map((entry) => normalizeIp(entry))
    .filter((ip): ip is string => ip !== null)
}

/**
 * 从逐跳追加的转发链里取访客地址。
 *
 * 每一层可信反代都会把「它的直连对端」追加到链尾，所以访客位于右起第
 * `trustedProxyCount` 项，而不是最左项——最左项是客户端自己写进来的，套 CDN
 * 后伪造它就能顶掉真实地址。
 *
 * 按跳数取到私网地址，说明实际层数比配置的多（多了一层内网入口），继续向左找
 * 第一个公网地址：它至少不是随客户端摆布的那一项。
 */
function pickFromForwardedChain(chain: string[], trustedProxyCount: number): string | null {
  if (chain.length === 0) {
    return null
  }

  const index = Math.min(Math.max(chain.length - trustedProxyCount, 0), chain.length - 1)
  const picked = chain[index]!
  if (!isPrivateIp(picked)) {
    return picked
  }

  for (let i = index - 1; i >= 0; i -= 1) {
    if (!isPrivateIp(chain[i]!)) {
      return chain[i]!
    }
  }

  return picked
}

/** 单值头取最左项：整个值由边缘节点写入，链式语义在这里不适用。 */
function pickFromHeader(
  headers: IncomingHttpHeaders,
  name: string,
  trustedProxyCount: number,
): string | null {
  const chain = readIpChain(headers, name)
  if (name === FORWARDED_CHAIN_HEADER) {
    return pickFromForwardedChain(chain, trustedProxyCount)
  }
  return chain[0] ?? null
}

/**
 * Resolve the caller's address.
 *
 * 顺序是「越难伪造的越先信」：CDN 自写的客户端地址头 → 按跳数定位的
 * `x-forwarded-for` → 单值兜底头 → 连接地址。连接地址在反代/CDN 后面是网关或
 * 边缘节点，只有真的没有任何转发头时才用得上。
 *
 * 仍不是鉴权级别的可信：这是遥测，取不准的代价是一条统计记错地区。
 */
export function extractClientIp(request: ClientRequestLike): string | null {
  const socketIp = normalizeIp(request.ip) ?? normalizeIp(request.socket?.remoteAddress)
  const trustedProxyCount = resolveTrustedProxyCount()

  // 没有可信反代时，转发头全部来自客户端直连，采信它等于让人随便报地址。
  if (trustedProxyCount <= 0) {
    return socketIp
  }

  const configured = resolveConfiguredIpHeaders()
  const headers =
    configured.length > 0
      ? configured
      : [...CDN_CLIENT_IP_HEADERS, FORWARDED_CHAIN_HEADER, SINGLE_VALUE_FALLBACK_HEADER]

  for (const header of headers) {
    const ip = pickFromHeader(request.headers, header, trustedProxyCount)
    if (ip) {
      return ip
    }
  }

  return socketIp
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
