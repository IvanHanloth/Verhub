"use client"

import * as React from "react"
import { Check, ChevronRight, Copy } from "lucide-react"

/**
 * Collapsible JSON tree for the payload blobs the admin views display
 * (`device_info`, `custom_data`, action-record `http`).
 *
 * These are operator-supplied and unbounded — a device_info blob can be two
 * fields or two hundred — so a `<pre>` of pretty-printed JSON either truncates
 * at a fixed height or pushes every other log entry off the screen. The tree
 * makes the shape visible first and the contents on demand.
 */

type JsonViewerProps = {
  value: unknown
  /**
   * Levels expanded on first render. One level shows the top-level keys of a
   * typical payload without unfolding nested objects wholesale.
   */
  defaultExpandedDepth?: number
  /** Shown in place of the tree when the value is null/undefined or an empty object. */
  emptyText?: string
}

const INDENT_CLASS = "pl-4"

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isBranch(value: unknown): value is Record<string, unknown> | unknown[] {
  return Array.isArray(value) || isRecord(value)
}

/** `{} 空对象` vs `{…} 3 项` — the count is what tells you whether to open it. */
function branchSummary(value: Record<string, unknown> | unknown[]): string {
  const size = Array.isArray(value) ? value.length : Object.keys(value).length
  if (size === 0) {
    return Array.isArray(value) ? "[]" : "{}"
  }
  return Array.isArray(value) ? `[…] ${size} 项` : `{…} ${size} 项`
}

function isEmptyValue(value: unknown): boolean {
  if (value === null || value === undefined) {
    return true
  }
  if (isRecord(value)) {
    return Object.keys(value).length === 0
  }
  if (Array.isArray(value)) {
    return value.length === 0
  }
  return false
}

/** Leaf rendering, colored by type so a number and a numeric string differ visibly. */
function ScalarValue({ value }: { value: unknown }) {
  if (typeof value === "string") {
    return (
      <span className="break-all text-emerald-700 dark:text-emerald-300">&quot;{value}&quot;</span>
    )
  }
  if (typeof value === "number") {
    return <span className="text-sky-700 tabular-nums dark:text-sky-300">{value}</span>
  }
  if (typeof value === "boolean") {
    return <span className="text-violet-700 dark:text-violet-300">{String(value)}</span>
  }
  if (value === null) {
    return <span className="text-slate-400 dark:text-slate-500">null</span>
  }
  return <span className="text-slate-500 dark:text-slate-400">{String(value)}</span>
}

function JsonNode({
  label,
  value,
  depth,
  defaultExpandedDepth,
}: {
  label: string | null
  value: unknown
  depth: number
  defaultExpandedDepth: number
}) {
  const [expanded, setExpanded] = React.useState(depth < defaultExpandedDepth)

  const keyLabel =
    label === null ? null : <span className="text-slate-600 dark:text-slate-300">{label}</span>

  if (!isBranch(value)) {
    return (
      <div className="flex gap-1.5 py-0.5">
        {keyLabel}
        {keyLabel ? <span className="text-slate-400">:</span> : null}
        <ScalarValue value={value} />
      </div>
    )
  }

  const entries: Array<[string, unknown]> = Array.isArray(value)
    ? value.map((item, index) => [String(index), item])
    : Object.entries(value)

  // An empty branch has nothing to expand into, so it renders as a leaf.
  if (entries.length === 0) {
    return (
      <div className="flex gap-1.5 py-0.5">
        {keyLabel}
        {keyLabel ? <span className="text-slate-400">:</span> : null}
        <span className="text-slate-400 dark:text-slate-500">{branchSummary(value)}</span>
      </div>
    )
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setExpanded((current) => !current)}
        aria-expanded={expanded}
        className="flex w-full items-center gap-1 rounded py-0.5 text-left hover:bg-slate-900/5 dark:hover:bg-white/10"
      >
        <ChevronRight
          className={`size-3 shrink-0 text-slate-400 transition-transform ${expanded ? "rotate-90" : ""}`}
          aria-hidden
        />
        {keyLabel}
        {keyLabel ? <span className="text-slate-400">:</span> : null}
        <span className="text-slate-400 dark:text-slate-500">{branchSummary(value)}</span>
      </button>

      {expanded ? (
        <div className={`${INDENT_CLASS} border-l border-slate-900/10 dark:border-white/10`}>
          {entries.map(([key, item]) => (
            <JsonNode
              key={key}
              label={key}
              value={item}
              depth={depth + 1}
              defaultExpandedDepth={defaultExpandedDepth}
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}

function CopyButton({ value }: { value: unknown }) {
  const [copied, setCopied] = React.useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(JSON.stringify(value, null, 2))
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard access is denied in insecure contexts; the tree is still
      // selectable by hand, so a failure here is not worth an error banner.
    }
  }

  return (
    <button
      type="button"
      onClick={() => void copy()}
      title="复制 JSON"
      aria-label="复制 JSON"
      className="rounded p-1 text-slate-400 transition hover:bg-slate-900/5 hover:text-slate-700 dark:hover:bg-white/10 dark:hover:text-slate-200"
    >
      {copied ? <Check className="size-3.5 text-emerald-500" /> : <Copy className="size-3.5" />}
    </button>
  )
}

export function JsonViewer({ value, defaultExpandedDepth = 1, emptyText = "无" }: JsonViewerProps) {
  if (isEmptyValue(value)) {
    return <p className="text-xs text-slate-400 dark:text-slate-500">{emptyText}</p>
  }

  return (
    <div className="font-mono text-[11px] leading-relaxed">
      <div className="flex justify-end">
        <CopyButton value={value} />
      </div>
      <JsonNode
        label={null}
        value={value}
        depth={0}
        defaultExpandedDepth={Math.max(defaultExpandedDepth, 1)}
      />
    </div>
  )
}

/**
 * Labelled, collapsible container for one payload field.
 *
 * Collapsed by default: on a list of ten log entries the payloads are the
 * exception you open, not the thing you scroll past ten times.
 */
export function JsonField({
  label,
  value,
  defaultOpen = false,
}: {
  label: string
  value: unknown
  defaultOpen?: boolean
}) {
  const [open, setOpen] = React.useState(defaultOpen)
  const empty = isEmptyValue(value)

  return (
    <div className="rounded-xl border border-slate-900/10 bg-slate-900/[0.02] dark:border-white/10 dark:bg-white/5">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        disabled={empty}
        className="flex w-full items-center gap-1.5 px-3 py-2 text-left text-xs font-medium text-slate-600 disabled:opacity-60 dark:text-slate-300"
      >
        <ChevronRight
          className={`size-3 shrink-0 text-slate-400 transition-transform ${open ? "rotate-90" : ""}`}
          aria-hidden
        />
        <span className="font-mono">{label}</span>
        {empty ? <span className="text-slate-400 dark:text-slate-500">空</span> : null}
      </button>

      {open && !empty ? (
        <div className="max-h-72 overflow-auto border-t border-slate-900/10 px-3 py-2 dark:border-white/10">
          <JsonViewer value={value} />
        </div>
      ) : null}
    </div>
  )
}
