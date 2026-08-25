"use client"

import * as React from "react"
import { Archive, ArchiveRestore, Pencil, Trash2 } from "lucide-react"

import { Button } from "@workspace/ui/components/button"

import { useConfirm } from "@/components/common/confirm-dialog"
import { DataTable, type DataTableColumn } from "@/components/common/data-table"
import { formatTimestamp } from "@/lib/format"
import { getErrorMessage } from "@/lib/error-utils"
import {
  deleteEventDefinition,
  listEventDefinitions,
  updateEventDefinition,
  type EventDefinitionItem,
  type EventRange,
} from "@/lib/events-api"
import { formatNumber } from "@/components/analytics/chart-utils"

import { fieldClass } from "./event-controls"
import { EventsShell, ErrorBanner, NoEventsHint } from "./events-shell"

const PAGE_SIZE = 20

/**
 * 事件清单。
 *
 * 没有「新建事件」按钮，这是与旧「行为管理」最关键的差别：定义由采集端在第一次
 * 收到某个事件名时自动登记。这里能做的只有补充显示名与描述、把停用的事件归档。
 */
export function EventDefinitions() {
  return (
    <EventsShell
      title="事件清单"
      description="事件由客户端上报时自动登记，这里只做展示名与归档的维护。事件名是客户端使用的键，不可修改。"
    >
      {({ projectKey, range, reloadToken }) => (
        <DefinitionsBody projectKey={projectKey} range={range} reloadToken={reloadToken} />
      )}
    </EventsShell>
  )
}

function DefinitionsBody({
  projectKey,
  range,
  reloadToken,
}: {
  projectKey: string
  range: EventRange
  reloadToken: number
}) {
  const [rows, setRows] = React.useState<EventDefinitionItem[]>([])
  const [total, setTotal] = React.useState(0)
  const [page, setPage] = React.useState(0)
  const [search, setSearch] = React.useState("")
  const [includeArchived, setIncludeArchived] = React.useState(false)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [localToken, setLocalToken] = React.useState(0)
  const [editing, setEditing] = React.useState<EventDefinitionItem | null>(null)
  const confirm = useConfirm()

  React.useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError(null)

    listEventDefinitions(
      projectKey,
      {
        ...range,
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
        search: search || undefined,
        include_archived: includeArchived || undefined,
      },
      controller.signal,
    )
      .then((response) => {
        setRows(response.data)
        setTotal(response.total)
      })
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === "AbortError") return
        setError(getErrorMessage(cause, "事件清单加载失败"))
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })

    return () => controller.abort()
  }, [projectKey, range, page, search, includeArchived, reloadToken, localToken])

  const refresh = () => setLocalToken((token) => token + 1)

  const removeDefinition = async (definition: EventDefinitionItem) => {
    const ok = await confirm({
      title: "删除事件定义",
      description: (
        <>
          将删除 <code>{definition.name}</code> 的定义。
          <strong>事件明细与统计不会被删除</strong>
          ，并且下一次上报会把定义重新建回来。要停用某个事件请改用「归档」。
        </>
      ),
      confirmLabel: "删除",
      destructive: true,
    })
    if (!ok) return

    try {
      await deleteEventDefinition(projectKey, definition.event_definition_id)
      refresh()
    } catch (cause: unknown) {
      setError(getErrorMessage(cause, "删除失败"))
    }
  }

  const toggleArchived = async (definition: EventDefinitionItem) => {
    try {
      await updateEventDefinition(projectKey, definition.event_definition_id, {
        archived: !definition.archived,
      })
      refresh()
    } catch (cause: unknown) {
      setError(getErrorMessage(cause, "归档状态更新失败"))
    }
  }

  const columns: Array<DataTableColumn<EventDefinitionItem>> = [
    {
      id: "name",
      header: "事件名",
      alwaysVisible: true,
      cell: (row) => (
        <div className="space-y-0.5">
          <code className="rounded bg-slate-900/5 px-1.5 py-0.5 font-mono text-xs dark:bg-white/10">
            {row.name}
          </code>
          {row.display_name ? (
            <p className="text-xs text-slate-500 dark:text-slate-400">{row.display_name}</p>
          ) : null}
        </div>
      ),
    },
    {
      id: "description",
      header: "描述",
      cell: (row) => (
        <span className="text-xs text-slate-500 dark:text-slate-400">{row.description || "—"}</span>
      ),
    },
    {
      id: "range_count",
      header: "区间上报量",
      className: "text-right font-mono tabular-nums",
      cell: (row) => formatNumber(row.range_count),
    },
    {
      id: "first_seen",
      header: "首次出现",
      defaultHidden: true,
      cell: (row) => (
        <span className="text-xs text-slate-500">{formatTimestamp(row.first_seen_time, "—")}</span>
      ),
    },
    {
      id: "last_seen",
      header: "最近出现",
      cell: (row) => (
        <span className="text-xs text-slate-500">{formatTimestamp(row.last_seen_time, "—")}</span>
      ),
    },
    {
      id: "status",
      header: "状态",
      cell: (row) =>
        row.archived ? (
          <span className="rounded-full bg-slate-500/15 px-2 py-0.5 text-xs text-slate-400">
            已归档
          </span>
        ) : (
          <span className="rounded-full bg-emerald-400/15 px-2 py-0.5 text-xs text-emerald-300">
            使用中
          </span>
        ),
    },
    {
      id: "actions",
      header: "操作",
      alwaysVisible: true,
      cell: (row) => (
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" aria-label="编辑" onClick={() => setEditing(row)}>
            <Pencil className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            aria-label={row.archived ? "取消归档" : "归档"}
            onClick={() => void toggleArchived(row)}
          >
            {row.archived ? (
              <ArchiveRestore className="size-3.5" />
            ) : (
              <Archive className="size-3.5" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            aria-label="删除定义"
            onClick={() => void removeDefinition(row)}
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      ),
    },
  ]

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const noneAtAll = !loading && total === 0 && !search && !includeArchived

  if (noneAtAll) {
    return (
      <>
        {error ? <ErrorBanner message={error} /> : null}
        <NoEventsHint />
      </>
    )
  }

  return (
    <div className="space-y-4">
      {error ? <ErrorBanner message={error} /> : null}

      <DataTable
        columns={columns}
        rows={rows}
        getRowId={(row) => row.event_definition_id}
        storageKey="event-definitions"
        loading={loading}
        search={{
          value: search,
          onChange: (value) => {
            setSearch(value)
            setPage(0)
          },
          placeholder: "搜索事件名、显示名或描述",
        }}
        toolbarExtra={
          <label className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
            <input
              type="checkbox"
              checked={includeArchived}
              onChange={(event) => {
                setIncludeArchived(event.target.checked)
                setPage(0)
              }}
            />
            显示已归档
          </label>
        }
        emptyMessage="没有匹配的事件。"
        pagination={{
          total,
          page: page + 1,
          totalPages,
          hasPrev: page > 0,
          hasNext: page + 1 < totalPages,
          onPrev: () => setPage((value) => Math.max(0, value - 1)),
          onNext: () => setPage((value) => value + 1),
        }}
      />

      {editing ? (
        <EditDialog
          projectKey={projectKey}
          definition={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            refresh()
          }}
          onError={setError}
        />
      ) : null}
    </div>
  )
}

function EditDialog({
  projectKey,
  definition,
  onClose,
  onSaved,
  onError,
}: {
  projectKey: string
  definition: EventDefinitionItem
  onClose: () => void
  onSaved: () => void
  onError: (message: string) => void
}) {
  const [displayName, setDisplayName] = React.useState(definition.display_name ?? "")
  const [description, setDescription] = React.useState(definition.description ?? "")
  const [saving, setSaving] = React.useState(false)

  const save = async () => {
    setSaving(true)
    try {
      await updateEventDefinition(projectKey, definition.event_definition_id, {
        display_name: displayName,
        description,
      })
      onSaved()
    } catch (cause: unknown) {
      onError(getErrorMessage(cause, "保存失败"))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-4">
      <div className="admin-card w-full max-w-md space-y-4 p-6">
        <div>
          <h2 className="text-lg font-medium">编辑事件</h2>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            事件名 <code>{definition.name}</code> 是客户端上报时使用的键，不可修改。
          </p>
        </div>

        <label className="block space-y-1">
          <span className="text-xs text-slate-500 dark:text-slate-400">显示名</span>
          <input
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            maxLength={128}
            placeholder="留空则界面显示事件名本身"
            className={`${fieldClass} w-full`}
          />
        </label>

        <label className="block space-y-1">
          <span className="text-xs text-slate-500 dark:text-slate-400">描述</span>
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            maxLength={512}
            rows={3}
            placeholder="这个事件在什么时候触发"
            className={`${fieldClass} w-full`}
          />
        </label>

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            取消
          </Button>
          <Button onClick={() => void save()} disabled={saving}>
            保存
          </Button>
        </div>
      </div>
    </div>
  )
}
