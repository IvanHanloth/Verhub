"use client"

import * as React from "react"
import { AlertTriangle, ExternalLink, FileText, Loader2, RotateCcw, Save } from "lucide-react"
import Link from "next/link"
import { toast } from "sonner"

import { Button } from "@workspace/ui/components/button"

import { isAuthError } from "@/lib/api-client"
import { formatTimestamp } from "@/lib/format"
import { getErrorMessage } from "@/lib/error-utils"
import { getSessionToken } from "@/lib/auth-session"
import { useConfirm } from "@/components/common/confirm-dialog"
import { AdminCard } from "@/components/admin/admin-card"
import { AdminPageHeader } from "@/components/admin/admin-page-header"
import { LoadingLine } from "@/components/common/skeleton"
import { MarkdownContent } from "@/components/markdown/markdown-content"
import { MarkdownEditor } from "@/components/markdown/markdown-editor"
import { TermsPlaceholderForm } from "@/components/terms/terms-placeholder-form"
import {
  applyPlaceholders,
  hasUnfilledPlaceholder,
  listUnfilledPlaceholders,
} from "@/lib/terms-placeholders"
import {
  listTermsDocumentConfigs,
  resetTermsDocument,
  updateTermsDocument,
  type TermsDocumentConfigView,
  type TermsDocumentSlug,
} from "@/lib/terms-api"

const EDITOR_CLASS =
  "w-full rounded-xl border border-slate-900/20 bg-white/80 px-3 py-2 font-mono text-xs leading-6 dark:border-white/20 dark:bg-white/10"

/** 每份文档一份编辑态：切换选项卡不该丢掉另一份没保存的改动。 */
type DraftState = Record<string, { custom: boolean; content: string }>

/** 每份文档一份填空值。只在本次编辑期间有效，不入库 —— 库里存的是替换后的成品。 */
type FillState = Record<string, Record<string, string>>

/**
 * 条款设置。
 *
 * 与反馈 Issue 模板同一套取舍：内置正文随时可用，打开开关才让自定义正文生效，
 * 草稿始终留在库里 —— 改坏了关掉开关即可回到内置正文，不必逐字删回原文。
 */
export default function TermsSettingsPage() {
  const confirm = useConfirm()
  const [token, setToken] = React.useState(() => getSessionToken().trim())
  const [documents, setDocuments] = React.useState<TermsDocumentConfigView[]>([])
  const [drafts, setDrafts] = React.useState<DraftState>({})
  const [fills, setFills] = React.useState<FillState>({})
  const [activeSlug, setActiveSlug] = React.useState<TermsDocumentSlug | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const applyDocument = React.useCallback((view: TermsDocumentConfigView) => {
    setDocuments((prev) => prev.map((item) => (item.slug === view.slug ? view : item)))
    setDrafts((prev) => ({
      ...prev,
      // 没有草稿时用内置原文起草，省得对着空白框从零写一份条款。
      [view.slug]: { custom: view.custom, content: view.custom_content ?? view.builtin_content },
    }))
  }, [])

  React.useEffect(() => {
    if (!token) {
      setLoading(false)
      setError("请先登录后再配置。")
      return
    }

    const controller = new AbortController()
    listTermsDocumentConfigs(token, controller.signal)
      .then((views) => {
        setDocuments(views)
        setActiveSlug(views[0]?.slug ?? null)
        setDrafts(
          Object.fromEntries(
            views.map((view) => [
              view.slug,
              { custom: view.custom, content: view.custom_content ?? view.builtin_content },
            ]),
          ),
        )
      })
      .catch((loadError: unknown) => {
        if (controller.signal.aborted) {
          return
        }
        if (isAuthError(loadError)) {
          setToken("")
        }
        setError(getErrorMessage(loadError))
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false)
        }
      })

    return () => {
      controller.abort()
    }
  }, [token])

  const active = documents.find((item) => item.slug === activeSlug) ?? null
  const draft = active ? drafts[active.slug] : undefined

  function updateDraft(slug: string, patch: Partial<{ custom: boolean; content: string }>) {
    setDrafts((prev) => {
      const current = prev[slug]
      if (!current) {
        return prev
      }
      return { ...prev, [slug]: { ...current, ...patch } }
    })
  }

  function updateFill(slug: string, key: string, value: string) {
    setFills((prev) => ({ ...prev, [slug]: { ...prev[slug], [key]: value } }))
  }

  /** 从内置模板重新生成：已有正文会被整体覆盖，所以改过就先问一句。 */
  async function handleApplyPlaceholders() {
    if (!active) {
      return
    }

    const current = drafts[active.slug]
    if (current && current.content.trim() && current.content !== active.builtin_content) {
      const confirmed = await confirm({
        title: "用模板重新生成正文",
        description: "当前编辑器里的内容将被替换为填空后的内置模板。确认继续？",
        confirmLabel: "生成",
        destructive: true,
      })
      if (!confirmed) {
        return
      }
    }

    updateDraft(active.slug, {
      custom: true,
      content: applyPlaceholders(active.builtin_content, fills[active.slug] ?? {}),
    })
    toast.success("已生成正文，请复核后保存。")
  }

  async function handleSave() {
    if (!token || !active || !draft) {
      toast.error("请先登录后再操作。")
      return
    }

    if (draft.custom && hasUnfilledPlaceholder(draft.content)) {
      const unfilled = listUnfilledPlaceholders(draft.content)
      const confirmed = await confirm({
        title: "正文仍有未填写的占位符",
        description: `${unfilled.join("、")} 尚未替换，前台会原样显示。确认仍要保存？`,
        confirmLabel: "仍然保存",
        destructive: true,
      })
      if (!confirmed) {
        return
      }
    }

    setBusy(true)
    try {
      applyDocument(
        await updateTermsDocument(token, active.slug, {
          custom: draft.custom,
          content: draft.content,
        }),
      )
      toast.success(`${active.title}已保存。`)
    } catch (saveError) {
      toast.error(getErrorMessage(saveError))
    } finally {
      setBusy(false)
    }
  }

  async function handleReset() {
    if (!token || !active) {
      return
    }
    const confirmed = await confirm({
      title: `恢复内置${active.title}`,
      description: "将关闭自定义并删除已保存的自定义正文，前台立即回到内置正文。确认继续？",
      confirmLabel: "恢复内置",
      destructive: true,
    })
    if (!confirmed) {
      return
    }

    setBusy(true)
    try {
      applyDocument(await resetTermsDocument(token, active.slug))
      toast.success("已恢复内置正文。")
    } catch (resetError) {
      toast.error(getErrorMessage(resetError))
    } finally {
      setBusy(false)
    }
  }

  const usingCustom = Boolean(active?.custom && active.custom_content)
  // 前台此刻生效的正文里还有 {{}}，说明模板没填完就对外了。
  const publishedUnfilled = active ? hasUnfilledPlaceholder(active.content) : false
  const effectiveUpdatedAt = active
    ? usingCustom
      ? (active.custom_updated_at ?? active.updated_at)
      : active.builtin_updated_at
    : null

  return (
    <section className="space-y-5">
      <AdminPageHeader
        title="条款设置"
        description="维护面向被采集者公示的条款文档：隐私政策与 SDK 合规性文档。前台展示页按 Markdown 渲染。"
        badge="Verhub Settings"
        icon={FileText}
      />

      {error ? (
        <AdminCard className="flex items-center gap-2 text-sm text-rose-500 dark:text-rose-300">
          <AlertTriangle className="size-4" />
          {error}
        </AdminCard>
      ) : null}

      {loading ? (
        <AdminCard>
          <LoadingLine>正在读取条款设置...</LoadingLine>
        </AdminCard>
      ) : null}

      {!loading && active && draft ? (
        <AdminCard as="section" className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {documents.map((item) => (
              <button
                key={item.slug}
                type="button"
                role="tab"
                aria-selected={item.slug === active.slug}
                onClick={() => setActiveSlug(item.slug)}
                className={`rounded-xl border px-3 py-1.5 text-sm transition ${
                  item.slug === active.slug
                    ? "border-sky-500/40 bg-sky-500/15 text-sky-800 dark:text-sky-200"
                    : "border-slate-900/15 text-slate-700 hover:bg-slate-900/5 dark:border-white/15 dark:text-slate-300 dark:hover:bg-white/10"
                }`}
              >
                {item.title}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 space-y-1">
              <h2 className="flex items-center gap-2 text-base font-semibold">
                <FileText className="size-4" />
                {active.title}
              </h2>
              <p className="max-w-3xl text-xs text-slate-600 dark:text-slate-400">
                {active.summary}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`rounded-md border px-2 py-0.5 text-xs font-medium ${
                  usingCustom
                    ? "border-sky-500/40 bg-sky-500/10 text-sky-600 dark:text-sky-300"
                    : "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300"
                }`}
              >
                {usingCustom ? "使用自定义正文" : "使用内置正文"}
              </span>
              <Button asChild variant="outline" size="sm">
                <Link href={`/terms/${active.slug}`} target="_blank" rel="noreferrer">
                  <ExternalLink className="size-4" />
                  查看前台页面
                </Link>
              </Button>
            </div>
          </div>

          <p className="text-xs text-slate-600 dark:text-slate-400">
            前台生效版本的最后更新时间：
            {effectiveUpdatedAt ? formatTimestamp(effectiveUpdatedAt) : "未知"}
          </p>

          {publishedUnfilled ? (
            <div className="flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-200">
              <AlertTriangle className="size-4 shrink-0" />
              <span>
                前台当前生效的正文里还有未填写的占位符。内置正文只是模板，请在下方填空、生成并保存自定义正文后再对外公示。
              </span>
            </div>
          ) : null}

          {active.placeholders.length > 0 ? (
            <TermsPlaceholderForm
              placeholders={active.placeholders}
              values={fills[active.slug] ?? {}}
              onChange={(key, value) => updateFill(active.slug, key, value)}
              onApply={() => void handleApplyPlaceholders()}
              disabled={busy}
            />
          ) : null}

          <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-slate-900/15 bg-slate-50/60 p-4 dark:border-white/15 dark:bg-white/5">
            <input
              type="checkbox"
              checked={draft.custom}
              onChange={(event) => updateDraft(active.slug, { custom: event.target.checked })}
              className="mt-0.5 size-4 shrink-0"
            />
            <span className="min-w-0 flex-1">
              <span className="text-sm font-semibold">使用自定义正文</span>
              <span className="mt-1 block text-xs text-slate-600 dark:text-slate-400">
                关闭时前台展示内置正文，下方正文仍会作为草稿保存，重新打开即可继续编辑。
              </span>
            </span>
          </label>

          {draft.custom ? (
            <div className="space-y-2">
              <MarkdownEditor
                label="文档正文"
                value={draft.content}
                onChange={(value) => updateDraft(active.slug, { content: value })}
                rows={24}
                maxLength={65536}
                className={EDITOR_CLASS}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => updateDraft(active.slug, { content: active.builtin_content })}
              >
                <RotateCcw className="size-4" />
                恢复内置正文内容
              </Button>
            </div>
          ) : (
            <div className="space-y-1 text-sm">
              <span className="text-slate-700 dark:text-slate-300">内置正文预览</span>
              <div className="max-h-120 overflow-y-auto rounded-xl border border-slate-900/20 bg-white/80 px-3 py-2 text-sm dark:border-white/20 dark:bg-white/10">
                <MarkdownContent>{active.builtin_content}</MarkdownContent>
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Button type="button" disabled={busy || !token} onClick={() => void handleSave()}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
              保存设置
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={busy || !token || !active.custom_content}
              onClick={() => void handleReset()}
            >
              <RotateCcw className="size-4" />
              恢复内置正文
            </Button>
          </div>
        </AdminCard>
      ) : null}
    </section>
  )
}
