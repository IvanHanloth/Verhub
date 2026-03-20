import { randomBytes, createHash } from "node:crypto"
import { access, mkdir, unlink, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"

import { Injectable, Logger, OnModuleInit, UnauthorizedException } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import { JwtService } from "@nestjs/jwt"

import * as bcrypt from "bcrypt"

import { PrismaService } from "../database/prisma.service"
import { AVAILABLE_API_SCOPES, DEFAULT_API_SCOPES } from "./constants/api-scopes"
import { CreateApiKeyDto } from "./dto/create-api-key.dto"
import { LoginDto } from "./dto/login.dto"
import { RotateApiKeyDto } from "./dto/rotate-api-key.dto"
import {
  normalizeProjectIds,
  resolveExpiresAt,
  resolveRequestedScopes,
} from "./services/api-key-policy"
import { UpdateAdminProfileDto } from "./dto/update-admin-profile.dto"
import { UpdateApiKeyDto } from "./dto/update-api-key.dto"
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

type ProjectScopeContext = {
  projectId?: string
  projectKey?: string
}

const BOOTSTRAP_FILENAME = "verhub.bootstrap-admin.txt"

@Injectable()
export class AuthService implements OnModuleInit {
  private readonly logger = new Logger(AuthService.name)

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

  async validateApiKey(
    apiKey: string,
    requiredScope?: string,
    projectScope?: ProjectScopeContext,
  ): Promise<boolean> {
    const result = await this.validateApiKeyWithScope(apiKey, requiredScope, projectScope)
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
        allProjects: true,
        projectIds: true,
        isActive: true,
        expiresAt: true,
        previousKeyExpiresAt: true,
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
        all_projects: item.allProjects,
        project_ids: item.projectIds,
        is_active: item.isActive,
        expires_at: item.expiresAt,
        previous_key_expires_at: item.previousKeyExpiresAt,
        last_used_at: item.lastUsedAt,
        created_at: item.createdAt,
        revoked_at: item.revokedAt,
      })),
    }
  }

  async createApiKey(dto: CreateApiKeyDto, actorId: string) {
    const requestedScopes = resolveRequestedScopes(
      dto.scopes,
      AVAILABLE_API_SCOPES,
      DEFAULT_API_SCOPES,
    )
    const scopeSettings = await this.resolveProjectScopeSettings(dto.all_projects, dto.project_ids)
    const expiresAt = resolveExpiresAt(dto.expires_in_days, dto.never_expires)

    const rawToken = `vh_${randomBytes(24).toString("hex")}`
    const keyHash = this.hashApiKey(rawToken)

    const created = await this.prisma.apiKey.create({
      data: {
        name: dto.name.trim(),
        keyHash,
        scopes: requestedScopes,
        allProjects: scopeSettings.allProjects,
        projectIds: scopeSettings.projectIds,
        createdById: actorId,
        expiresAt,
      },
      select: {
        id: true,
        name: true,
        scopes: true,
        allProjects: true,
        projectIds: true,
        expiresAt: true,
        createdAt: true,
      },
    })

    return {
      id: created.id,
      name: created.name,
      token: rawToken,
      scopes: created.scopes,
      all_projects: created.allProjects,
      project_ids: created.projectIds,
      expires_at: created.expiresAt,
      created_at: created.createdAt,
    }
  }

  async updateApiKey(id: string, dto: UpdateApiKeyDto) {
    const existing = await this.prisma.apiKey.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        scopes: true,
        allProjects: true,
        projectIds: true,
        expiresAt: true,
        createdAt: true,
      },
    })
    if (!existing) {
      throw new UnauthorizedException("Invalid api key id")
    }

    const scopes = dto.scopes
      ? resolveRequestedScopes(dto.scopes, AVAILABLE_API_SCOPES, DEFAULT_API_SCOPES)
      : existing.scopes
    const scopeSettings =
      dto.all_projects !== undefined || dto.project_ids !== undefined
        ? await this.resolveProjectScopeSettings(dto.all_projects, dto.project_ids)
        : {
            allProjects: existing.allProjects,
            projectIds: existing.projectIds,
          }

    const expiresAt =
      dto.expires_in_days !== undefined || dto.never_expires !== undefined
        ? resolveExpiresAt(dto.expires_in_days, dto.never_expires)
        : existing.expiresAt

    const updated = await this.prisma.apiKey.update({
      where: { id },
      data: {
        name: dto.name?.trim() || existing.name,
        scopes,
        allProjects: scopeSettings.allProjects,
        projectIds: scopeSettings.projectIds,
        expiresAt,
      },
      select: {
        id: true,
        name: true,
        scopes: true,
        allProjects: true,
        projectIds: true,
        expiresAt: true,
        createdAt: true,
      },
    })

    return {
      id: updated.id,
      name: updated.name,
      scopes: updated.scopes,
      all_projects: updated.allProjects,
      project_ids: updated.projectIds,
      expires_at: updated.expiresAt,
      created_at: updated.createdAt,
    }
  }

  async rotateApiKey(id: string, dto: RotateApiKeyDto) {
    const existing = await this.prisma.apiKey.findUnique({
      where: { id },
      select: {
        id: true,
        keyHash: true,
        isActive: true,
        revokedAt: true,
        expiresAt: true,
      },
    })

    if (!existing || !existing.isActive || existing.revokedAt) {
      throw new UnauthorizedException("Invalid api key id")
    }

    const now = Date.now()
    if (existing.expiresAt && existing.expiresAt.getTime() <= now) {
      throw new UnauthorizedException("Api key already expired")
    }

    const graceMinutes = dto.grace_period_minutes ?? 0
    const previousKeyExpiresAt = graceMinutes > 0 ? new Date(now + graceMinutes * 60 * 1000) : null

    const rawToken = `vh_${randomBytes(24).toString("hex")}`
    const nextKeyHash = this.hashApiKey(rawToken)

    await this.prisma.apiKey.update({
      where: { id },
      data: {
        keyHash: nextKeyHash,
        previousKeyHash: existing.keyHash,
        previousKeyExpiresAt,
        lastUsedAt: null,
      },
    })

    return {
      id,
      token: rawToken,
      grace_period_minutes: graceMinutes,
      previous_key_expires_at: previousKeyExpiresAt,
    }
  }

  getApiScopes() {
    return {
      data: AVAILABLE_API_SCOPES,
      default: DEFAULT_API_SCOPES,
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
    projectScope?: ProjectScopeContext,
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
        allProjects: true,
        projectIds: true,
      },
    })

    if (found) {
      const hasScope = !requiredScope || found.scopes.includes(requiredScope)
      if (!hasScope) {
        return { valid: false }
      }

      const allowed = await this.isProjectAllowed(found, projectScope)
      if (!allowed) {
        return { valid: false }
      }

      return {
        valid: true,
        keyId: found.id,
      }
    }

    const expiredFound = await this.prisma.apiKey.findFirst({
      where: {
        keyHash,
        isActive: true,
        revokedAt: null,
        expiresAt: { lte: now },
      },
      select: {
        id: true,
        expiresAt: true,
      },
    })

    if (expiredFound?.expiresAt) {
      this.logger.warn(
        `[auth][api-key] expired token rejected key_id=${expiredFound.id} expires_at=${expiredFound.expiresAt.toISOString()}`,
      )
      return { valid: false }
    }

    const graceFound = await this.prisma.apiKey.findFirst({
      where: {
        previousKeyHash: keyHash,
        isActive: true,
        revokedAt: null,
        previousKeyExpiresAt: { gt: now },
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      select: {
        id: true,
        scopes: true,
        allProjects: true,
        projectIds: true,
      },
    })

    if (!graceFound) {
      return { valid: false }
    }

    if (requiredScope && !graceFound.scopes.includes(requiredScope)) {
      return { valid: false }
    }

    const allowed = await this.isProjectAllowed(graceFound, projectScope)
    if (!allowed) {
      return { valid: false }
    }

    return {
      valid: true,
      keyId: graceFound.id,
    }
  }

  private async resolveProjectScopeSettings(allProjects?: boolean, projectIds?: string[]) {
    const useAllProjects = allProjects ?? true
    const normalizedProjectIds = normalizeProjectIds(projectIds)

    if (useAllProjects) {
      return {
        allProjects: true,
        projectIds: [],
      }
    }

    if (normalizedProjectIds.length === 0) {
      throw new UnauthorizedException("project_ids is required when all_projects is false")
    }

    const count = await this.prisma.project.count({
      where: {
        id: { in: normalizedProjectIds },
      },
    })

    if (count !== normalizedProjectIds.length) {
      throw new UnauthorizedException("project_ids contains unknown project")
    }

    return {
      allProjects: false,
      projectIds: normalizedProjectIds,
    }
  }

  private async isProjectAllowed(
    record: { allProjects: boolean; projectIds: string[] },
    scope?: ProjectScopeContext,
  ): Promise<boolean> {
    if (record.allProjects !== false) {
      return true
    }

    if (!scope?.projectId && !scope?.projectKey) {
      return false
    }

    if (scope.projectId) {
      return record.projectIds.includes(scope.projectId)
    }

    if (!scope.projectKey) {
      return false
    }

    const project = await this.prisma.project.findUnique({
      where: { projectKey: scope.projectKey },
      select: { id: true },
    })
    if (!project) {
      return false
    }

    return record.projectIds.includes(project.id)
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
