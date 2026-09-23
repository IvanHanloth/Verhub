/** 文件名、对象路径与直链的纯函数工具。 */

import { randomBytes } from "node:crypto"
import { extname } from "node:path"

/** 直链与对象路径的公共前缀段。 */
export const DIST_PATH_PREFIX = "f"

const MAX_FILENAME_LENGTH = 180

const FILE_ID_ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz"

/** 生成 12 位小写字母数字的文件 id。 */
export function generateFileId(): string {
  const bytes = randomBytes(12)
  let id = ""
  for (const byte of bytes) {
    id += FILE_ID_ALPHABET[byte % FILE_ID_ALPHABET.length]
  }
  return id
}

/**
 * 把任意字符串收敛成可安全用作单个路径段的文件名。
 * 替换路径分隔符、Windows 保留字符与控制字符为 `_`，去掉首尾空白与点号，超长截断并保留扩展名。
 * 结果为空时返回 null。
 */
export function sanitizeFilename(input: string): string | null {
  // eslint-disable-next-line no-control-regex
  let name = input.normalize("NFC").replace(/[\u0000-\u001f\u007f/\\:*?"<>|]/g, "_")
  name = name
    .trim()
    .replace(/^\.+/, "")
    .replace(/[.\s]+$/, "")
  if (!name) {
    return null
  }

  if (name.length > MAX_FILENAME_LENGTH) {
    const ext = extname(name).slice(0, 20)
    name = name.slice(0, MAX_FILENAME_LENGTH - ext.length) + ext
  }
  return name
}

/** 项目键作为路径段时的安全形式；无可用字符时回落为 `_`。 */
export function safeSegment(value: string): string {
  return sanitizeFilename(value) ?? "_"
}

/** 组装对象路径 `f/{projectKey}/{fileId}/{filename}`。各段须已是安全形式。 */
export function buildObjectKey(projectKey: string, fileId: string, filename: string): string {
  return [DIST_PATH_PREFIX, safeSegment(projectKey), fileId, filename].join("/")
}

/** 对象路径按段做百分号编码，用于 URL。 */
export function encodeObjectKey(objectKey: string): string {
  return objectKey.split("/").map(encodeURIComponent).join("/")
}

/** 直链：配置了分发域名时为绝对地址，否则为以 `/` 开头的相对路径。 */
export function buildDistUrl(baseUrl: string | null, objectKey: string): string {
  return `${baseUrl ?? ""}/${encodeObjectKey(objectKey)}`
}

const CONTENT_TYPES: Record<string, string> = {
  ".msi": "application/x-msi",
  ".msix": "application/msix",
  ".msixbundle": "application/msixbundle",
  ".appx": "application/appx",
  ".appxbundle": "application/appxbundle",
  ".appinstaller": "application/appinstaller",
  ".exe": "application/vnd.microsoft.portable-executable",
  ".dmg": "application/x-apple-diskimage",
  ".pkg": "application/octet-stream",
  ".deb": "application/vnd.debian.binary-package",
  ".rpm": "application/x-rpm",
  ".appimage": "application/vnd.appimage",
  ".apk": "application/vnd.android.package-archive",
  ".aab": "application/octet-stream",
  ".ipa": "application/octet-stream",
  ".zip": "application/zip",
  ".7z": "application/x-7z-compressed",
  ".rar": "application/vnd.rar",
  ".gz": "application/gzip",
  ".tgz": "application/gzip",
  ".xz": "application/x-xz",
  ".bz2": "application/x-bzip2",
  ".zst": "application/zstd",
  ".tar": "application/x-tar",
  ".json": "application/json",
  ".xml": "application/xml",
  ".yml": "text/yaml; charset=utf-8",
  ".yaml": "text/yaml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".sig": "application/octet-stream",
  ".asc": "text/plain; charset=utf-8",
  ".sha256": "text/plain; charset=utf-8",
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".ico": "image/x-icon",
  ".svg": "image/svg+xml",
}

/** 按扩展名推断 Content-Type，未知扩展名为 `application/octet-stream`。 */
export function guessContentType(filename: string): string {
  return CONTENT_TYPES[extname(filename).toLowerCase()] ?? "application/octet-stream"
}

/** 响应头 Content-Disposition：图片内联展示，其余作为附件下载。文件名按 RFC 5987 编码。 */
export function contentDisposition(filename: string, contentType: string): string {
  const type = contentType.startsWith("image/") ? "inline" : "attachment"
  const asciiFallback = filename.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_")
  return `${type}; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`
}
