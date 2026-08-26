"use client"

import * as React from "react"
import { Copy, RefreshCcw, Undo2, X } from "lucide-react"

import { Button } from "@workspace/ui/components/button"

import { copyToClipboard } from "@/lib/clipboard"
import { LabeledField, MONO_FIELD_CLASS } from "@/components/common/settings-fields"

/**
 * Webhook secret 输入框。项目级 Release Webhook 与实例级 GitHub App 共用一份，
 * 两处的 secret 生命周期完全一样，分成两套写法只会让其中一处慢慢长歪。
 *
 * 三个约定：
 * - 已存 secret 不回读，占位符用星号补到真实长度再接末六位，让人一眼看出配没配、
 *   配的是不是同一个，同时不泄露内容；
 * - 新 secret 在本地随机生成，明文留在输入框里直到保存，方便先复制去填 GitHub；
 * - 输入框里的 × 一次清干净（已存的也算），保存时才真正落库，误点可撤销。
 */

/** 生成的 secret 长度（十六进制字符数）。GitHub 对 secret 无长度上限，取够用即可。 */
const GENERATED_SECRET_BYTES = 24

export type WebhookSecretState = {
  /** 待保存的新 secret；空串表示没改动。 */
  draft: string
  /** 已标记清除已存 secret，保存时生效。 */
  cleared: boolean
}

export const EMPTY_SECRET_STATE: WebhookSecretState = { draft: "", cleared: false }

/** 有改动才需要在保存时发请求，避免每次保存都无谓地重写 secret。 */
export function hasSecretChange(state: WebhookSecretState): boolean {
  return state.cleared || state.draft.trim().length > 0
}

export function WebhookSecretField({
  label,
  description,
  hint,
  length,
  configured,
  state,
  onStateChange,
  prefix = "whsec_",
  minLength = 16,
}: {
  label: string
  description?: React.ReactNode
  /** 已存 secret 的末六位。 */
  hint: string | null
  /** 已存 secret 的字符数，用于把掩码铺到真实长度。 */
  length: number | null
  configured: boolean
  state: WebhookSecretState
  onStateChange: (next: WebhookSecretState) => void
  /** 生成时加在前面的可读前缀，纯粹是为了在 GitHub 的表单里认得出来。 */
  prefix?: string
  minLength?: number
}) {
  const draft = state.draft
  const tooShort = draft.trim().length > 0 && draft.trim().length < minLength

  const placeholder = React.useMemo(() => {
    if (state.cleared) {
      return "保存后将清除已配置的 secret"
    }
    if (!configured || !hint) {
      return `至少 ${minLength} 个字符，或点右侧按钮随机生成`
    }
    const masked = "*".repeat(Math.max((length ?? hint.length) - hint.length, 0))
    return `${masked}${hint}`
  }, [configured, hint, length, minLength, state.cleared])

  function generate() {
    const bytes = new Uint8Array(GENERATED_SECRET_BYTES)
    crypto.getRandomValues(bytes)
    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")
    onStateChange({ draft: `${prefix}${hex}`, cleared: false })
  }

  return (
    <LabeledField as="div" label={label} hint={description}>
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <input
            type="text"
            value={draft}
            onChange={(event) => onStateChange({ draft: event.target.value, cleared: false })}
            placeholder={placeholder}
            maxLength={256}
            spellCheck={false}
            className={`${MONO_FIELD_CLASS} pr-9`}
          />
          {state.cleared ? (
            <IconButton
              label="撤销清除"
              onClick={() => onStateChange(EMPTY_SECRET_STATE)}
              icon={<Undo2 className="size-3.5" />}
            />
          ) : draft || configured ? (
            <IconButton
              label="清除 secret"
              onClick={() => onStateChange({ draft: "", cleared: configured })}
              icon={<X className="size-3.5" />}
            />
          ) : null}
        </div>

        {draft ? (
          <Button
            type="button"
            variant="outline"
            title="复制"
            aria-label="复制 secret"
            size="icon"
            onClick={() => void copyToClipboard(draft, "Secret 已复制。")}
          >
            <Copy className="size-4" />
          </Button>
        ) : null}

        <Button type="button" variant="outline" onClick={generate}>
          <RefreshCcw className="size-4" />
          重新生成
        </Button>
      </div>

      {tooShort ? (
        <p className="text-xs text-rose-500">secret 至少需要 {minLength} 个字符。</p>
      ) : null}

      {draft ? (
        <p className="text-xs text-amber-600 dark:text-amber-300">保存前请先复制并填入 GitHub</p>
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
