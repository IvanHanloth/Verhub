/**
 * Credential extraction shared by the auth guards.
 *
 * Admin endpoints accept two interchangeable credentials, both on
 * `Authorization: Bearer <credential>`:
 *
 * - an admin JWT (short-lived, issued by `POST /auth/login`)
 * - an API key (long-lived, `vh_`-prefixed)
 *
 * API keys are also accepted on the legacy `X-API-Key` header. The two kinds
 * are told apart by the `vh_` prefix, which a JWT can never have: a JWT is
 * three base64url segments separated by dots, and base64url has no `_` in the
 * position the prefix occupies.
 */

export const API_KEY_PREFIX = "vh_"

type RequestLike = {
  headers: Record<string, string | string[] | undefined>
}

function headerValue(value: string | string[] | undefined): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value
  if (typeof raw !== "string") {
    return undefined
  }
  const trimmed = raw.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

/** The raw `Authorization: Bearer` payload, if present. */
export function extractBearerToken(request: RequestLike): string | undefined {
  const authHeader = headerValue(request.headers.authorization)
  if (!authHeader || !/^Bearer\s+/i.test(authHeader)) {
    return undefined
  }
  const token = authHeader.replace(/^Bearer\s+/i, "").trim()
  return token.length > 0 ? token : undefined
}

/**
 * The API key for this request, from either `X-API-Key` or a `vh_`-prefixed
 * bearer token. Returns undefined when the request carries no API key, which
 * includes the case of a bearer token that is a JWT.
 */
export function extractApiKey(request: RequestLike): string | undefined {
  const headerKey = headerValue(request.headers["x-api-key"])
  if (headerKey) {
    return headerKey
  }

  const bearer = extractBearerToken(request)
  return bearer?.startsWith(API_KEY_PREFIX) ? bearer : undefined
}
