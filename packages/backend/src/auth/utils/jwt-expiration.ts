export function parseExpiresInToSeconds(value: string | undefined): number {
  if (!value) {
    return 7200
  }

  const raw = value.trim().toLowerCase()
  if (/^\d+$/.test(raw)) {
    return Number(raw)
  }

  const match = raw.match(/^(\d+)(s|m|h|d)$/)
  if (!match) {
    return 7200
  }

  const amount = Number(match[1])
  const unit = match[2] as "s" | "m" | "h" | "d"
  const multiplierMap: Record<"s" | "m" | "h" | "d", number> = {
    s: 1,
    m: 60,
    h: 3600,
    d: 86400,
  }

  return amount * multiplierMap[unit]
}
