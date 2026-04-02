/**
 * Core authentication service.
 *
 * Responsible for admin login (JWT issuance), admin profile management,
 * and module status. API key operations are delegated to
 * ApiKeyManagementService. Bootstrap logic is delegated to
 * AdminBootstrapService.
 */

import { Injectable, UnauthorizedException } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import { JwtService } from "@nestjs/jwt"

import * as bcrypt from "bcrypt"

import { PrismaService } from "../database/prisma.service"
import { nowSeconds } from "../common/utils"
import { AdminBootstrapService } from "./admin-bootstrap.service"
import { LoginDto } from "./dto/login.dto"
import { UpdateAdminProfileDto } from "./dto/update-admin-profile.dto"
import { parseExpiresInToSeconds } from "./utils/jwt-expiration"

type LoginResponse = {
  access_token: string
  expires_in: number
  user: {
    id: string
    username: string
    role: "ADMIN"
    must_change_password: boolean
  }
}

type AdminContext = {
  id: string
  username: string
  role: "ADMIN"
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly adminBootstrapService?: AdminBootstrapService,
  ) {}

  async login(dto: LoginDto): Promise<LoginResponse> {
    const user = await this.validateAdminCredentials(dto.username, dto.password)
    if (!user) {
      throw new UnauthorizedException("Invalid username or password")
    }

    const expiresIn = this.configService.get<string>("JWT_EXPIRES_IN")
    const secret = this.configService.get<string>("JWT_SECRET")
    if (!secret) {
      throw new UnauthorizedException("JWT is not configured")
    }

    const payload = {
      sub: user.id,
      username: user.username,
      role: "admin",
    }

    const accessToken = await this.jwtService.signAsync(payload, {
      secret,
    })

    const loginResult = {
      access_token: accessToken,
      expires_in: parseExpiresInToSeconds(expiresIn),
      user: {
        id: user.id,
        username: user.username,
        role: "ADMIN" as const,
        must_change_password: false,
      },
    }

    await this.adminBootstrapService?.removeBootstrapCredentialFile()

    return loginResult
  }

  async getAdminProfile() {
    const admin = await this.getAdminUserOrThrow()

    return {
      id: admin.id,
      username: admin.username,
      role: "ADMIN",
      must_change_password: false,
    }
  }

  async updateAdminProfile(dto: UpdateAdminProfileDto) {
    const admin = await this.getAdminUserOrThrow()

    const currentPasswordValid = await bcrypt.compare(dto.current_password, admin.passwordHash)
    if (!currentPasswordValid) {
      throw new UnauthorizedException("Current password is invalid")
    }

    const nextUsername = dto.username?.trim()
    const nextPassword = dto.new_password?.trim()

    if (!nextUsername && !nextPassword) {
      return {
        id: admin.id,
        username: admin.username,
        role: "ADMIN",
        must_change_password: false,
      }
    }

    const data: {
      username?: string
      passwordHash?: string
      updatedAt: number
    } = {
      updatedAt: nowSeconds(),
    }

    if (nextUsername) {
      data.username = nextUsername
    }

    if (nextPassword) {
      data.passwordHash = await bcrypt.hash(nextPassword, 10)
    }

    const updated = await this.prisma.user.update({
      where: { id: admin.id },
      data,
      select: {
        id: true,
        username: true,
      },
    })

    return {
      id: updated.id,
      username: updated.username,
      role: "ADMIN",
      must_change_password: false,
    }
  }

  getStatus(): { module: string; implemented: boolean } {
    return {
      module: "auth",
      implemented: true,
    }
  }

  private async validateAdminCredentials(
    username: string,
    password: string,
  ): Promise<AdminContext | null> {
    const user = await this.prisma.user.findUnique({
      where: { username },
      select: {
        id: true,
        username: true,
        role: true,
        passwordHash: true,
      },
    })
    if (!user) {
      return null
    }

    const matched = await bcrypt.compare(password, user.passwordHash)
    if (!matched) {
      return null
    }

    return {
      id: user.id,
      username: user.username,
      role: "ADMIN",
    }
  }

  private async getAdminUserOrThrow() {
    const admin = await this.prisma.user.findFirst({
      where: { role: "ADMIN" },
      select: {
        id: true,
        username: true,
        passwordHash: true,
      },
    })

    if (!admin) {
      throw new UnauthorizedException("Admin account is not initialized")
    }

    return admin
  }
}
