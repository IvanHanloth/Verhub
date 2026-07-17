import { StatPlatform } from "@prisma/client"

/** Header an SDK sets to declare its platform explicitly. */
export const PLATFORM_HEADER = "x-verhub-platform"

const PLATFORM_BY_NAME = new Map<string, StatPlatform>([
  ["ios", StatPlatform.IOS],
  ["ipados", StatPlatform.IOS],
  ["android", StatPlatform.ANDROID],
  ["windows", StatPlatform.WINDOWS],
  ["win32", StatPlatform.WINDOWS],
  ["mac", StatPlatform.MAC],
  ["macos", StatPlatform.MAC],
  ["darwin", StatPlatform.MAC],
  ["web", StatPlatform.WEB],
  ["browser", StatPlatform.WEB],
])

/**
 * Resolve an explicitly declared platform, e.g. from the `x-verhub-platform`
 * header or an SDK request body field. Unrecognized values yield `null` so the
 * caller can fall back to User-Agent parsing.
 */
export function parseDeclaredPlatform(value: unknown): StatPlatform | null {
  if (typeof value !== "string") {
    return null
  }
  return PLATFORM_BY_NAME.get(value.trim().toLowerCase()) ?? null
}

/**
 * Best-effort platform inference from a User-Agent string.
 *
 * Order matters: iOS/Android are checked before Mac/Windows because mobile
 * User-Agents embed desktop tokens ("iPhone; CPU iPhone OS ... like Mac OS X",
 * and Android UAs contain "Linux"). A generic browser UA with no OS token we
 * recognize still counts as WEB rather than UNKNOWN.
 */
export function parsePlatformFromUserAgent(userAgent: unknown): StatPlatform {
  if (typeof userAgent !== "string" || userAgent.trim().length === 0) {
    return StatPlatform.UNKNOWN
  }

  const ua = userAgent.toLowerCase()

  if (/iphone|ipad|ipod|ios/.test(ua)) return StatPlatform.IOS
  if (/android/.test(ua)) return StatPlatform.ANDROID
  if (/windows|win32|win64/.test(ua)) return StatPlatform.WINDOWS
  if (/macintosh|mac os x|darwin/.test(ua)) return StatPlatform.MAC
  if (/mozilla|chrome|safari|firefox|edge|webkit/.test(ua)) return StatPlatform.WEB

  return StatPlatform.UNKNOWN
}

/**
 * Resolve the platform dimension for a request: an explicit SDK declaration
 * wins, then User-Agent inference, then UNKNOWN.
 */
export function resolvePlatform(declared: unknown, userAgent: unknown): StatPlatform {
  return parseDeclaredPlatform(declared) ?? parsePlatformFromUserAgent(userAgent)
}
