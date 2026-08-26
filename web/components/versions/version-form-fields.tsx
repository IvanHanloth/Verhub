"use client"

import * as React from "react"

import { MarkdownEditor } from "@/components/markdown/markdown-editor"
import { SegmentedButton, SegmentedGroup } from "@/components/common/settings-fields"
import { TranslateButton } from "@/components/common/translate-button"
import type { ProjectLocaleItem } from "@/lib/projects-api"

import { platformOptions, type VersionFormState } from "./version-form-utils"

const FIELD_CLASS =
  "w-full rounded-xl border border-slate-900/20 bg-white/80 px-3 py-2 text-sm ring-cyan-300 transition outline-none focus:ring-2 dark:border-white/20 dark:bg-white/10"

const MONO_FIELD_CLASS =
  "w-full rounded-xl border border-slate-900/20 bg-white/80 px-3 py-2 font-mono text-xs ring-cyan-300 transition outline-none focus:ring-2 dark:border-white/20 dark:bg-white/10"

type VersionFormFieldsProps = {
  form: VersionFormState
  setForm: React.Dispatch<React.SetStateAction<VersionFormState>>
  /** 可比较版本号的格式校验结果，null 表示通过。 */
  comparableVersionError?: string | null
  /** 从版本号提取可比较版本号；不传则不显示"提取"按钮。 */
  onExtractComparableVersion?: () => void
  /** 版本号输入框下方的补充操作，如从 GitHub Release 拉取。 */
  versionFieldAction?: React.ReactNode
  /** 项目注册的语言。为空时不显示语言页签，表单退化成单一默认内容。 */
  locales?: ProjectLocaleItem[]
  /** AI 翻译按钮要按项目校验目标语言，没有项目就不显示按钮。 */
  projectKey?: string | null
  translationEnabled?: boolean
}

/**
 * 版本表单字段。新建与编辑共用同一套字段，避免两处漂移出不同的可填范围。
 */
export function VersionFormFields({
  form,
  setForm,
  comparableVersionError,
  onExtractComparableVersion,
  versionFieldAction,
  locales = [],
  projectKey = null,
  translationEnabled = false,
}: VersionFormFieldsProps) {
  // 默认内容页用空串标识，与任何真实 locale 都不会撞。
  const [activeLocale, setActiveLocale] = React.useState("")

  // 注销语言后表单里可能还停在那一页，回落到默认内容页而不是渲染一个空壳。
  const currentLocale = locales.some((item) => item.locale === activeLocale) ? activeLocale : ""
  const draft = form.translations[currentLocale] ?? { title: "", content: "" }

  function updateTranslation(patch: { title?: string; content?: string }) {
    setForm((prev) => {
      const previous = prev.translations[currentLocale] ?? { title: "", content: "" }
      return {
        ...prev,
        translations: { ...prev.translations, [currentLocale]: { ...previous, ...patch } },
      }
    })
  }

  const localeTabs =
    locales.length > 0 ? (
      <SegmentedGroup role="tablist" className="flex w-full flex-wrap text-sm">
        <SegmentedButton
          role="tab"
          grow
          active={currentLocale === ""}
          onClick={() => setActiveLocale("")}
          label="默认内容"
        />
        {locales.map((item) => (
          <SegmentedButton
            key={item.locale}
            role="tab"
            grow
            active={currentLocale === item.locale}
            onClick={() => setActiveLocale(item.locale)}
            label={item.label ? `${item.label}（${item.locale}）` : item.locale}
          />
        ))}
      </SegmentedGroup>
    ) : null

  if (currentLocale) {
    return (
      <>
        {localeTabs}

        <div className="flex flex-wrap items-start justify-between gap-2">
          <p className="flex-1 text-xs text-slate-500 dark:text-slate-400">
            标题与更新内容各自留空即沿用默认内容。其余字段（版本号、下载地址、平台、开关等）
            只在默认内容页设置，对所有语言生效。
          </p>
          <TranslateButton
            enabled={translationEnabled}
            projectKey={projectKey}
            kind="version"
            targetLocale={currentLocale}
            source={{ title: form.title, content: form.content }}
            hasDraft={Boolean(draft.title.trim() || draft.content.trim())}
            onTranslated={(fields) => updateTranslation(fields)}
          />
        </div>

        <label className="space-y-1 text-sm">
          <span className="text-slate-700 dark:text-slate-300">译文标题</span>
          <input
            type="text"
            value={draft.title}
            onChange={(event) => updateTranslation({ title: event.target.value })}
            className={FIELD_CLASS}
            maxLength={128}
          />
        </label>

        <MarkdownEditor
          key={`content-${currentLocale}`}
          label="译文更新内容"
          value={draft.content}
          onChange={(value) => updateTranslation({ content: value })}
          rows={4}
          className={FIELD_CLASS}
        />
      </>
    )
  }

  return (
    <>
      {localeTabs}

      <label className="space-y-1 text-sm">
        <span className="text-slate-700 dark:text-slate-300">版本号</span>
        <input
          type="text"
          placeholder="例如：2.3.0"
          value={form.version}
          onChange={(event) => setForm((prev) => ({ ...prev, version: event.target.value }))}
          className={FIELD_CLASS}
          required
          maxLength={64}
        />
      </label>

      {versionFieldAction ? <div className="flex flex-wrap gap-2">{versionFieldAction}</div> : null}

      <label className="space-y-1 text-sm">
        <span className="text-slate-700 dark:text-slate-300">可比较版本号</span>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="例如：2.3.0-rc.1"
            value={form.comparable_version}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, comparable_version: event.target.value }))
            }
            className={FIELD_CLASS}
            required
            maxLength={64}
          />
          {onExtractComparableVersion ? (
            <button
              type="button"
              onClick={onExtractComparableVersion}
              className="shrink-0 rounded-xl border border-slate-900/20 px-3 py-2 text-sm transition hover:bg-slate-900/5 dark:border-white/20 dark:hover:bg-white/10"
            >
              提取
            </button>
          ) : null}
        </div>
        {comparableVersionError ? (
          <p className="text-xs text-rose-500">{comparableVersionError}</p>
        ) : (
          <p className="text-xs text-emerald-600 dark:text-emerald-300">格式校验通过</p>
        )}
      </label>

      <label className="space-y-1 text-sm">
        <span className="text-slate-700 dark:text-slate-300">版本标题</span>
        <input
          type="text"
          placeholder="例如：稳定版更新"
          value={form.title}
          onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
          className={FIELD_CLASS}
          maxLength={128}
        />
      </label>

      <label className="space-y-1 text-sm">
        <span className="text-slate-700 dark:text-slate-300">下载地址</span>
        <input
          type="url"
          placeholder="https://example.com/download"
          value={form.download_url}
          onChange={(event) => setForm((prev) => ({ ...prev, download_url: event.target.value }))}
          className={FIELD_CLASS}
          maxLength={2048}
        />
      </label>

      <label className="space-y-1 text-sm">
        <span className="text-slate-700 dark:text-slate-300">下载链接列表 JSON</span>
        <textarea
          placeholder='例如：[{"url":"https://example.com/app.zip","name":"Windows 包","platform":"windows"}]'
          value={form.download_links_json}
          onChange={(event) =>
            setForm((prev) => ({ ...prev, download_links_json: event.target.value }))
          }
          rows={4}
          className={MONO_FIELD_CLASS}
        />
      </label>

      <MarkdownEditor
        label="更新内容"
        placeholder="描述本次版本的主要变化"
        value={form.content}
        onChange={(value) => setForm((prev) => ({ ...prev, content: value }))}
        rows={4}
        className={FIELD_CLASS}
      />

      <label className="space-y-1 text-sm">
        <span className="text-slate-700 dark:text-slate-300">发布时间</span>
        <input
          type="datetime-local"
          value={form.published_at}
          onChange={(event) => setForm((prev) => ({ ...prev, published_at: event.target.value }))}
          className={FIELD_CLASS}
          aria-label="发布时间"
        />
      </label>

      <div className="rounded-xl border border-slate-900/20 bg-white/80 px-3 py-2 text-sm dark:border-white/20 dark:bg-white/10">
        <p className="mb-2 text-slate-700 dark:text-slate-300">平台范围（多选，空表示全部）</p>
        <div className="flex flex-wrap gap-3">
          {platformOptions.map((item) => (
            <label
              key={item.value}
              className="inline-flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300"
            >
              <input
                type="checkbox"
                checked={form.platforms.includes(item.value)}
                onChange={() =>
                  setForm((prev) => ({
                    ...prev,
                    platforms: prev.platforms.includes(item.value)
                      ? prev.platforms.filter((platform) => platform !== item.value)
                      : [...prev.platforms, item.value],
                  }))
                }
                className="size-4"
              />
              {item.label}
            </label>
          ))}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="inline-flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
          <input
            type="checkbox"
            checked={form.is_latest}
            onChange={(event) => setForm((prev) => ({ ...prev, is_latest: event.target.checked }))}
            className="size-4 rounded border-white/30 bg-white/10"
            aria-label="设为 latest"
          />
          设为 latest
        </label>
        <label className="inline-flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
          <input
            type="checkbox"
            checked={form.is_preview}
            onChange={(event) => setForm((prev) => ({ ...prev, is_preview: event.target.checked }))}
            className="size-4 rounded border-white/30 bg-white/10"
            aria-label="预发布版本"
          />
          预发布版本
        </label>
        <label className="inline-flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
          <input
            type="checkbox"
            checked={form.is_milestone}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, is_milestone: event.target.checked }))
            }
            className="size-4 rounded border-white/30 bg-white/10"
          />
          标记为里程碑版本
        </label>
        <label className="inline-flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
          <input
            type="checkbox"
            checked={form.is_deprecated}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, is_deprecated: event.target.checked }))
            }
            className="size-4 rounded border-white/30 bg-white/10"
          />
          标记为废弃版本（客户端必更）
        </label>
      </div>

      <label className="space-y-1 text-sm">
        <span className="text-slate-700 dark:text-slate-300">扩展数据 JSON</span>
        <textarea
          placeholder='例如：{"channel":"beta"}'
          value={form.custom_data}
          onChange={(event) => setForm((prev) => ({ ...prev, custom_data: event.target.value }))}
          rows={4}
          className={MONO_FIELD_CLASS}
        />
      </label>
    </>
  )
}
