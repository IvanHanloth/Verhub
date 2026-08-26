"use client"

import * as React from "react"
import { Undo2, X } from "lucide-react"

import { LabeledField, MONO_FIELD_CLASS } from "@/components/common/settings-fields"

/**
 * 第三方 API Key 输入框。
 *
 * 与 Webhook secret 的区别在于 Key 是加密存的、回读只有指纹：既画不出与真实长度
 * 等宽的掩码，也没有「本地生成」一说，只能显示指纹让人判断换没换过。
 *
 * 三态与 secret 面板一致：不动 / 填新值 / 标记清除，都到保存时才落库，误点可撤销。
 */

export type ApiKeyState = {
  /** 待保存的新 Key；空串表示没改动。 */
  draft: string
  /** 已标记清除已存 Key，保存时生效。 */
  cleared: boolean
}

export const EMPTY_API_KEY_STATE: ApiKeyState = { draft: "", cleared: false }

/** 有改动才需要在保存时发这个字段，避免每次保存都无谓地重写 Key。 */
export function hasApiKeyChange(state: ApiKeyState): boolean {
  return state.cleared || state.draft.trim().length > 0
}

/** 提交值：清除用空串（后端据此清空），没改动则不提交。 */
export function toApiKeyPayload(state: ApiKeyState): string | undefined {
  if (state.cleared) {
    return ""
  }
  return state.draft.trim() || undefined
}

export function ApiKeyField({
  label,
  description,
  fingerprint,
  configured,
  placeholder,
  state,
  onStateChange,
}: {
  label: string
  description?: React.ReactNode
  /** 已存 Key 的 SHA-256 前 16 位。完整 Key 永不回读。 */
  fingerprint: string | null
  configured: boolean
  /** 未配置时的输入提示，一般给一个该协议的 Key 样例。 */
  placeholder?: string
  state: ApiKeyState
  onStateChange: (next: ApiKeyState) => void
}) {
  const inputPlaceholder = state.cleared
    ? "保存后将清除已配置的 Key"
    : configured
      ? "已配置，留空即保持不变"
      : (placeholder ?? "留空表示上游无需鉴权")

  return (
    <LabeledField as="div" label={label} hint={description}>
      <div className="relative">
        <input
          type="password"
          value={state.draft}
          onChange={(event) => onStateChange({ draft: event.target.value, cleared: false })}
          placeholder={inputPlaceholder}
          maxLength={512}
          spellCheck={false}
          autoComplete="off"
          className={`${MONO_FIELD_CLASS} pr-9`}
        />
        {state.cleared ? (
          <IconButton
            label="撤销清除"
            onClick={() => onStateChange(EMPTY_API_KEY_STATE)}
            icon={<Undo2 className="size-3.5" />}
          />
        ) : state.draft || configured ? (
          <IconButton
            label="清除 API Key"
            onClick={() => onStateChange({ draft: "", cleared: configured })}
            icon={<X className="size-3.5" />}
          />
        ) : null}
      </div>

      {configured && fingerprint && !state.cleared && !state.draft ? (
        <p className="text-xs text-slate-500 dark:text-slate-400">
          当前 Key 指纹 <code className="font-mono">{fingerprint}</code>，换 Key 后这里会变。
        </p>
      ) : null}
    </LabeledField>
  )
}

function IconButton({
  label,
  onClick,
  icon,
}: {
  label: string
  onClick: () => void
  icon: React.ReactNode
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-1 text-slate-500 hover:bg-slate-900/8 hover:text-rose-500 dark:text-slate-400 dark:hover:bg-white/10"
    >
      {icon}
    </button>
  )
}
