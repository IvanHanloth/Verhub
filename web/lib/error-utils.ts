import { ApiError } from "@/lib/api-client"

/**
 * Extract a user-friendly error message from an unknown error.
 * Shared across all dashboard components to avoid duplication.
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return `${error.message} (HTTP ${error.status})`
  }

  if (error instanceof Error) {
    return error.message
  }

  return "请求失败，请稍后再试。"
}
