/**
 * 反馈转发 Issue 的单 IP 限流。
 *
 * 转发是「匿名请求 → 在别人仓库里建 Issue」，比其余公开写接口危险得多：刷进去的
 * 内容需要维护者手工清理，还会打爆通知。所以这里的额度远比全局 300/分钟的公开
 * 限流严格，且独立计数 —— 达到额度只挡转发这条路，普通反馈照收。
 *
 * 计数在进程内存里（与 ThrottlerModule 同构）。多副本部署时各副本各算一份，
 * 实际额度会放大到副本数倍；这对「拦住脚本刷 Issue」的目标仍然够用。
 */

import { Injectable } from "@nestjs/common"

import { nowSeconds } from "../common/utils"

const DEFAULT_LIMIT = 3
const DEFAULT_WINDOW_SECONDS = 3600
/** 超过这个规模就顺带清一次过期桶，避免长期运行的实例无上限地攒 key。 */
const SWEEP_THRESHOLD = 1024

export type ForwardQuota = { allowed: boolean; limit: number; windowSeconds: number }

@Injectable()
export class FeedbackForwardThrottler {
  private readonly hits = new Map<string, number[]>()

  /** 记一次转发意图并返回是否放行。不放行时不计数，避免被拒的请求延长封锁。 */
  consume(ip: string | null | undefined): ForwardQuota {
    const limit = resolveLimit()
    const windowSeconds = resolveWindowSeconds()
    // 取不到 IP 时统一归到一个桶：宁可让这类请求互相挤额度，也不放行到无限。
    const key = ip?.trim() || "unknown"
    const cutoff = nowSeconds() - windowSeconds

    const recent = (this.hits.get(key) ?? []).filter((at) => at > cutoff)
    if (recent.length >= limit) {
      this.hits.set(key, recent)
      return { allowed: false, limit, windowSeconds }
    }

    recent.push(nowSeconds())
    this.hits.set(key, recent)
    if (this.hits.size > SWEEP_THRESHOLD) {
      this.sweep(cutoff)
    }
    return { allowed: true, limit, windowSeconds }
  }

  private sweep(cutoff: number): void {
    for (const [key, timestamps] of this.hits) {
      const kept = timestamps.filter((at) => at > cutoff)
      if (kept.length === 0) {
        this.hits.delete(key)
      } else {
        this.hits.set(key, kept)
      }
    }
  }
}

function resolveLimit(): number {
  return positiveInt(process.env.VERHUB_GITHUB_FORWARD_RATE_LIMIT, DEFAULT_LIMIT)
}

function resolveWindowSeconds(): number {
  return positiveInt(process.env.VERHUB_GITHUB_FORWARD_RATE_TTL, DEFAULT_WINDOW_SECONDS)
}

function positiveInt(raw: string | undefined, fallback: number): number {
  const parsed = Number(raw)
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : fallback
}
