/**
 * Admin bootstrap service.
 *
 * Handles first-run admin account creation and bootstrap credential
 * file lifecycle. Separated from AuthService to isolate one-time
 * initialization concern from ongoing auth operations.
 */

import { access, mkdir, unlink, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { randomBytes } from "node:crypto"

import { Injectable, Logger, OnModuleInit } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"

import * as bcrypt from "bcrypt"

import { PrismaService } from "../database/prisma.service"
import { nowSeconds } from "../common/utils"

const BOOTSTRAP_FILENAME = "verhub.bootstrap-admin.txt"

@Injectable()
export class AdminBootstrapService implements OnModuleInit {
  private readonly logger = new Logger(AdminBootstrapService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.ensureAdminUserExists()
  }

  async removeBootstrapCredentialFile(): Promise<void> {
    const filePath = await this.resolveBootstrapFilePath()
    try {
      await unlink(filePath)
    } catch {
      return
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
        updatedAt: nowSeconds(),
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
      `created_at=${nowSeconds()}`,
      "",
    ].join("\n")

    await writeFile(filePath, content, { encoding: "utf-8" })
    return filePath
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
}
