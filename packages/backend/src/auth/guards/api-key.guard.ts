import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common"
import { Reflector } from "@nestjs/core"

import { AuthService } from "../auth.service"
import { API_SCOPE_KEY } from "./api-scope.decorator"

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(
    private readonly authService: AuthService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<{ headers: Record<string, string | string[] | undefined> }>()
    const requiredScope = this.reflector.getAllAndOverride<string | undefined>(API_SCOPE_KEY, [
      context.getHandler(),
      context.getClass(),
    ])
    const apiKeyHeader = request.headers["x-api-key"]
    const apiKey = Array.isArray(apiKeyHeader) ? apiKeyHeader[0] : apiKeyHeader

    if (!apiKey) {
      throw new UnauthorizedException("Missing api key")
    }

    const valid = await this.authService.validateApiKey(apiKey, requiredScope)
    if (!valid) {
      throw new UnauthorizedException("Invalid api key")
    }

    return true
  }
}
