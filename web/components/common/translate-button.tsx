"use client"

import * as React from "react"
import { Languages, Loader2 } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@workspace/ui/components/button"

import { getErrorMessage } from "@/lib/error-utils"
import { useConfirm } from "@/components/common/confirm-dialog"
import { getSessionToken } from "@/lib/auth-session"
import { getTranslationConfig, translateContent, type TranslationKind } from "@/lib/translation-api"

/**
 * 「AI 翻译」按钮。把默认内容整条译进当前语言页签的**草稿**，不落库 ——
 * 机器译文要由人过一眼，保存仍走各自表单原有的提交路径。
 *
 * 未配置或未启用时按钮不渲染：点了才被告知没配是最烦人的一种反馈。
 */

/**
 * 实例是否开着 AI 翻译。挂了翻译按钮的页面拉一次，下发给各个按钮 ——
 * 每个按钮各拉一遍会在打开弹窗时打出一串重复请求。
 */
export function useTranslationEnabled(token: string): boolean {
  const [enabled, setEnabled] = React.useState(false)

  React.useEffect(() => {
    if (!token) {
      setEnabled(false)
      return
    }

    const controller = new AbortController()
    getTranslationConfig(token, controller.signal)
      .then((view) => setEnabled(view.enabled && view.configured))
      // 拉不到只是不显示翻译按钮，不该打扰正在编辑内容的人——静默退化。
      .catch(() => {
        if (!controller.signal.aborted) {
          setEnabled(false)
        }
      })

    return () => {
      controller.abort()
    }
  }, [token])

  return enabled
}

export function TranslateButton({
  enabled,
  projectKey,
  kind,
  targetLocale,
  source,
  onTranslated,
  hasDraft,
}: {
  /** 来自 useTranslationEnabled；false 时不渲染。 */
  enabled: boolean
  projectKey: string | null
  kind: TranslationKind
  /** 目标语言，必须是项目已注册的。 */
  targetLocale: string
  /** 待译的默认内容，值为空的字段会被后端丢弃。 */
  source: Record<string, string>
  /** 译文回填。只有模型真的给出的字段会出现在参数里。 */
  onTranslated: (fields: Record<string, string>) => void
  /** 当前语言下已有草稿，覆盖前先确认。 */
  hasDraft: boolean
}) {
  const confirm = useConfirm()
  const [busy, setBusy] = React.useState(false)

  if (!enabled || !projectKey || !targetLocale) {
    return null
  }

  const hasSource = Object.values(source).some((value) => value.trim())

  async function handleClick() {
    if (!hasSource) {
      toast.error("默认内容是空的，没有可翻译的文字。")
      return
    }

    if (hasDraft) {
      const confirmed = await confirm({
        title: "覆盖当前译文",
        description: `${targetLocale} 下已经填了内容，AI 翻译会覆盖掉。确认继续？`,
        confirmLabel: "翻译并覆盖",
      })
      if (!confirmed) {
        return
      }
    }

    const token = getSessionToken().trim()
    if (!token) {
      toast.error("请先登录后再操作。")
      return
    }

    setBusy(true)
    try {
      const result = await translateContent(token, projectKey!, {
        kind,
        target_locale: targetLocale,
        fields: source,
      })
      onTranslated(result.fields)
      toast.success(`已用 ${result.model} 译成 ${result.locale}，请检查后再保存。`)
    } catch (error) {
      toast.error(getErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={busy}
      onClick={() => void handleClick()}
      title="用 AI 把默认内容译成当前语言，填进下面的输入框"
    >
      {busy ? <Loader2 className="size-4 animate-spin" /> : <Languages className="size-4" />}
      {busy ? "翻译中..." : "AI 翻译"}
    </Button>
  )
}
