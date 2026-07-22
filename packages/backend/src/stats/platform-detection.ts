import { Platform } from "@prisma/client"

/** Header an SDK sets to declare its platform explicitly. */
export const PLATFORM_HEADER = "x-verhub-platform"

/** Header an SDK sets to declare the concrete OS version, e.g. `11` / `ubuntu 24.04`. */
export const PLATFORM_VERSION_HEADER = "x-verhub-platform-version"

/**
 * 系统版本明细的长度上限。真实取值都是 "11"、"ubuntu 24.04"、"15.1.1" 这个量级；
 * 更长的不是明细而是往聚合表灌垃圾，直接截断丢弃。
 */
export const MAX_PLATFORM_VERSION_LENGTH = 32

/** 平台 + 系统版本明细。`version` 为空串表示无从得知。 */
export type PlatformInfo = {
  platform: Platform
  version: string
}

/**
 * 平台标识 token。
 *
 * `keep` 决定这个 token 本身算不算版本明细的一部分：`windows` 只是平台名，
 * 剥离后剩下的 "11" 才是明细；`ubuntu` 是发行版名，剥离就把信息弄丢了，
 * 所以整串保留成 "ubuntu 24.04"。少了这个区分，"windows 11" 和 "11" 会分成
 * 两个桶，而 "ubuntu 24.04" 会退化成谁都认不出的 "24.04"。
 */
type PlatformToken = { platform: Platform; keep: boolean }

const PLATFORM_TOKENS = new Map<string, PlatformToken>([
  ["windows", { platform: Platform.WINDOWS, keep: false }],
  ["win", { platform: Platform.WINDOWS, keep: false }],
  ["win32", { platform: Platform.WINDOWS, keep: false }],
  ["win64", { platform: Platform.WINDOWS, keep: false }],
  ["winnt", { platform: Platform.WINDOWS, keep: false }],

  ["linux", { platform: Platform.LINUX, keep: false }],
  ["gnu/linux", { platform: Platform.LINUX, keep: false }],
  ["ubuntu", { platform: Platform.LINUX, keep: true }],
  ["debian", { platform: Platform.LINUX, keep: true }],
  ["fedora", { platform: Platform.LINUX, keep: true }],
  ["centos", { platform: Platform.LINUX, keep: true }],
  ["rhel", { platform: Platform.LINUX, keep: true }],
  ["arch", { platform: Platform.LINUX, keep: true }],
  ["manjaro", { platform: Platform.LINUX, keep: true }],
  ["opensuse", { platform: Platform.LINUX, keep: true }],
  ["suse", { platform: Platform.LINUX, keep: true }],
  ["mint", { platform: Platform.LINUX, keep: true }],
  ["deepin", { platform: Platform.LINUX, keep: true }],
  ["uos", { platform: Platform.LINUX, keep: true }],
  ["kylin", { platform: Platform.LINUX, keep: true }],
  ["alpine", { platform: Platform.LINUX, keep: true }],

  ["macos", { platform: Platform.MACOS, keep: false }],
  ["mac os x", { platform: Platform.MACOS, keep: false }],
  ["mac os", { platform: Platform.MACOS, keep: false }],
  ["mac", { platform: Platform.MACOS, keep: false }],
  ["osx", { platform: Platform.MACOS, keep: false }],
  ["os x", { platform: Platform.MACOS, keep: false }],
  ["macintosh", { platform: Platform.MACOS, keep: false }],
  ["darwin", { platform: Platform.MACOS, keep: false }],

  ["ios", { platform: Platform.IOS, keep: false }],
  ["ipados", { platform: Platform.IOS, keep: false }],
  ["iphone", { platform: Platform.IOS, keep: true }],
  ["ipad", { platform: Platform.IOS, keep: true }],
  ["ipod", { platform: Platform.IOS, keep: true }],

  ["android", { platform: Platform.ANDROID, keep: false }],

  ["web", { platform: Platform.WEB, keep: false }],
  ["browser", { platform: Platform.WEB, keep: false }],

  ["others", { platform: Platform.OTHERS, keep: false }],
  ["other", { platform: Platform.OTHERS, keep: false }],
  ["unknown", { platform: Platform.OTHERS, keep: false }],
])

/** 最长前缀优先，否则 "mac" 会先于 "macos" 命中，把 "macos 26" 切成 "os 26"。 */
const TOKENS_BY_LENGTH = [...PLATFORM_TOKENS.keys()].sort((a, b) => b.length - a.length)

/** 小写、去首尾空白、连续空白折叠成单个空格。下划线保持原样：它是版本号的一部分（`10_15_7`）。 */
function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ")
}

/** 明细统一小写归一并截断，超长视为垃圾直接丢弃而不是留半截。 */
function normalizeVersion(value: string): string {
  const trimmed = normalize(value).replace(/^[\s.\-/,;:]+|[\s.\-/,;:]+$/g, "")
  return trimmed.length > MAX_PLATFORM_VERSION_LENGTH ? "" : trimmed
}

/**
 * 解析客户端显式声明的平台字符串，宽容地同时吃下平台与版本。
 *
 * 契约上 `platform` 只允许七个取值、`platform_version` 单独提交，但历史 SDK 和
 * 手写调用方会直接塞 "Windows 11" / "ubuntu 24.02" / "MacOS26"，把这些整串丢进
 * OTHERS 会让统计失真，所以这里按最长 token 前缀切分：token 定平台，剩余部分
 * （必要时含 token 自身）作为版本明细。
 *
 * 完全认不出的返回 null，交由调用方回落到 User-Agent；调用方拿不到别的线索时
 * 才落到 OTHERS，并把原串留作明细——"harmonyos 4" 这种至少还看得见是什么。
 */
export function parseDeclaredPlatform(value: unknown): PlatformInfo | null {
  if (typeof value !== "string") {
    return null
  }

  const normalized = normalize(value)
  if (!normalized) {
    return null
  }

  for (const token of TOKENS_BY_LENGTH) {
    if (!normalized.startsWith(token)) {
      continue
    }
    // token 后面必须是分隔符或数字，否则 "androidx" 会被认成 android。
    const next = normalized.charAt(token.length)
    if (next && /[a-z]/.test(next)) {
      continue
    }

    const { platform, keep } = PLATFORM_TOKENS.get(token)!
    return {
      platform,
      version: normalizeVersion(keep ? normalized : normalized.slice(token.length)),
    }
  }

  return null
}

/** Windows 只在 UA 里暴露 NT 内核号，映射回市场版本号。 */
const WINDOWS_NT_VERSIONS = new Map<string, string>([
  ["6.1", "7"],
  ["6.2", "8"],
  ["6.3", "8.1"],
  // Windows 11 同样上报 NT 10.0，UA 无法区分（只有 UA-CH 才能），统一记成 10。
  ["10.0", "10"],
])

/** iOS/macOS 的 UA 用下划线分隔版本号（`10_15_7`）。 */
function dotted(value: string): string {
  return value.replace(/_/g, ".")
}

/**
 * Best-effort platform inference from a User-Agent string.
 *
 * Order matters: iOS/Android are checked before Mac/Windows/Linux because mobile
 * User-Agents embed desktop tokens ("iPhone; CPU iPhone OS ... like Mac OS X",
 * and Android UAs contain "Linux").
 *
 * 认不出具体系统时返回 OTHERS 而不是 WEB：浏览器 UA 本来就带真实 OS，剩下的是
 * curl、服务端调用这类没有平台可言的流量，记成 WEB 只会虚构出一个平台分布。
 */
export function parsePlatformFromUserAgent(userAgent: unknown): PlatformInfo {
  if (typeof userAgent !== "string" || userAgent.trim().length === 0) {
    return { platform: Platform.OTHERS, version: "" }
  }

  const ua = userAgent.toLowerCase()

  const ios = /(?:iphone|ipad|ipod).*?os (\d+(?:[._]\d+)*)/.exec(ua)
  if (ios) return { platform: Platform.IOS, version: dotted(ios[1]!) }
  if (/iphone|ipad|ipod|ios/.test(ua)) return { platform: Platform.IOS, version: "" }

  const android = /android[ /]?(\d+(?:\.\d+)*)/.exec(ua)
  if (android) return { platform: Platform.ANDROID, version: android[1]! }
  if (/android/.test(ua)) return { platform: Platform.ANDROID, version: "" }

  const windowsNt = /windows nt (\d+\.\d+)/.exec(ua)
  if (windowsNt) {
    return { platform: Platform.WINDOWS, version: WINDOWS_NT_VERSIONS.get(windowsNt[1]!) ?? "" }
  }
  if (/windows|win32|win64/.test(ua)) return { platform: Platform.WINDOWS, version: "" }

  const mac = /mac os x (\d+(?:[._]\d+)*)/.exec(ua)
  if (mac) return { platform: Platform.MACOS, version: dotted(mac[1]!) }
  if (/macintosh|mac os x|darwin/.test(ua)) return { platform: Platform.MACOS, version: "" }

  // 发行版名只有 X11 段里偶尔带（"X11; Ubuntu; Linux x86_64"），能认出就当明细。
  if (/linux|x11/.test(ua)) {
    const distro =
      /(ubuntu|debian|fedora|centos|arch|manjaro|opensuse|suse|mint|deepin|kylin)/.exec(ua)
    return { platform: Platform.LINUX, version: distro ? distro[1]! : "" }
  }

  if (/cros/.test(ua)) return { platform: Platform.OTHERS, version: "chrome os" }

  return { platform: Platform.OTHERS, version: "" }
}

/**
 * Resolve the platform dimension for a request: an explicit SDK declaration
 * wins, then User-Agent inference, then OTHERS.
 *
 * 版本明细的优先级：单独声明的 `platform_version`（客户端明确要报的）> 从
 * platform 串里切出来的尾巴 > UA 解析出的版本。UA 的版本只在它推断出的平台与
 * 最终平台一致时才采用，否则会出现「声明 android、版本却是 UA 里的 windows 10」。
 */
export function resolvePlatform(
  declared: unknown,
  declaredVersion: unknown,
  userAgent: unknown,
): PlatformInfo {
  const fromUserAgent = parsePlatformFromUserAgent(userAgent)
  const fromDeclared = parseDeclaredPlatform(declared)

  const platform = fromDeclared?.platform ?? fromUserAgent.platform

  const candidates = [
    typeof declaredVersion === "string" ? normalizeVersion(declaredVersion) : "",
    fromDeclared?.version ?? "",
    platform === fromUserAgent.platform ? fromUserAgent.version : "",
    // 声明了一个谁也认不出的平台（"harmonyos 4"），且没有别的线索能覆盖它时，
    // 原串至少还说明了这是什么设备——比一个空的 OTHERS 桶有用。
    platform === Platform.OTHERS && typeof declared === "string" ? normalizeVersion(declared) : "",
  ]

  return { platform, version: candidates.find(Boolean) ?? "" }
}
