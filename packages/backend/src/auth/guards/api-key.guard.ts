import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from "@nestjs/common"
import { Reflector } from "@nestjs/core"

import { ApiKeyManagementService } from "../api-key-management.service"
import { API_SCOPE_KEY } from "./api-scope.decorator"
import { extractApiKey } from "./credential"

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
  private readonly logger = new Logger(ApiKeyGuard.name)

  constructor(
    private readonly apiKeyManagementService: ApiKeyManagementService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestLike>()
    const requiredScope = this.reflector.getAllAndOverride<string | undefined>(API_SCOPE_KEY, [
      context.getHandler(),
      context.getClass(),
    ])
    const apiKey = extractApiKey(request)

    if (!apiKey) {
      throw new UnauthorizedException("Missing api key")
    }

    // Fail closed: an endpoint that declares no scope has not opted into API
    // key access, so a forgotten @RequireApiScope can never widen what a key
    // can reach. Admin JWT callers are unaffected — they never reach here.
    if (!requiredScope) {
      this.logger.error(
        `[auth][api-key] endpoint ${context.getClass().name}.${context.getHandler().name} accepts api keys but declares no @RequireApiScope; denying`,
      )
      throw new UnauthorizedException("API key is not accepted on this endpoint")
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

    const valid = await this.apiKeyManagementService.validateApiKey(apiKey, requiredScope, {
      projectId,
      projectKey,
    })
    if (!valid) {
      throw new UnauthorizedException("Invalid api key")
    }

    return true
  }
}
