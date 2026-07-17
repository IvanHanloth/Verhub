import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common"

import { ApiKeyGuard } from "./api-key.guard"
import { extractApiKey, extractBearerToken } from "./credential"
import { JwtAdminGuard } from "./jwt-admin.guard"

/**
 * Accepts either an admin JWT or an API key — the two are equivalent for admin
 * endpoints, and a caller should not have to care which one their script holds.
 *
 * Dispatches on the credential's shape rather than trying one guard and
 * falling back to the other, so a rejected JWT reports why the JWT was
 * rejected instead of the misleading "Missing api key".
 */
@Injectable()
export class AdminOrApiKeyGuard implements CanActivate {
  constructor(
    private readonly jwtAdminGuard: JwtAdminGuard,
    private readonly apiKeyGuard: ApiKeyGuard,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | string[] | undefined>
    }>()

    if (extractApiKey(request)) {
      return this.apiKeyGuard.canActivate(context)
    }

    if (extractBearerToken(request)) {
      return this.jwtAdminGuard.canActivate(context)
    }

    throw new UnauthorizedException(
      "Missing credentials: supply an admin JWT or an API key via Authorization: Bearer, or an API key via X-API-Key",
    )
  }
}
