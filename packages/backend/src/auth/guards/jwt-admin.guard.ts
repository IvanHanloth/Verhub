import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import { JwtService } from "@nestjs/jwt"

import { PrismaService } from "../../database/prisma.service"

@Injectable()
export class JwtAdminGuard implements CanActivate {
  private readonly jwtService = new JwtService()

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

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
      const payload = await this.jwtService.verifyAsync<{
        sub?: string
        role?: string
        iat?: number
      }>(token, {
        secret,
      })
      if (payload.role !== "admin" || !payload.sub) {
        throw new UnauthorizedException("Admin role is required")
      }

      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        select: {
          id: true,
          role: true,
          updatedAt: true,
        },
      })

      if (!user || user.role !== "ADMIN") {
        throw new UnauthorizedException("Admin account is invalid")
      }

      if (!payload.iat || payload.iat < user.updatedAt) {
        throw new UnauthorizedException("Token expired due to profile update")
      }

      request.user = payload
      return true
    } catch {
      throw new UnauthorizedException("Invalid bearer token")
    }
  }
}
