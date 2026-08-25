/**
 * 事件名归一化。
 *
 * 事件名由客户端自由定义、服务端第一次见到就登记，所以归一化是唯一的防线：
 * 不做的话 "Checkout_Clicked"、"checkout_clicked "、"checkout_clicked" 会变成
 * 三个事件，图表上分裂成三条线，而接入方以为自己只埋了一个点。
 */

/** 与 SDK 侧的校验保持一致；超长的名字是拼错或者拿描述文本当了事件名。 */
export const MAX_EVENT_NAME_LENGTH = 64

/**
 * 允许的字符：字母、数字、下划线、点、连字符、冒号。
 *
 * 收得比较紧是有意的——事件名会进图例、进 CSV、进 DSL 的别名位置，
 * 放开空格与引号只会在下游每一处都要转义一次。
 */
const EVENT_NAME_PATTERN = /^[a-z0-9_.:-]+$/

/**
 * 归一化并校验，非法时返回 null 由调用方决定拒绝还是跳过。
 *
 * 小写化是为了让大小写不同的同名事件归并到一起。批量上报里混进一条非法名字时
 * 不应该让整批失败，所以这里不抛异常。
 */
export function normalizeEventName(raw: unknown): string | null {
  if (typeof raw !== "string") {
    return null
  }

  const normalized = raw.trim().toLowerCase()
  if (!normalized || normalized.length > MAX_EVENT_NAME_LENGTH) {
    return null
  }

  return EVENT_NAME_PATTERN.test(normalized) ? normalized : null
}
