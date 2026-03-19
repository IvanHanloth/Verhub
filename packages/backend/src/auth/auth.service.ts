import { randomBytes, createHash } from "node:crypto"
import { access, mkdir, unlink, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"

import { Injectable, OnModuleInit, UnauthorizedException } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import { JwtService } from "@nestjs/jwt"

import * as bcrypt from "bcrypt"

import { PrismaService } from "../database/prisma.service"
import { CreateApiKeyDto } from "./dto/create-api-key.dto"
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

type ApiKeyValidationResult = {
  valid: boolean
  keyId?: string
}

const BOOTSTRAP_FILENAME = "verhub.bootstrap-admin.txt"

@Injectable()
export class AuthService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.ensureAdminUserExists()
  }

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

    await this.removeBootstrapCredentialFile()

    return loginResult
  }

  async validateApiKey(apiKey: string, requiredScope?: string): Promise<boolean> {
    const result = await this.validateApiKeyWithScope(apiKey, requiredScope)
    if (!result.valid || !result.keyId) {
      return false
    }

    await this.prisma.apiKey.update({
      where: { id: result.keyId },
      data: { lastUsedAt: new Date() },
    })

    return true
  }

  async listApiKeys() {
    const keys = await this.prisma.apiKey.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        scopes: true,
        isActive: true,
        expiresAt: true,
        lastUsedAt: true,
        createdAt: true,
        revokedAt: true,
      },
    })

    return {
      data: keys.map((item) => ({
        id: item.id,
        name: item.name,
        scopes: item.scopes,
        is_active: item.isActive,
        expires_at: item.expiresAt,
        last_used_at: item.lastUsedAt,
        created_at: item.createdAt,
        revoked_at: item.revokedAt,
      })),
    }
  }

  async createApiKey(dto: CreateApiKeyDto, actorId: string) {
    const expiresInDays = dto.expires_in_days ?? 30
    const rawToken = `vh_${randomBytes(24).toString("hex")}`
    const keyHash = this.hashApiKey(rawToken)

    const created = await this.prisma.apiKey.create({
      data: {
        name: dto.name.trim(),
        keyHash,
        scopes: dto.scopes?.length ? dto.scopes : ["versions:write"],
        createdById: actorId,
        expiresAt: new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000),
      },
      select: {
        id: true,
        name: true,
        scopes: true,
        expiresAt: true,
        createdAt: true,
      },
    })

    return {
      id: created.id,
      name: created.name,
      token: rawToken,
      scopes: created.scopes,
      expires_at: created.expiresAt,
      created_at: created.createdAt,
    }
  }

  async revokeApiKey(id: string) {
    await this.prisma.apiKey.update({
      where: { id },
      data: {
        isActive: false,
        revokedAt: new Date(),
      },
    })
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
    } = {}

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

  private async validateApiKeyWithScope(
    apiKey: string,
    requiredScope?: string,
  ): Promise<ApiKeyValidationResult> {
    const keyHash = this.hashApiKey(apiKey)
    const now = new Date()

    const found = await this.prisma.apiKey.findFirst({
      where: {
        keyHash,
        isActive: true,
        revokedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      select: {
        id: true,
        scopes: true,
      },
    })

    if (!found) {
      return { valid: false }
    }

    if (requiredScope && !found.scopes.includes(requiredScope)) {
      return { valid: false }
    }

    return {
      valid: true,
      keyId: found.id,
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

  private async ensureAdminUserExists(): Promise<void> {
    const adminCount = await this.prisma.user.count()
    if (adminCount > 0) {
      return
    }

    const username = "admin"
    const configuredPassword = this.configService.get<string>("ADMIN_PASSWORD")?.trim()
    const isGeneratedPassword = !configuredPassword
    const bootstrapPassword = configuredPassword || this.generatePassword()
    const passwordHash = await bcrypt.hash(bootstrapPassword, 10)

    await this.prisma.user.create({
      data: {
        username,
        passwordHash,
        role: "ADMIN",
      },
    })

    const bootstrapFilePath = await this.writeBootstrapCredentialFile(username, bootstrapPassword)

    if (isGeneratedPassword) {
      console.info("[verhub][bootstrap] admin account initialized")
      console.info(`[verhub][bootstrap] username=${username}`)
      console.info(`[verhub][bootstrap] password=${bootstrapPassword}`)
      console.info(`[verhub][bootstrap] credential_file=${bootstrapFilePath}`)
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

  private generatePassword(): string {
    return randomBytes(12).toString("base64url")
  }

  private async writeBootstrapCredentialFile(username: string, password: string): Promise<string> {
    const filePath = await this.resolveBootstrapFilePath()
    const dirPath = dirname(filePath)
    await mkdir(dirPath, { recursive: true })

    const content = [
      "# Verhub bootstrap admin credential",
      `username=${username}`,
      `password=${password}`,
      "warning=delete this file after first successful login",
      `created_at=${new Date().toISOString()}`,
      "",
    ].join("\n")

    await writeFile(filePath, content, { encoding: "utf-8" })
    return filePath
  }

  private async removeBootstrapCredentialFile(): Promise<void> {
    const filePath = await this.resolveBootstrapFilePath()
    try {
      await unlink(filePath)
    } catch {
      return
    }
  }

  private async resolveBootstrapFilePath(): Promise<string> {
    const configuredDir = this.configService.get<string>("BOOTSTRAP_SECRET_DIR")?.trim()
    if (configuredDir) {
      return join(configuredDir, BOOTSTRAP_FILENAME)
    }

    let current = process.cwd()
    while (true) {
      const markerPath = join(current, "pnpm-workspace.yaml")
      const hasMarker = await this.pathExists(markerPath)
      if (hasMarker) {
        return join(current, BOOTSTRAP_FILENAME)
      }

      const parent = dirname(current)
      if (parent === current) {
        break
      }
      current = parent
    }

    return join(process.cwd(), BOOTSTRAP_FILENAME)
  }

  private async pathExists(path: string): Promise<boolean> {
    try {
      await access(path)
      return true
    } catch {
      return false
    }
  }

  getStatus(): { module: string; implemented: boolean } {
    return {
      module: "auth",
      implemented: true,
    }
  }

  private hashApiKey(rawApiKey: string): string {
    const salt = this.configService.get<string>("API_KEY_SALT") ?? ""
    return createHash("sha256").update(`${rawApiKey}:${salt}`).digest("hex")
  }
}
