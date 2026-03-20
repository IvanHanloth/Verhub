import { randomBytes } from "node:crypto"
import { access, mkdir, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"

import * as bcrypt from "bcrypt"

import { PrismaClient } from "@prisma/client"

const BOOTSTRAP_FILENAME = "verhub.bootstrap-admin.txt"

function generatePassword(): string {
  return randomBytes(12).toString("base64url")
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

async function resolveBootstrapFilePath(): Promise<string> {
  const configuredDir = process.env.BOOTSTRAP_SECRET_DIR?.trim()
  if (configuredDir) {
    return join(configuredDir, BOOTSTRAP_FILENAME)
  }

  let current = process.cwd()
  while (true) {
    const markerPath = join(current, "pnpm-workspace.yaml")
    if (await pathExists(markerPath)) {
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

async function writeBootstrapCredentialFile(username: string, password: string): Promise<string> {
  const filePath = await resolveBootstrapFilePath()
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

async function main(): Promise<void> {
  const prisma = new PrismaClient()

  try {
    const username = "admin"
    const configuredPassword = process.env.ADMIN_PASSWORD?.trim()
    const password = configuredPassword || generatePassword()
    const isGeneratedPassword = !configuredPassword
    const passwordHash = await bcrypt.hash(password, 10)

    const admin = await prisma.user.findFirst({
      where: { role: "ADMIN" },
      select: { id: true },
    })

    if (admin) {
      await prisma.user.update({
        where: { id: admin.id },
        data: {
          username,
          passwordHash,
        },
      })
    } else {
      await prisma.user.create({
        data: {
          username,
          passwordHash,
          role: "ADMIN",
        },
      })
    }

    const bootstrapFilePath = await writeBootstrapCredentialFile(username, password)

    console.info("[verhub][admin-reset] admin credential reset completed")
    console.info(`[verhub][admin-reset] username=${username}`)
    console.info(`[verhub][admin-reset] password=${password}`)
    console.info(`[verhub][admin-reset] credential_file=${bootstrapFilePath}`)
    if (isGeneratedPassword) {
      console.info("[verhub][admin-reset] password source=generated")
    } else {
      console.info("[verhub][admin-reset] password source=ADMIN_PASSWORD env")
    }
  } finally {
    await prisma.$disconnect()
  }
}

void main().catch((error: unknown) => {
  if (error instanceof Error) {
    console.error(`[verhub][admin-reset] failed: ${error.message}`)
  } else {
    console.error("[verhub][admin-reset] failed with unknown error")
  }
  process.exitCode = 1
})
