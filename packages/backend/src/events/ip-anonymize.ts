/**
 * 事件明细落库前的 IP 处理。
 *
 * 与 Log / Feedback 存完整地址的做法有意不同：事件量比日志大一个数量级，用途是
 * 聚合分析而非逐条排障，留完整地址不成比例。截断后的地址仍能区分不同网段，
 * 定位到城市的能力由归属地解析承担——**解析用的是截断前的完整地址**，在
 * ClientOriginService.describe 里已经完成，所以精度不受影响。
 *
 * 截断位数取业界通行值（IPv4 末 8 位、IPv6 末 80 位），与德国数据保护机关对
 * 同类分析工具的要求一致。
 */

export type EventIpStorage = "full" | "anonymized" | "none"

const DEFAULT_STORAGE: EventIpStorage = "anonymized"

/** 读 `VERHUB_EVENT_IP_STORAGE`，非法值回退到默认的匿名化。 */
export function resolveEventIpStorage(): EventIpStorage {
  const raw = process.env.VERHUB_EVENT_IP_STORAGE?.trim().toLowerCase()
  return raw === "full" || raw === "anonymized" || raw === "none" ? raw : DEFAULT_STORAGE
}

/** 按当前策略处理一个地址；`none` 与无地址都返回 null。 */
export function applyEventIpStorage(ip: string | null, storage: EventIpStorage): string | null {
  if (!ip || storage === "none") {
    return null
  }
  return storage === "full" ? ip : anonymizeIp(ip)
}

/**
 * IPv4 清零末段，IPv6 清零末 80 位（保留前 48 位，即通常的站点前缀）。
 *
 * 认不出格式时返回 null 而不是原样返回：一个解析不了的字符串更可能是代理写坏的
 * 头部，留着既没有分析价值又是个隐私敞口。
 */
export function anonymizeIp(ip: string): string | null {
  const trimmed = ip.trim()
  if (!trimmed) {
    return null
  }

  // ::ffff:203.0.113.7 这类 IPv4-mapped 地址按 IPv4 处理，与 extractClientIp 的归一化一致。
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(trimmed)
  const candidate = mapped?.[1] ?? trimmed

  if (candidate.includes(".")) {
    return anonymizeIpv4(candidate)
  }
  if (candidate.includes(":")) {
    return anonymizeIpv6(candidate)
  }
  return null
}

function anonymizeIpv4(ip: string): string | null {
  const parts = ip.split(".")
  if (parts.length !== 4) {
    return null
  }
  for (const part of parts) {
    const value = Number(part)
    if (!/^\d{1,3}$/.test(part) || !Number.isInteger(value) || value > 255) {
      return null
    }
  }
  return `${parts[0]}.${parts[1]}.${parts[2]}.0`
}

/**
 * 展开 `::` 后取前三组，其余补零。不还原成压缩写法：`2001:db8:1::` 与
 * `2001:db8:1:0:0:0:0:0` 是同一个地址，但固定写法让按 IP 分组时不会分裂成两桶。
 */
function anonymizeIpv6(ip: string): string | null {
  const zoneStripped = ip.split("%")[0] ?? ""
  const doubleColonCount = (zoneStripped.match(/::/g) ?? []).length
  if (doubleColonCount > 1) {
    return null
  }

  let groups: string[]
  if (doubleColonCount === 1) {
    const [head = "", tail = ""] = zoneStripped.split("::")
    const headGroups = head ? head.split(":") : []
    const tailGroups = tail ? tail.split(":") : []
    const missing = 8 - headGroups.length - tailGroups.length
    if (missing < 0) {
      return null
    }
    groups = [...headGroups, ...Array<string>(missing).fill("0"), ...tailGroups]
  } else {
    groups = zoneStripped.split(":")
  }

  if (groups.length !== 8 || groups.some((group) => !/^[0-9a-f]{1,4}$/i.test(group))) {
    return null
  }

  const kept = groups.slice(0, 3).map((group) => group.toLowerCase().replace(/^0+(?=.)/, ""))
  return [...kept, "0", "0", "0", "0", "0"].join(":")
}
