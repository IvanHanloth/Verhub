/**
 * API Key management service.
 *
 * Handles all API key lifecycle operations: create, list, update,
 * rotate, revoke, and validation (including grace-period keys).
 * Separated from AuthService to isolate key management from
 * login/profile concerns.
 */

import { createHash, randomBytes } from "node:crypto"

import { Injectable, Logger, UnauthorizedException } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"

import { PrismaService } from "../database/prisma.service"
import { normalizeProjectKey, nowSeconds } from "../common/utils"
import { AVAILABLE_API_SCOPES, DEFAULT_API_SCOPES } from "./constants/api-scopes"
import { CreateApiKeyDto } from "./dto/create-api-key.dto"
import { RotateApiKeyDto } from "./dto/rotate-api-key.dto"
import { UpdateApiKeyDto } from "./dto/update-api-key.dto"
import {
  normalizeProjectIds,
  resolveExpiresAt,
  resolveRequestedScopes,
} from "./services/api-key-policy"

type ApiKeyValidationResult = {
  valid: boolean
  keyId?: string
}

type ProjectScopeContext = {
  projectId?: string
  projectKey?: string
}

@Injectable()
export class ApiKeyManagementService {
  private readonly logger = new Logger(ApiKeyManagementService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

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
      data: { lastUsedAt: nowSeconds() },
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

    const now = nowSeconds()
    if (existing.expiresAt && existing.expiresAt <= now) {
      throw new UnauthorizedException("Api key already expired")
    }

    const graceMinutes = dto.grace_period_minutes ?? 0
    const previousKeyExpiresAt = graceMinutes > 0 ? now + graceMinutes * 60 : null

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
        revokedAt: nowSeconds(),
      },
    })
  }

  private async validateApiKeyWithScope(
    apiKey: string,
    requiredScope?: string,
    projectScope?: ProjectScopeContext,
  ): Promise<ApiKeyValidationResult> {
    const keyHash = this.hashApiKey(apiKey)
    const now = nowSeconds()

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
        `[auth][api-key] expired token rejected key_id=${expiredFound.id} expires_at=${expiredFound.expiresAt}`,
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
        projectKey: { in: normalizedProjectIds },
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
      return record.projectIds.includes(normalizeProjectKey(scope.projectId))
    }

    if (!scope.projectKey) {
      return false
    }

    const project = await this.prisma.project.findUnique({
      where: { projectKey: normalizeProjectKey(scope.projectKey) },
      select: { projectKey: true },
    })
    if (!project) {
      return false
    }

    return record.projectIds.includes(project.projectKey)
  }

  private hashApiKey(rawApiKey: string): string {
    const salt = this.configService.get<string>("API_KEY_SALT") ?? ""
    return createHash("sha256").update(`${rawApiKey}:${salt}`).digest("hex")
  }
}
