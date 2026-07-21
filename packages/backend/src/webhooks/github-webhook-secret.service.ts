/**
 * Webhook secret lifecycle for a project's GitHub release integration.
 *
 * The secret is readable only once, at the moment it is set or regenerated —
 * the same rule the admin UI already applies to API keys. Afterwards only a
 * 4-character hint is returned, which is enough to tell two secrets apart in
 * the UI without letting a `projects:read` token forge a delivery.
 */

import { randomBytes } from "node:crypto"

import { Injectable, NotFoundException } from "@nestjs/common"

import { PrismaService } from "../database/prisma.service"
import { normalizeProjectKey, nowSeconds } from "../common/utils"
import type { GithubWebhookSecretRevealed, GithubWebhookSettings } from "./types"

type ProjectWebhookRecord = {
  projectKey: string
  githubWebhookSecret: string | null
  githubWebhookSecretUpdatedAt: number | null
}

@Injectable()
export class GithubWebhookSecretService {
  constructor(private readonly prisma: PrismaService) {}

  async getSettings(projectKey: string): Promise<GithubWebhookSettings> {
    return toSettings(await this.requireProject(projectKey))
  }

  /** Replace the secret with a freshly generated one and reveal it once. */
  async regenerate(projectKey: string): Promise<GithubWebhookSecretRevealed> {
    return this.persistSecret(projectKey, `whsec_${randomBytes(24).toString("hex")}`)
  }

  /** Store an operator-supplied secret, for repositories already wired to one. */
  async setSecret(projectKey: string, secret: string): Promise<GithubWebhookSecretRevealed> {
    return this.persistSecret(projectKey, secret.trim())
  }

  /** Clear the secret, which disables the delivery endpoint for this project. */
  async clearSecret(projectKey: string): Promise<GithubWebhookSettings> {
    const project = await this.requireProject(projectKey)
    const updated = await this.prisma.project.update({
      where: { projectKey: project.projectKey },
      data: { githubWebhookSecret: null, githubWebhookSecretUpdatedAt: null },
      select: SELECT_WEBHOOK_FIELDS,
    })

    return toSettings(updated)
  }

  private async persistSecret(
    projectKey: string,
    secret: string,
  ): Promise<GithubWebhookSecretRevealed> {
    const project = await this.requireProject(projectKey)
    const updated = await this.prisma.project.update({
      where: { projectKey: project.projectKey },
      data: { githubWebhookSecret: secret, githubWebhookSecretUpdatedAt: nowSeconds() },
      select: SELECT_WEBHOOK_FIELDS,
    })

    return { ...toSettings(updated), secret }
  }

  private async requireProject(projectKey: string): Promise<ProjectWebhookRecord> {
    const project = await this.prisma.project.findUnique({
      where: { projectKey: normalizeProjectKey(projectKey) },
      select: SELECT_WEBHOOK_FIELDS,
    })
    if (!project) {
      throw new NotFoundException("Project not found")
    }

    return project
  }
}

const SELECT_WEBHOOK_FIELDS = {
  projectKey: true,
  githubWebhookSecret: true,
  githubWebhookSecretUpdatedAt: true,
} as const

function toSettings(project: ProjectWebhookRecord): GithubWebhookSettings {
  const secret = project.githubWebhookSecret

  return {
    enabled: Boolean(secret),
    payload_path: `/api/v1/webhooks/github/${project.projectKey}`,
    content_type: "application/json",
    secret_hint: secret ? secret.slice(-4) : null,
    secret_updated_at: project.githubWebhookSecretUpdatedAt,
  }
}
