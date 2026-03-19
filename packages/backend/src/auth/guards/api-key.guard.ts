import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common"

import { AuthService } from "../auth.service"

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{ headers: Record<string, string | string[] | undefined> }>()
    const apiKeyHeader = request.headers["x-api-key"]
    const apiKey = Array.isArray(apiKeyHeader) ? apiKeyHeader[0] : apiKeyHeader

    if (!apiKey) {
      throw new UnauthorizedException("Missing api key")
    }

    const valid = await this.authService.validateApiKey(apiKey)
    if (!valid) {
      throw new UnauthorizedException("Invalid api key")
    }

    return true
  }
}
