/** 版本下载链接与文件库之间的匹配、替换工具。 */

import type { Prisma } from "@prisma/client"

import { parseDownloadLinks } from "../versions/version-mapping"

type DownloadLink = { url: string; name?: string; platform?: string }

const GITHUB_ASSET_PATTERN =
  /^https:\/\/github\.com\/[^/]+\/[^/]+\/releases\/download\/[^/]+\/[^/?#]+$/

/** 是否为 GitHub Release 附件下载地址（`https://github.com/{owner}/{repo}/releases/download/{tag}/{name}`）。 */
export function isGithubReleaseAsset(url: string): boolean {
  return GITHUB_ASSET_PATTERN.test(url.trim())
}

/** GitHub Release 附件地址中的文件名（已解码）。 */
export function githubAssetFilename(url: string): string {
  const last = url.trim().split("/").pop() ?? ""
  try {
    return decodeURIComponent(last)
  } catch {
    return last
  }
}

/** URL 的路径是否就是给定的直链路径（`/f/...`，已编码）。忽略协议与域名。 */
export function urlHasPath(url: string, encodedPath: string): boolean {
  try {
    return new URL(url, "http://placeholder.invalid").pathname === encodedPath
  } catch {
    return false
  }
}

/**
 * 把版本的 downloadUrl 与 downloadLinks 中等于 `from` 的地址替换成 `to`。
 * 无变化时返回 null。
 */
export function replaceVersionUrl(
  version: { downloadUrl: string | null; downloadLinks: Prisma.JsonValue | null },
  from: string,
  to: string,
): { downloadUrl: string | null; downloadLinks: DownloadLink[] } | null {
  let changed = false
  const links = parseDownloadLinks(version.downloadLinks).map((link) => {
    if (link.url.trim() !== from) {
      return link
    }
    changed = true
    return { ...link, url: to }
  })

  let downloadUrl = version.downloadUrl
  if (downloadUrl?.trim() === from) {
    downloadUrl = to
    changed = true
  }

  return changed ? { downloadUrl, downloadLinks: links } : null
}

/** 版本引用的全部下载地址（downloadUrl 与 downloadLinks 去重合并）。 */
export function versionUrls(version: {
  downloadUrl: string | null
  downloadLinks: Prisma.JsonValue | null
}): string[] {
  const urls = parseDownloadLinks(version.downloadLinks).map((link) => link.url.trim())
  if (version.downloadUrl?.trim()) {
    urls.push(version.downloadUrl.trim())
  }
  return Array.from(new Set(urls))
}
