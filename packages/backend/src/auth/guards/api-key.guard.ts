import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common"
import { Reflector } from "@nestjs/core"

import { AuthService } from "../auth.service"
import { API_SCOPE_KEY } from "./api-scope.decorator"

type RequestLike = {
  headers: Record<string, string | string[] | undefined>
  params?: Record<string, unknown>
  query?: Record<string, unknown>
  body?: Record<string, unknown>
}

function pickString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(
    private readonly authService: AuthService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestLike>()
    const requiredScope = this.reflector.getAllAndOverride<string | undefined>(API_SCOPE_KEY, [
      context.getHandler(),
      context.getClass(),
    ])
    const apiKeyHeader = request.headers["x-api-key"]
    const apiKey = Array.isArray(apiKeyHeader) ? apiKeyHeader[0] : apiKeyHeader

    if (!apiKey) {
      throw new UnauthorizedException("Missing api key")
    }

    const projectId =
      pickString(request.params?.projectId) ??
      pickString(request.params?.project_id) ??
      pickString(request.query?.projectId) ??
      pickString(request.query?.project_id) ??
      pickString(request.body?.projectId) ??
      pickString(request.body?.project_id)
    const projectKey =
      pickString(request.params?.projectKey) ??
      pickString(request.params?.project_key) ??
      pickString(request.query?.projectKey) ??
      pickString(request.query?.project_key) ??
      pickString(request.body?.projectKey) ??
      pickString(request.body?.project_key)

    const valid = await this.authService.validateApiKey(apiKey, requiredScope, {
      projectId,
      projectKey,
    })
    if (!valid) {
      throw new UnauthorizedException("Invalid api key")
    }

    return true
  }
}
