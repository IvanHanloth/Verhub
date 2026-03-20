import { UnauthorizedException } from "@nestjs/common"

export function resolveRequestedScopes(
  scopes: string[] | undefined,
  availableScopes: readonly string[],
  defaultScopes: readonly string[],
): string[] {
  const requestedScopes = scopes?.length ? scopes : [...defaultScopes]
  const availableScopeSet = new Set<string>(availableScopes)
  const invalidScopes = requestedScopes.filter((scope) => !availableScopeSet.has(scope))
  if (invalidScopes.length > 0) {
    throw new UnauthorizedException(`Invalid api scopes: ${invalidScopes.join(", ")}`)
  }

  return requestedScopes
}

export function resolveExpiresAt(expiresInDays?: number, neverExpires?: boolean): Date | null {
  if (neverExpires) {
    return null
  }

  const days = expiresInDays ?? 30
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000)
}

export function normalizeProjectIds(projectIds?: string[]): string[] {
  return Array.from(new Set((projectIds ?? []).map((item) => item.trim()).filter(Boolean)))
}
