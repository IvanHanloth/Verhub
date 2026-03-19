import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common"

import { ApiKeyGuard } from "./api-key.guard"
import { JwtAdminGuard } from "./jwt-admin.guard"

@Injectable()
export class AdminOrApiKeyGuard implements CanActivate {
  constructor(
    private readonly jwtAdminGuard: JwtAdminGuard,
    private readonly apiKeyGuard: ApiKeyGuard,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    try {
      return await this.jwtAdminGuard.canActivate(context)
    } catch {
      return this.apiKeyGuard.canActivate(context)
    }
  }
}
