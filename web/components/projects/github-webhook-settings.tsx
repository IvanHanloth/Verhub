"use client"

import * as React from "react"
import { KeyRound } from "lucide-react"

import { resolveApiUrl } from "@/lib/api-client"
import { LoadingLine } from "@/components/common/skeleton"
import { formatTimestamp } from "@/lib/format"
import { CopyableUrl } from "@/components/common/settings-fields"
import {
  WebhookSecretField,
  type WebhookSecretState,
} from "@/components/github/webhook-secret-field"
import type { GithubWebhookSettings as WebhookSettings } from "@/lib/projects-api"

export const MIN_SECRET_LENGTH = 16

/**
 * Release Webhook 面板。
 *
 * 纯展示 + 受控：加载与保存都交给外层弹窗，好让「保存集成配置」一个按钮同时落
 * GitHub App 配置和这里的 secret —— 两块配置常常要一起改，分两个按钮保存过一次
 * 忘一次。
 */
export function GithubWebhookSettings({
  settings,
  loading = false,
  error = null,
  secret,
  onSecretChange,
  embedded = false,
}: {
  settings: WebhookSettings | null
  loading?: boolean
  error?: string | null
  secret: WebhookSecretState
  onSecretChange: (next: WebhookSecretState) => void
  /** 已经独占一块区域（如自己的选项卡）时去掉外层卡片，避免卡中套卡。 */
  embedded?: boolean
}) {
  const webhookUrl = settings ? resolveApiUrl(settings.payload_path) : ""

  return (
    <section
      className={
        embedded
          ? "space-y-3"
          : "space-y-3 rounded-xl border border-slate-900/15 bg-slate-50/60 p-4 dark:border-white/15 dark:bg-white/5"
      }
    >
      {/* 用 div 而不是 header：admin 主题会把 header 一律画成一张圆角卡片。 */}
      <div className="space-y-1">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <KeyRound className="size-4" />
          GitHub Release Webhook
        </h3>
        <p className="text-xs text-slate-600 dark:text-slate-400">
          在 GitHub 仓库的 Settings → Webhooks 里添加下面的地址，Content type 选
          <code className="mx-1">application/json</code>，事件勾选 Releases。 发布或编辑 Release
          后版本信息会自动同步，版本号已存在时按 GitHub 内容覆盖。
        </p>
      </div>

      {loading ? <LoadingLine size="sm">正在读取 Webhook 配置...</LoadingLine> : null}

      {error ? <p className="text-xs text-rose-500">{error}</p> : null}

      {settings ? (
        <div className="space-y-3">
          <CopyableUrl label="Payload URL" url={webhookUrl} copiedMessage="Payload URL 已复制。" />

          <p className="text-xs text-slate-600 dark:text-slate-400">
            状态：
            {settings.enabled ? (
              <span className="text-emerald-600 dark:text-emerald-300">
                已启用（更新于 {formatTimestamp(settings.secret_updated_at)}）
              </span>
            ) : (
              <span className="text-amber-600 dark:text-amber-300">
                未配置 secret，所有推送都会被拒绝
              </span>
            )}
          </p>

          <WebhookSecretField
            label="Webhook secret"
            description="与 GitHub 仓库 Webhook 设置里的 Secret 保持一致。"
            hint={settings.secret_hint}
            length={settings.secret_length}
            configured={settings.enabled}
            state={secret}
            onStateChange={onSecretChange}
            minLength={MIN_SECRET_LENGTH}
          />
        </div>
      ) : null}
    </section>
  )
}
