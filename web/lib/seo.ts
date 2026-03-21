const FALLBACK_SITE_URL = "https://verhub.app"

function ensureUrlProtocol(url: string): string {
  if (url.startsWith("http://") || url.startsWith("https://")) {
    return url
  }

  return `https://${url}`
}

export function resolveSiteUrl(): string {
  const envUrl = process.env.NEXT_PUBLIC_SITE_URL

  if (!envUrl) {
    return FALLBACK_SITE_URL
  }

  const normalized = ensureUrlProtocol(envUrl).replace(/\/$/, "")

  try {
    const parsed = new URL(normalized)
    return parsed.origin
  } catch {
    return FALLBACK_SITE_URL
  }
}

export function toAbsoluteUrl(path: string): string {
  const siteUrl = resolveSiteUrl()
  if (!path || path === "/") {
    return `${siteUrl}/`
  }

  return `${siteUrl}${path.startsWith("/") ? path : `/${path}`}`
}
