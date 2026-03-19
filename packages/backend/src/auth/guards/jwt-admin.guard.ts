import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import { JwtService } from "@nestjs/jwt"

@Injectable()
export class JwtAdminGuard implements CanActivate {
  private readonly jwtService = new JwtService()

  constructor(private readonly configService: ConfigService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<{ headers: Record<string, string>; user?: unknown }>()
    const authHeader = request.headers.authorization

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      throw new UnauthorizedException("Missing bearer token")
    }

    const token = authHeader.slice(7).trim()
    const secret = this.configService.get<string>("JWT_SECRET")
    if (!secret) {
      throw new UnauthorizedException("JWT is not configured")
    }

    try {
      const payload = await this.jwtService.verifyAsync<{ role?: string }>(token, { secret })
      if (payload.role !== "admin") {
        throw new UnauthorizedException("Admin role is required")
      }
      request.user = payload
      return true
    } catch {
      throw new UnauthorizedException("Invalid bearer token")
    }
  }
}
