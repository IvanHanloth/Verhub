"use client"

import * as React from "react"
import { Languages, Loader2, Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@workspace/ui/components/button"

import { getErrorMessage } from "@/lib/error-utils"
import { useConfirm } from "@/components/common/confirm-dialog"
import { LoadingLine } from "@/components/common/skeleton"
import {
  createProjectLocale,
  deleteProjectLocale,
  listProjectLocales,
  type ProjectLocaleItem,
} from "@/lib/projects-api"

const FIELD_CLASS =
  "w-full rounded-lg border border-slate-900/20 bg-white/80 px-2.5 py-1.5 text-xs dark:border-white/20 dark:bg-white/10"

/** 逗号或空格分隔的同义标签串 → 数组。 */
function parseAliases(raw: string): string[] {
  return raw
    .split(/[,，\s]+/)
    .map((item) => item.trim())
    .filter(Boolean)
}

/**
 * 项目支持的语言。公告译文只能存在这里注册过的语言下，客户端提交的语言偏好也只有
 * 命中这张表才算数——否则一律回落公告的默认内容。
 *
 * keyed on projectKey（父级已做）以在切换项目时重新拉取。
 */
export function ProjectLocalesSettings({
  token,
  projectKey,
  onLocalesChange,
}: {
  token: string
  projectKey: string | null
  /** 注册表变动时回传最新列表，让外层的语言页签立刻跟上。 */
  onLocalesChange?: (locales: ProjectLocaleItem[]) => void
}) {
  const confirm = useConfirm()
  const [locales, setLocales] = React.useState<ProjectLocaleItem[]>([])
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [busyLocale, setBusyLocale] = React.useState<string | null>(null)
  const [draftLocale, setDraftLocale] = React.useState("")
  const [draftAliases, setDraftAliases] = React.useState("")
  const [draftLabel, setDraftLabel] = React.useState("")
  const [adding, setAdding] = React.useState(false)

  // 列表每次变动都同步给外层，省得两边各存一份还要担心不同步。
  const applyLocales = React.useCallback(
    (next: ProjectLocaleItem[]) => {
      setLocales(next)
      onLocalesChange?.(next)
    },
    [onLocalesChange],
  )

  React.useEffect(() => {
    if (!token || !projectKey) {
      applyLocales([])
      return
    }

    const controller = new AbortController()
    setLoading(true)
    setError(null)

    listProjectLocales(token, projectKey, controller.signal)
      .then((result) => applyLocales(result.data))
      .catch((loadError: unknown) => {
        if (controller.signal.aborted) {
          return
        }
        applyLocales([])
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
  }, [token, projectKey, applyLocales])

  if (!projectKey) {
    return null
  }

  async function handleAdd() {
    const locale = draftLocale.trim()
    if (!token || !projectKey || !locale) {
      return
    }

    setAdding(true)
    try {
      const saved = await createProjectLocale(token, projectKey, {
        locale,
        aliases: parseAliases(draftAliases),
        label: draftLabel.trim() || undefined,
      })
      // 重复注册走的是更新，所以按 locale 去重后再插入，避免列表里出现两行。
      applyLocales([...locales.filter((item) => item.locale !== saved.locale), saved])
      setDraftLocale("")
      setDraftAliases("")
      setDraftLabel("")
      toast.success(`已注册语言 ${saved.locale}。`)
    } catch (addError) {
      toast.error(getErrorMessage(addError))
    } finally {
      setAdding(false)
    }
  }

  async function handleDelete(locale: string) {
    if (!token || !projectKey) {
      return
    }
    const confirmed = await confirm({
      title: "注销语言",
      description: `注销后客户端提交「${locale}」将回落到公告的默认内容。已录入的译文不会被删除，重新注册该语言即可恢复。`,
      confirmLabel: "注销",
      destructive: true,
    })
    if (!confirmed) {
      return
    }

    setBusyLocale(locale)
    try {
      await deleteProjectLocale(token, projectKey, locale)
      applyLocales(locales.filter((item) => item.locale !== locale))
      toast.success("语言已注销。")
    } catch (deleteError) {
      toast.error(getErrorMessage(deleteError))
    } finally {
      setBusyLocale(null)
    }
  }

  return (
    <section className="space-y-3 rounded-xl border border-slate-900/15 bg-slate-50/60 p-4 dark:border-white/15 dark:bg-white/5">
      <div className="space-y-1">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Languages className="size-4" />
          公告语言
        </h3>
        <p className="text-xs text-slate-600 dark:text-slate-400">
          注册后即可按语言录入公告与项目译文；客户端提交未注册的语言偏好会回落到默认内容。
        </p>
      </div>

      {loading ? <LoadingLine size="sm">正在读取语言...</LoadingLine> : null}

      {error ? <p className="text-xs text-rose-500">{error}</p> : null}

      {!loading && !error && locales.length === 0 ? (
        <p className="text-xs text-slate-500 dark:text-slate-400">
          尚未注册语言，公告只有一份默认内容。
        </p>
      ) : null}

      {locales.length > 0 ? (
        <ul className="space-y-2">
          {locales.map((item) => (
            <li
              key={item.locale}
              className="flex items-center justify-between gap-2 rounded-lg border border-slate-900/15 bg-white/70 px-3 py-2 dark:border-white/15 dark:bg-white/10"
            >
              <div className="min-w-0">
                <code className="block truncate text-xs">{item.locale}</code>
                {item.label ? (
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">
                    {item.label}
                  </span>
                ) : null}
                {item.aliases.length > 0 ? (
                  <span className="block truncate text-[11px] text-slate-500 dark:text-slate-400">
                    同义：{item.aliases.join("、")}
                  </span>
                ) : null}
              </div>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                disabled={busyLocale === item.locale}
                onClick={() => void handleDelete(item.locale)}
              >
                {busyLocale === item.locale ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Trash2 className="size-4" />
                )}
                注销
              </Button>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="flex flex-wrap items-end gap-2">
        <label className="min-w-[8rem] flex-1 space-y-1">
          <span className="text-[11px] text-slate-600 dark:text-slate-400">语言标签</span>
          <input
            value={draftLocale}
            onChange={(event) => setDraftLocale(event.target.value)}
            className={FIELD_CLASS}
            placeholder="例如：en-US"
            maxLength={35}
            aria-label="语言标签"
          />
        </label>
        <label className="min-w-[8rem] flex-1 space-y-1">
          <span className="text-[11px] text-slate-600 dark:text-slate-400">同义标签（可选）</span>
          <input
            value={draftAliases}
            onChange={(event) => setDraftAliases(event.target.value)}
            className={FIELD_CLASS}
            placeholder="例如：en-US, en-GB"
            aria-label="同义标签"
          />
        </label>
        <label className="min-w-[8rem] flex-1 space-y-1">
          <span className="text-[11px] text-slate-600 dark:text-slate-400">展示名（可选）</span>
          <input
            value={draftLabel}
            onChange={(event) => setDraftLabel(event.target.value)}
            className={FIELD_CLASS}
            placeholder="例如：English"
            maxLength={64}
            aria-label="语言展示名"
          />
        </label>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={adding || !draftLocale.trim()}
          onClick={() => void handleAdd()}
        >
          {adding ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
          注册
        </Button>
      </div>
    </section>
  )
}
