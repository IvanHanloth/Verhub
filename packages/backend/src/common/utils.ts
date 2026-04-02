/** Shared utility functions used across multiple backend modules. */

/** Return the current time as Unix seconds (integer). */
export function nowSeconds(): number {
  return Math.floor(Date.now() / 1000)
}

/** Normalize a project key to lowercase with no surrounding whitespace. */
export function normalizeProjectKey(projectKey: string): string {
  return projectKey.trim().toLowerCase()
}

/** Check if a Prisma error is a unique constraint violation (P2002). */
export function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== "object" || error === null) {
    return false
  }
  return "code" in error && error.code === "P2002"
}
