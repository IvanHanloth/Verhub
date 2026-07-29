"use client"

import * as React from "react"
import { Eye, Pencil } from "lucide-react"

import { MarkdownContent } from "@/components/markdown/markdown-content"
import {
  FIELD_CLASS,
  LabeledField,
  MONO_FIELD_CLASS,
  SegmentedButton,
  SegmentedGroup,
} from "@/components/github/ui"

/**
 * 反馈 Issue 模板编辑器。
 *
 * GitHub Issue 正文按 Markdown 渲染，所以这里给的是「编辑 / 预览」双态而不是
 * 一个裸 textarea —— 表格、标题这类模板最容易写错的地方，肉眼看源码是看不出来的。
 * 变量清单放在正文下方并可点击插入：写模板时视线在正文上，清单放在标题旁边等于没有。
 */

type Mode = "edit" | "preview"

export function IssueTemplateEditor({
  titleTemplate,
  bodyTemplate,
  onTitleChange,
  onBodyChange,
  variables,
  disabled = false,
  titleLabel = "Issue 标题模板",
  bodyLabel = "Issue 正文模板",
}: {
  titleTemplate: string
  bodyTemplate: string
  onTitleChange: (value: string) => void
  onBodyChange: (value: string) => void
  variables: string[]
  disabled?: boolean
  titleLabel?: string
  bodyLabel?: string
}) {
  const [mode, setMode] = React.useState<Mode>("edit")
  const bodyRef = React.useRef<HTMLTextAreaElement>(null)

  // 只读态没有编辑动作可做，强制停在预览，省得展示一个点不动的输入框。
  const effectiveMode: Mode = disabled ? "preview" : mode

  function insertVariable(name: string) {
    const token = `{{${name}}}`
    const field = bodyRef.current
    if (!field) {
      onBodyChange(`${bodyTemplate}${token}`)
      return
    }
    const start = field.selectionStart ?? bodyTemplate.length
    const end = field.selectionEnd ?? start
    onBodyChange(`${bodyTemplate.slice(0, start)}${token}${bodyTemplate.slice(end)}`)
    // 插入后把光标放到变量之后，连续点几个变量才不会互相覆盖。
    requestAnimationFrame(() => {
      field.focus()
      field.setSelectionRange(start + token.length, start + token.length)
    })
  }

  return (
    <div className="space-y-3">
      <LabeledField label={titleLabel}>
        <input
          type="text"
          value={titleTemplate}
          onChange={(event) => onTitleChange(event.target.value)}
          disabled={disabled}
          placeholder="[用户反馈] {{content_head}}"
          maxLength={256}
          className={FIELD_CLASS}
        />
      </LabeledField>

      <div className="space-y-1 text-sm">
        <div className="flex items-center justify-between gap-2">
          <span className="text-slate-700 dark:text-slate-300">{bodyLabel}</span>
          {disabled ? null : (
            <SegmentedGroup>
              <SegmentedButton
                active={mode === "edit"}
                onClick={() => setMode("edit")}
                icon={<Pencil className="size-3.5" />}
                label="编辑"
              />
              <SegmentedButton
                active={mode === "preview"}
                onClick={() => setMode("preview")}
                icon={<Eye className="size-3.5" />}
                label="预览"
              />
            </SegmentedGroup>
          )}
        </div>

        {effectiveMode === "edit" ? (
          <textarea
            ref={bodyRef}
            value={bodyTemplate}
            onChange={(event) => onBodyChange(event.target.value)}
            disabled={disabled}
            rows={12}
            spellCheck={false}
            className={MONO_FIELD_CLASS}
          />
        ) : (
          <div className="min-h-40 rounded-lg border border-slate-900/15 bg-white/70 px-3 py-2 text-sm dark:border-white/15 dark:bg-white/5">
            {bodyTemplate.trim() ? (
              <MarkdownContent>{bodyTemplate}</MarkdownContent>
            ) : (
              <p className="text-xs text-slate-500 dark:text-slate-400">模板为空。</p>
            )}
          </div>
        )}

        {disabled ? null : (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            预览按 Markdown 渲染，`{"{{变量}}"}` 保持原样；实际转发时才替换成反馈内容。
          </p>
        )}
      </div>

      <div className="space-y-1">
        <span className="text-xs text-slate-600 dark:text-slate-400">
          {disabled ? "模板可用变量" : "可用变量（点击插入到正文光标处）"}
        </span>
        <div className="flex flex-wrap gap-1.5">
          {variables.map((name) => (
            <button
              key={name}
              type="button"
              disabled={disabled}
              onClick={() => insertVariable(name)}
              className="rounded-md border border-slate-900/15 bg-white/70 px-2 py-0.5 font-mono text-[11px] enabled:hover:border-sky-500/60 enabled:hover:text-sky-600 disabled:opacity-60 dark:border-white/15 dark:bg-white/10 dark:enabled:hover:text-sky-300"
            >
              {`{{${name}}}`}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
