"use client"

import * as React from "react"
import { Wand2 } from "lucide-react"

import { Button } from "@workspace/ui/components/button"

import type { TermsPlaceholder } from "@/lib/terms-api"

const INPUT_CLASS =
  "w-full rounded-lg border border-slate-900/20 bg-white/80 px-2.5 py-1.5 text-sm dark:border-white/20 dark:bg-white/10"

type Props = {
  placeholders: TermsPlaceholder[]
  values: Record<string, string>
  onChange: (key: string, value: string) => void
  onApply: () => void
  disabled?: boolean
}

/**
 * 模板填空表单。
 *
 * 只在管理端出现：填完点「生成正文」把内置模板里的 {{}} 替换掉写进编辑器，之后
 * 仍可手改，保存的是替换后的成品。表单值不入库 —— 库里存成品就够了，重新生成时
 * 再填一次即可。
 */
export function TermsPlaceholderForm({ placeholders, values, onChange, onApply, disabled }: Props) {
  const missing = placeholders.filter((item) => item.required && !(values[item.key] ?? "").trim())

  return (
    <section className="space-y-3 rounded-xl border border-amber-500/40 bg-amber-500/5 p-4">
      <div className="space-y-1">
        <h3 className="text-sm font-semibold">填写模板待补项</h3>
        <p className="text-xs text-slate-600 dark:text-slate-400">
          内置正文含 {placeholders.length}{" "}
          处只有运营者知道的内容。填好后点「生成正文」写入下方编辑器， 正文里不应留下任何{" "}
          <code>{"{{ }}"}</code>。
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {placeholders.map((item) => (
          <label key={item.key} className="space-y-1">
            <span className="flex items-center gap-1.5 text-xs font-medium">
              {item.label}
              {item.required ? <span className="text-rose-500">*</span> : null}
              <code className="text-[10px] text-slate-500 dark:text-slate-400">
                {`{{${item.key}}}`}
              </code>
            </span>
            <input
              type="text"
              value={values[item.key] ?? ""}
              placeholder={item.example}
              disabled={disabled}
              onChange={(event) => onChange(item.key, event.target.value)}
              className={INPUT_CLASS}
            />
            <span className="block text-[11px] text-slate-600 dark:text-slate-400">
              {item.hint}
            </span>
          </label>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" disabled={disabled} onClick={onApply}>
          <Wand2 className="size-4" />
          生成正文
        </Button>
        {missing.length > 0 ? (
          <span className="text-xs text-amber-700 dark:text-amber-300">
            还有 {missing.length} 项必填未写：{missing.map((item) => item.label).join("、")}
          </span>
        ) : null}
      </div>
    </section>
  )
}
