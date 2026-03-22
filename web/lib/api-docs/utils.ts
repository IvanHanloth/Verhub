import { API_BASE_URL } from "@/lib/api-client"

import type { HttpMethod } from "./types"

type PathParamInput = Record<string, string>
type QueryParamInput = Record<string, string>
const DOC_API_PREFIX = "/api/v1"

export function createEndpointSlug(method: HttpMethod, path: string): string {
  const normalized = path
    .replace(/^\/+/, "")
    .replace(/\{([^}]+)\}/g, "by-$1")
    .replace(/[^a-zA-Z0-9/-]/g, "")
    .replace(/\//g, "-")
    .toLowerCase()

  return `${method.toLowerCase()}-${normalized}`
}

export function resolvePathTemplate(pathTemplate: string, params: PathParamInput): string {
  return pathTemplate.replace(/\{([^}]+)\}/g, (_, key: string) => {
    const value = params[key]
    if (!value) {
      return `{${key}}`
    }

    return encodeURIComponent(value)
  })
}

export function buildTryItOutUrl(
  pathTemplate: string,
  pathParams: PathParamInput,
  queryParams: QueryParamInput,
): string {
  const resolvedPath = resolvePathTemplate(pathTemplate, pathParams)
  const base = API_BASE_URL.endsWith("/") ? API_BASE_URL.slice(0, -1) : API_BASE_URL
  const query = new URLSearchParams()

  for (const [key, value] of Object.entries(queryParams)) {
    if (value.trim()) {
      query.set(key, value)
    }
  }

  const queryString = query.toString()
  return queryString ? `${base}${resolvedPath}?${queryString}` : `${base}${resolvedPath}`
}

export function toApiDocDisplayPath(path: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`

  if (normalizedPath === DOC_API_PREFIX || normalizedPath.startsWith(`${DOC_API_PREFIX}/`)) {
    return normalizedPath
  }

  return `${DOC_API_PREFIX}${normalizedPath}`
}
