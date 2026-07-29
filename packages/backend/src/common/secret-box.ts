/**
 * 对称加密小工具，用于把必须可还原的机密（如 GitHub App 私钥）落库。
 *
 * 与口令哈希不同：这些机密之后还要拿原文去签 JWT，散列无法满足，只能加密。
 * 密钥派生自 JWT_SECRET —— 它已经是部署必填且必须保密的实例机密，复用它
 * 避免再引入一个"忘了设就悄悄不安全"的环境变量。派生时混入用途标签，
 * 保证这里的密钥与 JWT 签名密钥即便同源也不同值。
 */

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto"

const VERSION = "v1"
const ALGORITHM = "aes-256-gcm"
const IV_LENGTH = 12

function deriveKey(purpose: string): Buffer {
  const secret = process.env.JWT_SECRET
  if (!secret) {
    throw new Error("JWT_SECRET is required to encrypt stored secrets")
  }
  return createHash("sha256").update(`${secret}:verhub-secret-box:${purpose}`).digest()
}

/** 加密为 `v1:<iv>:<tag>:<data>`（base64 分段），可安全落库。 */
export function sealSecret(plaintext: string, purpose: string): string {
  const key = deriveKey(purpose)
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, key, iv)
  const data = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()])
  const tag = cipher.getAuthTag()
  return [VERSION, iv.toString("base64"), tag.toString("base64"), data.toString("base64")].join(":")
}

/** 解密 sealSecret 的产物。格式不对或密钥不匹配时抛错，调用方决定如何呈现。 */
export function openSecret(sealed: string, purpose: string): string {
  const [version, ivPart, tagPart, dataPart] = sealed.split(":")
  if (version !== VERSION || !ivPart || !tagPart || !dataPart) {
    throw new Error("Sealed secret has an unrecognized format")
  }

  const key = deriveKey(purpose)
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivPart, "base64"))
  decipher.setAuthTag(Buffer.from(tagPart, "base64"))
  return Buffer.concat([
    decipher.update(Buffer.from(dataPart, "base64")),
    decipher.final(),
  ]).toString("utf8")
}

/** SHA-256 指纹（前 16 个 hex 字符），给 UI 区分"换没换过"而不暴露内容。 */
export function secretFingerprint(plaintext: string): string {
  return createHash("sha256").update(plaintext).digest("hex").slice(0, 16)
}

/** 明文回读时保留的尾部字符数。改这里两处 webhook secret 的提示同步变化。 */
export const SECRET_HINT_LENGTH = 6

/**
 * 明文 secret 对外的安全摘要：尾部若干位 + 总长度。
 *
 * 项目级 Release Webhook 与实例级 GitHub App 的 secret 都按这个口径回读 ——
 * 管理端据此画一条与真实长度等宽的掩码，两处口径不一致会让人以为换过 secret。
 */
export function describeSecret(secret: string | null | undefined): {
  hint: string | null
  length: number | null
} {
  if (!secret) {
    return { hint: null, length: null }
  }
  return { hint: secret.slice(-SECRET_HINT_LENGTH), length: secret.length }
}
