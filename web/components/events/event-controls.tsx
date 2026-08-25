"use client"

import * as React from "react"
import { Loader2, Plus, X } from "lucide-react"

import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"

import { getErrorMessage } from "@/lib/error-utils"
import {
  EVENT_FILTER_OPS,
  EVENT_FILTER_OP_META,
  listEventDefinitions,
  type EventDefinitionItem,
  type EventFilter,
  type EventFilterOp,
  type EventRange,
} from "@/lib/events-api"

/** 后台表单里统一的输入框样式，避免每处各写一遍。 */
export const fieldClass =
  "rounded-lg border border-slate-900/15 bg-white/70 px-3 py-1.5 text-sm outline-none transition focus:border-cyan-400/60 dark:border-white/15 dark:bg-white/8"

/**
 * 事件定义的加载与缓存。
 *
 * 六个页面都要一份「这个项目有哪些事件」，各自请求会在切项目时打出六次同样的
 * 请求；集中在这里，各页只管用。
 */
export function useEventDefinitions(projectKey: string, range: EventRange, reloadToken = 0) {
  const [definitions, setDefinitions] = React.useState<EventDefinitionItem[]>([])
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!projectKey) {
      setDefinitions([])
      return
    }

    const controller = new AbortController()
    setLoading(true)
    setError(null)

    listEventDefinitions(projectKey, { ...range, limit: 200 }, controller.signal)
      .then((response) => setDefinitions(response.data))
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === "AbortError") return
        setError(getErrorMessage(cause, "事件清单加载失败"))
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })

    return () => controller.abort()
  }, [projectKey, range, reloadToken])

  return { definitions, loading, error }
}

/** 显示名优先，为空回退到事件名本身。 */
export function definitionLabel(definition: EventDefinitionItem): string {
  return definition.display_name?.trim() || definition.name
}

type EventPickerProps = {
  definitions: EventDefinitionItem[]
  value: string
  onChange: (name: string) => void
  loading?: boolean
  /** 允许「不限」；用于「回访事件不传则任意事件都算」这类场景。 */
  allowEmpty?: boolean
  emptyLabel?: string
  className?: string
  "aria-label"?: string
}

/**
 * 事件选择器。
 *
 * 用下拉而不是自由输入：事件名是服务端自动发现的，能选的就是已经上报过的那些；
 * 手打一个从没出现过的名字只会得到一张空图，还看不出是打错了字。
 */
export function EventPicker({
  definitions,
  value,
  onChange,
  loading = false,
  allowEmpty = false,
  emptyLabel = "不限",
  className,
  ...rest
}: EventPickerProps) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={cn(fieldClass, className)}
        aria-label={rest["aria-label"] ?? "选择事件"}
      >
        {allowEmpty ? <option value="">{emptyLabel}</option> : null}
        {/* 没有任何事件时给一个占位项，免得下拉是个空框看不出为什么。 */}
        {definitions.length === 0 && !allowEmpty ? <option value="">尚无事件</option> : null}
        {definitions.map((definition) => (
          <option key={definition.event_definition_id} value={definition.name}>
            {definitionLabel(definition)}
          </option>
        ))}
      </select>
      {loading ? <Loader2 className="size-3.5 animate-spin text-slate-400" /> : null}
    </span>
  )
}

type FilterEditorProps = {
  filters: EventFilter[]
  onChange: (filters: EventFilter[]) => void
  /** 行数上限，与后端 DTO 的 ArrayMaxSize 保持一致。 */
  max?: number
  label?: string
}

/**
 * 属性筛选行编辑器。
 *
 * 属性名是自由输入而非下拉：属性由接入方在 `track` 时随手带上，服务端不维护
 * 属性字典，列不出可选项。填错的后果只是筛出空结果，比强行列一个不全的清单诚实。
 */
export function FilterEditor({
  filters,
  onChange,
  max = 10,
  label = "属性筛选",
}: FilterEditorProps) {
  const update = (index: number, patch: Partial<EventFilter>) => {
    onChange(filters.map((filter, i) => (i === index ? { ...filter, ...patch } : filter)))
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs tracking-wide text-slate-400 uppercase">{label}</span>
        {filters.length < max ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onChange([...filters, { property: "", op: "eq", value: "" }])}
          >
            <Plus className="size-3.5" />
            添加条件
          </Button>
        ) : null}
      </div>

      {filters.length === 0 ? (
        <p className="text-xs text-slate-500">未设置条件，统计该事件的全部上报。</p>
      ) : null}

      {filters.map((filter, index) => {
        const needsValue = EVENT_FILTER_OP_META[filter.op]?.needsValue ?? true
        return (
          <div key={index} className="flex flex-wrap items-center gap-2">
            <input
              value={filter.property}
              onChange={(event) => update(index, { property: event.target.value })}
              placeholder="属性名，如 plan"
              aria-label="属性名"
              className={cn(fieldClass, "w-40")}
            />
            <select
              value={filter.op}
              onChange={(event) => update(index, { op: event.target.value as EventFilterOp })}
              aria-label="比较方式"
              className={fieldClass}
            >
              {EVENT_FILTER_OPS.map((op) => (
                <option key={op} value={op}>
                  {EVENT_FILTER_OP_META[op].label}
                </option>
              ))}
            </select>
            {needsValue ? (
              <input
                value={String(filter.value ?? "")}
                onChange={(event) => update(index, { value: event.target.value })}
                placeholder={
                  filter.op === "in" || filter.op === "not_in" ? "多个值用逗号分隔" : "取值"
                }
                aria-label="比较值"
                className={cn(fieldClass, "w-44")}
              />
            ) : null}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label="删除该条件"
              onClick={() => onChange(filters.filter((_, i) => i !== index))}
            >
              <X className="size-3.5" />
            </Button>
          </div>
        )
      })}
    </div>
  )
}
