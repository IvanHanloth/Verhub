export const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000/api/v1"

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
    const message = toApiErrorMessage(payload, response.status)

    throw new ApiError(message, response.status, payload)
  }

  return payload as T
}

export function toApiErrorMessage(payload: unknown, status: number): string {
  const fallbackMessage = status === 0 ? "网络连接失败，请稍后重试。" : `Request failed with status ${status}`
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
