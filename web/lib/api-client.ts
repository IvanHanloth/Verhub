import { clearSessionToken } from "@/lib/auth-session"

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "/api/v1"

/**
 * 把后端给的绝对路径（如 webhook 的 payload_path）拼成完整 URL。
 *
 * API 独立部署时以 API_BASE_URL 为源，否则用当前站点源 —— 这正是要粘进 GitHub
 * 表单里的那个地址，猜错源等于给出一个打不通的 webhook。SSR 阶段没有 window，
 * 原样返回路径，等客户端水合后再补全。
 */
export function resolveApiUrl(path: string): string {
  if (typeof window === "undefined") {
    return path
  }
  const base = API_BASE_URL.startsWith("http") ? API_BASE_URL : window.location.origin
  return new URL(path, base).toString()
}

/**
 * 把列表接口的查询参数拼成查询串。
 *
 * undefined / null / 空串一律不落进 URL：后台的筛选控件用空串表示「不限」，
 * 若原样发出去，后端收到的是 `platform=` 这种空值参数，校验器会当成非法取值。
 */
export function buildListQuery(
  params: Record<string, string | number | boolean | undefined | null>,
): string {
  const query = new URLSearchParams()

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") {
      continue
    }
    query.set(key, String(value))
  }

  return query.toString()
}

export class ApiError extends Error {
  readonly status: number
  readonly details: unknown

  constructor(message: string, status: number, details?: unknown) {
    super(message)
    this.name = "ApiError"
    this.status = status
    this.details = details
  }
}

type ErrorPayload = {
  message?: string | string[]
}

type RequestOptions = {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE"
  token?: string
  body?: unknown
  signal?: AbortSignal
}

export async function requestJson<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", token, body, signal } = options

  let response: Response
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      signal,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch (error: unknown) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw error
    }

    throw new ApiError("网络连接失败，请检查后端服务是否可用。", 0)
  }

  const contentType = response.headers.get("content-type") ?? ""
  const isJson = contentType.includes("application/json")
  const payload = isJson ? await response.json() : null

  if (!response.ok) {
    if (response.status === 401 && typeof window !== "undefined") {
      clearSessionToken()
      const pathname = window.location.pathname
      if (pathname === "/admin" || pathname.startsWith("/admin/")) {
        const returnTo = encodeURIComponent(`${pathname}${window.location.search}`)
        window.location.assign(`/login?returnTo=${returnTo}`)
      }
    }

    const message = toApiErrorMessage(payload, response.status)

    throw new ApiError(message, response.status, payload)
  }

  return payload as T
}

export function toApiErrorMessage(payload: unknown, status: number): string {
  const fallbackMessage =
    status === 0 ? "网络连接失败，请稍后重试。" : `Request failed with status ${status}`
  if (!payload || typeof payload !== "object") {
    return fallbackMessage
  }

  const typedPayload = payload as ErrorPayload
  const message = typedPayload.message
  if (Array.isArray(message)) {
    return message.join("; ") || fallbackMessage
  }

  if (typeof message === "string" && message.trim()) {
    return message
  }

  return fallbackMessage
}

export function isAuthError(error: unknown): boolean {
  return error instanceof ApiError && error.status === 401
}
