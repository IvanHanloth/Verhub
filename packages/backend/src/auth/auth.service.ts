import { createHash } from "node:crypto"

import { Injectable, UnauthorizedException } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import { JwtService } from "@nestjs/jwt"

import * as bcrypt from "bcrypt"

import { PrismaService } from "../database/prisma.service"
import { LoginDto } from "./dto/login.dto"
import { parseExpiresInToSeconds } from "./utils/jwt-expiration"

type LoginResponse = {
  access_token: string
  expires_in: number
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async login(dto: LoginDto): Promise<LoginResponse> {
    const valid = await this.validateAdminCredentials(dto.username, dto.password)
    if (!valid) {
      throw new UnauthorizedException("Invalid username or password")
    }

    const expiresIn = this.configService.get<string>("JWT_EXPIRES_IN")
    const secret = this.configService.get<string>("JWT_SECRET")
    if (!secret) {
      throw new UnauthorizedException("JWT is not configured")
    }

    const payload = {
      sub: dto.username,
      role: "admin",
    }

    const accessToken = await this.jwtService.signAsync(payload, {
      secret,
    })

    return {
      access_token: accessToken,
      expires_in: parseExpiresInToSeconds(expiresIn),
    }
  }

  async validateApiKey(apiKey: string): Promise<boolean> {
    const keyHash = this.hashApiKey(apiKey)
    const found = await this.prisma.apiKey.findFirst({
      where: {
        keyHash,
        isActive: true,
        revokedAt: null,
      },
      select: { id: true },
    })

    if (!found) {
      return false
    }

    await this.prisma.apiKey.update({
      where: { id: found.id },
      data: { lastUsedAt: new Date() },
    })

    return true
  }

  getStatus(): { module: string; implemented: boolean } {
    return {
      module: "auth",
      implemented: true,
    }
  }

  private async validateAdminCredentials(username: string, password: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { username },
      select: {
        username: true,
        passwordHash: true,
      },
    })
    if (user) {
      return bcrypt.compare(password, user.passwordHash)
    }

    const adminUsername = this.configService.get<string>("ADMIN_USERNAME")
    const adminPasswordHash = this.configService.get<string>("ADMIN_PASSWORD_HASH")
    if (!adminUsername || !adminPasswordHash) {
      return false
    }

    if (username !== adminUsername) {
      return false
    }

    return bcrypt.compare(password, adminPasswordHash)
  }

  private hashApiKey(rawApiKey: string): string {
    const salt = this.configService.get<string>("API_KEY_SALT") ?? ""
    return createHash("sha256").update(`${rawApiKey}:${salt}`).digest("hex")
  }
}
