"use client"

import * as React from "react"
import {
  columnPinningFeature,
  columnResizingFeature,
  columnSizingFeature,
  columnVisibilityFeature,
  createColumnHelper,
  flexRender,
  metaHelper,
  tableFeatures,
  useTable,
  type Cell,
  type Column,
  type ColumnDef,
  type ColumnPinningState,
  type ColumnSizingState,
  type ColumnVisibilityState,
  type RowData,
} from "@tanstack/react-table"
import { AlertTriangle, Check, Columns3, Inbox, PanelRightOpen, Search, X } from "lucide-react"

import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"

import { MarkdownContent } from "@/components/markdown/markdown-content"

import { DataTableCellVariantProvider, useDataTableCellVariant } from "./data-table-cell-context"
import { DataTableDetailSheet, type DataTableDetailField } from "./data-table-detail"
import { JsonViewer } from "./json-viewer"

/**
 * 后台统一的数据表格，底座是 TanStack Table v9。
 *
 * 一字段一列 + 列显隐：列多不再是问题，因为看不看得到由使用者决定。
 * 单元格一律截成一行，完整内容进行详情抽屉——列表要的是扫读密度，读全文是另一件事。
 *
 * 搜索与筛选一律走服务端：列表是服务端分页的，只在当前页里过滤会让人以为
 * 「没搜到」，而实际上只是不在这十条里。所以本组件不持有任何过滤逻辑，只负责
 * 把输入交回页面，由页面带进请求。同理不注册排序特性——接口没有排序参数，
 * 只排当前十行是同一个误导。
 */

export type DataTableColumnMeta = {
  /** 列显隐菜单与详情抽屉里的字段名。header 不是纯字符串时必填。 */
  label?: string
  /** 默认隐藏。给次要字段用：需要时能开出来，但不占默认视野。 */
  defaultHidden?: boolean
  /** 不进详情抽屉。留给操作列——抽屉里的操作另外给。 */
  hideInDetail?: boolean
  /**
   * 横向滚动时固定在起始/末尾侧。
   * 同一侧只固定一列时偏移恒为 0；固定多列时偏移依赖各列实测宽度。
   */
  pin?: "start" | "end"
  className?: string
  headerClassName?: string
}

export const DATA_TABLE_FEATURES = tableFeatures({
  columnVisibilityFeature,
  columnSizingFeature,
  columnResizingFeature,
  columnPinningFeature,
  columnMeta: metaHelper<DataTableColumnMeta>(),
})

export type DataTableFeatures = typeof DATA_TABLE_FEATURES

export type DataTableColumnDef<T extends RowData> = ColumnDef<DataTableFeatures, T>

/** 列定义工具。绑好特性集，页面侧不用再重复写泛型。 */
export function createDataTableColumns<T extends RowData>() {
  return createColumnHelper<DataTableFeatures, T>()
}

export type DataTablePagination = {
  total: number
  page: number
  totalPages: number
  hasPrev: boolean
  hasNext: boolean
  onPrev: () => void
  onNext: () => void
}

export type DataTableSearch = {
  value: string
  onChange: (value: string) => void
  placeholder?: string
}

type DataTableProps<T extends RowData> = {
  columns: Array<DataTableColumnDef<T>>
  rows: T[]
  getRowId: (row: T) => string
  /** localStorage 键；不传则列显隐与列宽只在本次会话内有效。 */
  storageKey?: string
  search?: DataTableSearch
  /** 筛选控件。由页面提供，因为可筛的维度取决于接口支持什么。 */
  filters?: React.ReactNode
  /** 工具栏右侧的额外操作，如「显示隐藏项」开关。 */
  toolbarExtra?: React.ReactNode
  onResetFilters?: () => void
  loading?: boolean
  error?: string | null
  emptyMessage?: React.ReactNode
  rowClassName?: (row: T) => string | undefined
  /** 详情抽屉的标题；默认取第一列渲染出来的内容。 */
  detailTitle?: (row: T) => React.ReactNode
  /** 抽屉里列覆盖不到的补充内容，排在字段表之后。 */
  renderDetail?: (row: T) => React.ReactNode
  /** 关掉行详情抽屉。默认开启。 */
  detail?: false
  pagination?: DataTablePagination
}

const SKELETON_ROWS = 6

/** 行首「详情」按钮列的宽度（px）。固定值，免得它跟着内容抖。 */
const DETAIL_COLUMN_WIDTH = 40

/** 搜索输入的防抖时长：够短不影响手感，够长不至于每敲一个字就打一次接口。 */
const SEARCH_DEBOUNCE_MS = 350

const EMPTY_ROWS: never[] = []

function columnsKey(storageKey: string | undefined) {
  return storageKey ? `verhub:table-columns:${storageKey}` : null
}

function widthsKey(storageKey: string | undefined) {
  return storageKey ? `verhub:table-widths:${storageKey}` : null
}

/**
 * 读列显隐偏好。
 *
 * 存的是「隐藏的列 id 数组」而不是 TanStack 的 `Record<id, boolean>`：这个格式在换底座
 * 之前就已经写进用户浏览器了，改格式等于把所有人的偏好清空一次。
 */
function loadHiddenColumns(storageKey: string | undefined): string[] | null {
  const key = columnsKey(storageKey)
  if (!key || typeof window === "undefined") {
    return null
  }

  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) {
      return null
    }

    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : null
  } catch {
    // 存的是用户偏好，读失败退回默认列即可，不值得打断渲染。
    return null
  }
}

function saveHiddenColumns(storageKey: string | undefined, visibility: ColumnVisibilityState) {
  const key = columnsKey(storageKey)
  if (!key || typeof window === "undefined") {
    return
  }

  // 只有显式的 false 才算隐藏；缺项是可见。
  const hidden = Object.entries(visibility)
    .filter(([, visible]) => visible === false)
    .map(([id]) => id)

  try {
    window.localStorage.setItem(key, JSON.stringify(hidden))
  } catch {
    // 隐私模式下 localStorage 会抛异常；偏好丢了不影响本次使用。
  }
}

function loadColumnWidths(storageKey: string | undefined): ColumnSizingState | null {
  const key = widthsKey(storageKey)
  if (!key || typeof window === "undefined") {
    return null
  }

  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) {
      return null
    }

    const parsed = JSON.parse(raw) as unknown
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return null
    }

    const entries = Object.entries(parsed as Record<string, unknown>).filter(
      (entry): entry is [string, number] => typeof entry[1] === "number" && entry[1] > 0,
    )
    return entries.length > 0 ? Object.fromEntries(entries) : null
  } catch {
    return null
  }
}

function saveColumnWidths(storageKey: string | undefined, widths: ColumnSizingState) {
  const key = widthsKey(storageKey)
  if (!key || typeof window === "undefined") {
    return
  }

  try {
    // 没有任何用户设定就把键删掉，而不是留一个空对象：下次读到空对象和读不到
    // 是一个意思，留着只是垃圾。
    if (Object.keys(widths).length === 0) {
      window.localStorage.removeItem(key)
      return
    }

    window.localStorage.setItem(key, JSON.stringify(widths))
  } catch {
    // 同上。
  }
}

/** 列显隐菜单与详情抽屉共用的字段名。 */
function columnLabel<T extends RowData>(column: Column<DataTableFeatures, T, unknown>): string {
  const meta = column.columnDef.meta
  if (meta?.label) {
    return meta.label
  }

  const header = column.columnDef.header
  return typeof header === "string" ? header : column.id
}

/**
 * 列显隐面板。
 *
 * 自己实现而不是引入下拉菜单组件：整个项目只有这一处需要「按钮 + 浮层 +
 * 点外面关掉」，为它添一份 radix 依赖不划算。
 */
function ColumnToggle<T extends RowData>({
  columns,
  onReset,
}: {
  columns: Array<Column<DataTableFeatures, T, unknown>>
  onReset: () => void
}) {
  const [open, setOpen] = React.useState(false)
  const containerRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    if (!open) {
      return
    }

    function handlePointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false)
      }
    }

    document.addEventListener("mousedown", handlePointerDown)
    document.addEventListener("keydown", handleKeyDown)
    return () => {
      document.removeEventListener("mousedown", handlePointerDown)
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [open])

  const toggleable = columns.filter((column) => column.getCanHide())
  const visibleCount = toggleable.filter((column) => column.getIsVisible()).length

  return (
    <div className="relative" ref={containerRef}>
      <Button
        type="button"
        variant="outline"
        size="sm"
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((current) => !current)}
      >
        <Columns3 className="size-4" />
        列（{visibleCount}/{toggleable.length}）
      </Button>

      {open ? (
        <div className="absolute right-0 z-30 mt-2 w-56 rounded-xl border border-slate-900/10 bg-white p-2 shadow-xl dark:border-white/15 dark:bg-slate-900">
          <p className="px-2 pt-1 pb-2 text-xs text-slate-500 dark:text-slate-400">显示的列</p>
          <div className="max-h-72 space-y-0.5 overflow-y-auto">
            {toggleable.map((column) => (
              <label
                key={column.id}
                className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-slate-900/5 dark:hover:bg-white/10"
              >
                <input
                  type="checkbox"
                  className="size-4"
                  checked={column.getIsVisible()}
                  onChange={() => column.toggleVisibility()}
                />
                <span className="truncate">{columnLabel(column)}</span>
              </label>
            ))}
          </div>
          <div className="mt-1 border-t border-slate-900/10 pt-1 dark:border-white/10">
            <Button type="button" variant="ghost" size="sm" className="w-full" onClick={onReset}>
              恢复默认
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

/**
 * 固定列的定位样式。
 *
 * TanStack 只算区域与偏移，粘附、层级、底色都归渲染方管；底色必须是实心的，
 * 否则横向滚动时下面的内容会透过来。
 */
function pinnedStyle<T extends RowData>(
  column: Column<DataTableFeatures, T, unknown>,
): React.CSSProperties | undefined {
  const pinned = column.getIsPinned()
  if (!pinned) {
    return undefined
  }

  return {
    position: "sticky",
    insetInlineStart: pinned === "start" ? `${column.getStart("start")}px` : undefined,
    insetInlineEnd: pinned === "end" ? `${column.getAfter("end")}px` : undefined,
    zIndex: 2,
  }
}

function pinnedClassName<T extends RowData>(
  column: Column<DataTableFeatures, T, unknown>,
  variant: "head" | "body",
): string | undefined {
  const pinned = column.getIsPinned()
  if (!pinned) {
    return undefined
  }

  return cn(
    // 表头本身带一层浅色底纹，固定列得用叠加后的等效实心色，否则那一格会比同排浅一块。
    variant === "head" ? "bg-[var(--admin-surface-solid-head)]" : "bg-[var(--admin-surface-solid)]",
    pinned === "end" && "border-l border-slate-900/8 dark:border-white/8",
    pinned === "start" && "border-r border-slate-900/8 dark:border-white/8",
  )
}

/** 一行数据。整行可点开详情，但要避开行内的按钮/链接，否则点「删除」会顺手弹出抽屉。 */
function DataTableRow<T extends RowData>({
  cells,
  className,
  clipCells,
  onOpenDetail,
}: {
  cells: Array<Cell<DataTableFeatures, T, unknown>>
  className?: string
  /** fixed 布局下列宽已钉死，内容必须裁掉，否则会撑破自己那一格。 */
  clipCells?: boolean
  onOpenDetail?: () => void
}) {
  function handleClick(event: React.MouseEvent<HTMLTableRowElement>) {
    if (!onOpenDetail) {
      return
    }

    const target = event.target
    if (target instanceof Element && target.closest("button, a, input, select, textarea, label")) {
      return
    }

    // 正在选文本时不要抢走这次点击。
    if (window.getSelection()?.toString()) {
      return
    }

    onOpenDetail()
  }

  return (
    <tr
      onClick={handleClick}
      className={cn(
        "border-t border-slate-900/8 align-top transition-colors hover:bg-slate-900/[0.02] dark:border-white/8 dark:hover:bg-white/[0.03]",
        onOpenDetail ? "cursor-pointer" : undefined,
        className,
      )}
    >
      {onOpenDetail ? (
        <td className="px-2 py-2.5" style={{ width: DETAIL_COLUMN_WIDTH }}>
          <button
            type="button"
            aria-label="查看详情"
            title="查看详情"
            onClick={onOpenDetail}
            className="rounded-md p-1 text-slate-400 hover:bg-slate-900/5 hover:text-slate-600 dark:hover:bg-white/10 dark:hover:text-slate-200"
          >
            <PanelRightOpen className="size-4" aria-hidden />
          </button>
        </td>
      ) : null}

      {cells.map((cell) => (
        <td
          key={cell.id}
          style={pinnedStyle(cell.column)}
          className={cn(
            "px-3 py-2.5 text-sm",
            clipCells && "overflow-hidden",
            cell.column.columnDef.meta?.className,
            pinnedClassName(cell.column, "body"),
          )}
        >
          {flexRender(cell.column.columnDef.cell, cell.getContext())}
        </td>
      ))}
    </tr>
  )
}

export function DataTable<T extends RowData>({
  columns,
  rows,
  getRowId,
  storageKey,
  search,
  filters,
  toolbarExtra,
  onResetFilters,
  loading = false,
  error = null,
  emptyMessage = "暂无数据。",
  rowClassName,
  detailTitle,
  renderDetail,
  detail,
  pagination,
}: DataTableProps<T>) {
  const detailEnabled = detail !== false

  const defaultVisibility = React.useMemo<ColumnVisibilityState>(() => {
    const state: ColumnVisibilityState = {}
    for (const column of columns) {
      if (column.id && column.meta?.defaultHidden) {
        state[column.id] = false
      }
    }
    return state
  }, [columns])

  // 固定列是表格结构的静态属性，算一次就够。每渲染一次就新建一个 initialState
  // 对象会让 useTable 的选项引用一直在变，白白让它重算。
  const [initialState] = React.useState(() => {
    const columnPinning: ColumnPinningState = { start: [], end: [] }
    for (const column of columns) {
      if (column.id && column.meta?.pin) {
        columnPinning[column.meta.pin].push(column.id)
      }
    }
    return { columnPinning }
  })

  const [columnVisibility, setColumnVisibility] =
    React.useState<ColumnVisibilityState>(defaultVisibility)
  const [columnSizing, setColumnSizing] = React.useState<ColumnSizingState>({})

  // 用户手工拖过的列。只有这些宽度值得存——其余是本次挂载实测出来的，换个屏幕就该重测。
  const resizedIds = React.useRef<Set<string>>(new Set())
  // 实测出来的原始列宽，双击把手时用来还原。
  const measuredWidths = React.useRef<ColumnSizingState>({})

  // 读 localStorage 只能在挂载后做，服务端渲染时拿不到它；首帧先用默认值，挂载后再套用偏好。
  React.useEffect(() => {
    const hidden = loadHiddenColumns(storageKey)
    if (hidden) {
      setColumnVisibility(Object.fromEntries(hidden.map((id) => [id, false])))
    }

    const widths = loadColumnWidths(storageKey)
    if (widths) {
      resizedIds.current = new Set(Object.keys(widths))
      setColumnSizing((current) => ({ ...current, ...widths }))
    }
  }, [storageKey])

  const handleVisibilityChange = React.useCallback(
    (updater: React.SetStateAction<ColumnVisibilityState>) => {
      setColumnVisibility((current) => {
        const next = typeof updater === "function" ? updater(current) : updater
        saveHiddenColumns(storageKey, next)
        return next
      })
    },
    [storageKey],
  )

  /**
   * 列宽落盘。
   *
   * `columnResizeMode: "onChange"` 下拖动时列宽每一帧都在变，逐帧同步写
   * localStorage 会明显拖慢手感，所以等停下来再写。第一次不写：那一轮是刚从
   * localStorage 读回来的，反手用空集覆盖会把刚读到的偏好清掉。
   */
  const sizingPersistPrimed = React.useRef(false)
  React.useEffect(() => {
    if (!storageKey) {
      return
    }

    if (!sizingPersistPrimed.current) {
      sizingPersistPrimed.current = true
      return
    }

    const timer = window.setTimeout(() => {
      const persisted: ColumnSizingState = {}
      for (const id of resizedIds.current) {
        const width = columnSizing[id]
        if (typeof width === "number") {
          persisted[id] = width
        }
      }
      saveColumnWidths(storageKey, persisted)
    }, 300)

    return () => window.clearTimeout(timer)
  }, [columnSizing, storageKey])

  /** 双击把手：退回本次实测的自然宽度，并且不再算作用户设定。 */
  const resetColumnWidth = React.useCallback((id: string) => {
    resizedIds.current.delete(id)
    setColumnSizing((current) => {
      const next = { ...current }
      const measured = measuredWidths.current[id]
      if (typeof measured === "number") {
        next[id] = measured
      } else {
        delete next[id]
      }
      return next
    })
  }, [])

  const table = useTable<DataTableFeatures, T>({
    features: DATA_TABLE_FEATURES,
    columns,
    data: rows.length > 0 ? rows : EMPTY_ROWS,
    getRowId: (row) => getRowId(row),
    initialState,
    state: { columnVisibility, columnSizing },
    onColumnVisibilityChange: handleVisibilityChange,
    onColumnSizingChange: setColumnSizing,
    columnResizeMode: "onChange",
  })

  const allColumns = table.getAllLeafColumns()
  const visibleColumns = table.getVisibleLeafColumns()
  const visibleColumnIds = visibleColumns.map((column) => column.id).join("|")

  const headerCells = React.useRef(new Map<string, HTMLTableCellElement>())

  /**
   * 列宽实测。
   *
   * 先按内容自然排版渲染一帧，量出真实宽度后钉住，之后才切成 fixed 布局——
   * 这样列宽既不用手写七十个魔数，翻页时也不会因为这页内容更长而整体跳一次。
   */
  React.useLayoutEffect(() => {
    if (loading || error || rows.length === 0) {
      return
    }

    const missing = visibleColumnIds.split("|").filter((id) => id && columnSizing[id] === undefined)
    if (missing.length === 0) {
      return
    }

    const measured: ColumnSizingState = {}
    for (const id of missing) {
      const width = headerCells.current.get(id)?.getBoundingClientRect().width
      // 量不到就整批放弃：只钉住一部分列会让 fixed 布局里剩下那些退回默认宽度，
      // 比继续用自然布局更难看。jsdom 里所有列都恒为 0，正好走这条路。
      if (!width || width <= 0) {
        return
      }
      measured[id] = Math.round(width)
    }

    measuredWidths.current = { ...measuredWidths.current, ...measured }
    setColumnSizing((current) => ({ ...measured, ...current }))
  }, [columnSizing, error, loading, rows.length, visibleColumnIds])

  const sized = Object.keys(columnSizing).length > 0
  const columnSpan = visibleColumns.length + (detailEnabled ? 1 : 0)

  const resetColumns = React.useCallback(() => {
    handleVisibilityChange(defaultVisibility)
  }, [defaultVisibility, handleVisibilityChange])

  const [detailRowId, setDetailRowId] = React.useState<string | null>(null)
  const modelRows = table.getRowModel().rows
  const detailIndex = modelRows.findIndex((row) => row.id === detailRowId)
  const detailRow = detailIndex >= 0 ? modelRows[detailIndex] : undefined

  // 当前页换了内容（翻页、筛选、刷新）后原来那一行可能已经不在了，抽屉跟着关掉。
  React.useEffect(() => {
    if (detailRowId !== null && detailIndex < 0) {
      setDetailRowId(null)
    }
  }, [detailIndex, detailRowId])

  // 不 memo：TanStack 每次渲染都会重建行与单元格实例，缓存键永远不命中，
  // 而且这里只在抽屉开着的那一行上跑，构造几个 React 元素而已。
  const detailFields: DataTableDetailField[] = detailRow
    ? // getAllCells 而不是 getVisibleCells：抽屉的意义之一就是把隐藏列也摊开。
      detailRow
        .getAllCells()
        .filter((cell) => !cell.column.columnDef.meta?.hideInDetail)
        .map((cell) => ({
          id: cell.column.id,
          label: columnLabel(cell.column),
          content: flexRender(cell.column.columnDef.cell, cell.getContext()),
        }))
    : []

  const detailFirstCell = detailRow?.getAllCells()[0]
  const detailHeading = detailRow
    ? detailTitle
      ? detailTitle(detailRow.original)
      : detailFirstCell
        ? flexRender(detailFirstCell.column.columnDef.cell, detailFirstCell.getContext())
        : null
    : null

  return (
    <div className="space-y-3">
      <DataTableToolbar
        search={search}
        filters={filters}
        toolbarExtra={toolbarExtra}
        onResetFilters={onResetFilters}
        columnToggle={<ColumnToggle columns={allColumns} onReset={resetColumns} />}
      />

      <div className="overflow-x-auto rounded-2xl border border-slate-900/10 bg-white/60 dark:border-white/10 dark:bg-white/5">
        <table
          className="min-w-full border-collapse text-left"
          style={
            sized
              ? {
                  tableLayout: "fixed",
                  width: table.getTotalSize() + (detailEnabled ? DETAIL_COLUMN_WIDTH : 0),
                }
              : undefined
          }
        >
          {sized ? (
            <colgroup>
              {detailEnabled ? <col style={{ width: DETAIL_COLUMN_WIDTH }} /> : null}
              {visibleColumns.map((column) => (
                <col key={column.id} style={{ width: column.getSize() }} />
              ))}
            </colgroup>
          ) : null}

          <thead className="bg-slate-900/[0.04] text-xs tracking-wide text-slate-600 uppercase dark:bg-white/8 dark:text-slate-300">
            {table.getHeaderGroups().map((group) => (
              <tr key={group.id}>
                {detailEnabled ? <th className="px-2 py-2.5" /> : null}
                {group.headers.map((header) => (
                  <th
                    key={header.id}
                    scope="col"
                    ref={(node) => {
                      if (node) {
                        headerCells.current.set(header.column.id, node)
                      } else {
                        headerCells.current.delete(header.column.id)
                      }
                    }}
                    style={pinnedStyle(header.column)}
                    className={cn(
                      "relative px-3 py-2.5 font-medium whitespace-nowrap",
                      // fixed 布局下列宽由 colgroup 说了算，内容再长也得裁掉，
                      // 否则它会撑破自己那一格，把固定列的贴边偏移一起算歪。
                      sized && "overflow-hidden",
                      header.column.columnDef.meta?.headerClassName,
                      pinnedClassName(header.column, "head"),
                    )}
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}

                    {/* 拖拽把手只在列宽已实测后出现：还没量过时起始宽度是默认值，一拖就会跳。 */}
                    {sized && header.column.getCanResize() ? (
                      <span
                        role="separator"
                        aria-orientation="vertical"
                        aria-label={`调整「${columnLabel(header.column)}」列宽`}
                        title="拖动调整列宽，双击恢复"
                        // 在拖动开始时记下是哪一列，比事后比对宽度差可靠：
                        // 实测与还原也会改宽度，比对分不出那是不是用户干的。
                        onMouseDown={(event) => {
                          resizedIds.current.add(header.column.id)
                          header.getResizeHandler()(event)
                        }}
                        onTouchStart={(event) => {
                          resizedIds.current.add(header.column.id)
                          header.getResizeHandler()(event)
                        }}
                        onDoubleClick={() => resetColumnWidth(header.column.id)}
                        className={cn(
                          "absolute inset-y-1 right-0 w-1 cursor-col-resize touch-none rounded-full select-none",
                          header.column.getIsResizing()
                            ? "bg-sky-500"
                            : "bg-transparent hover:bg-sky-400/60",
                        )}
                      />
                    ) : null}
                  </th>
                ))}
              </tr>
            ))}
          </thead>

          <tbody>
            {loading ? <DataTableSkeletonRows columns={columnSpan} /> : null}

            {!loading && error ? (
              <tr>
                <td colSpan={columnSpan} className="px-4 py-12">
                  <div className="flex flex-col items-center gap-2 text-sm text-rose-600 dark:text-rose-300">
                    <AlertTriangle className="size-5" />
                    {error}
                  </div>
                </td>
              </tr>
            ) : null}

            {!loading && !error && modelRows.length === 0 ? (
              <tr>
                <td colSpan={columnSpan} className="px-4 py-12">
                  <div className="flex flex-col items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                    <Inbox className="size-5 text-slate-400" />
                    {emptyMessage}
                  </div>
                </td>
              </tr>
            ) : null}

            {!loading && !error
              ? modelRows.map((row) => (
                  <DataTableRow
                    key={row.id}
                    cells={row.getVisibleCells()}
                    className={rowClassName?.(row.original)}
                    clipCells={sized}
                    onOpenDetail={detailEnabled ? () => setDetailRowId(row.id) : undefined}
                  />
                ))
              : null}
          </tbody>
        </table>
      </div>

      {pagination ? <DataTableFooter pagination={pagination} disabled={loading} /> : null}

      {detailEnabled ? (
        <DataTableDetailSheet
          open={detailRow !== undefined}
          onOpenChange={(next) => {
            if (!next) {
              setDetailRowId(null)
            }
          }}
          title={detailHeading}
          fields={detailFields}
          extra={detailRow && renderDetail ? renderDetail(detailRow.original) : null}
          position={detailRow ? { index: detailIndex + 1, total: modelRows.length } : undefined}
          hasPrev={detailIndex > 0}
          hasNext={detailIndex >= 0 && detailIndex < modelRows.length - 1}
          onPrev={() => {
            const previous = modelRows[detailIndex - 1]
            if (previous) {
              setDetailRowId(previous.id)
            }
          }}
          onNext={() => {
            const next = modelRows[detailIndex + 1]
            if (next) {
              setDetailRowId(next.id)
            }
          }}
        />
      ) : null}
    </div>
  )
}

function DataTableSkeletonRows({ columns }: { columns: number }) {
  return (
    <>
      {Array.from({ length: SKELETON_ROWS }).map((_, rowIndex) => (
        <tr key={rowIndex} className="border-t border-slate-900/8 dark:border-white/8">
          {Array.from({ length: columns }).map((__, columnIndex) => (
            <td key={columnIndex} className="px-3 py-3">
              <div
                className={cn(
                  "h-3.5 animate-pulse rounded bg-slate-900/8 dark:bg-white/10",
                  columnIndex === 0 ? "w-2/3" : "w-full",
                )}
              />
            </td>
          ))}
        </tr>
      ))}
    </>
  )
}

/**
 * 搜索框自带防抖，并保留一份本地值。
 *
 * 直接把受控值接到请求上会让每个字符都触发一次列表刷新，而刷新期间输入框
 * 又要跟着服务端状态走，光标很容易跳；本地态 + 防抖回调把两件事分开。
 */
function DataTableSearchInput({ search }: { search: DataTableSearch }) {
  const [draft, setDraft] = React.useState(search.value)

  // 回调用 ref 存：页面多半是就地写 `onChange={(v) => ...}`，每次渲染都是新函数，
  // 若把它列进依赖，任何一次无关重渲染都会重置计时器，搜索就再也发不出去。
  const onChangeRef = React.useRef(search.onChange)
  React.useEffect(() => {
    onChangeRef.current = search.onChange
  })

  // 外部重置筛选时同步回来；值相同就不动，避免打断正在输入的内容。
  React.useEffect(() => {
    setDraft((current) => (current === search.value ? current : search.value))
  }, [search.value])

  React.useEffect(() => {
    if (draft === search.value) {
      return
    }

    const timer = window.setTimeout(() => onChangeRef.current(draft), SEARCH_DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
  }, [draft, search.value])

  return (
    <div className="relative min-w-56 flex-1 sm:max-w-xs">
      <Search
        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400"
        aria-hidden
      />
      <input
        type="search"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        placeholder={search.placeholder ?? "搜索…"}
        aria-label={search.placeholder ?? "搜索"}
        maxLength={128}
        className="h-8 w-full rounded-lg border border-slate-900/15 bg-white/70 pr-8 pl-9 text-sm outline-none dark:border-white/20 dark:bg-white/8"
      />
      {draft ? (
        <button
          type="button"
          aria-label="清空搜索"
          onClick={() => setDraft("")}
          className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-0.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
        >
          <X className="size-3.5" />
        </button>
      ) : null}
    </div>
  )
}

function DataTableToolbar({
  search,
  filters,
  toolbarExtra,
  onResetFilters,
  columnToggle,
}: {
  search?: DataTableSearch
  filters?: React.ReactNode
  toolbarExtra?: React.ReactNode
  onResetFilters?: () => void
  columnToggle: React.ReactNode
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {search ? <DataTableSearchInput search={search} /> : null}
      {filters}
      {onResetFilters ? (
        <Button type="button" variant="ghost" size="sm" onClick={onResetFilters}>
          重置
        </Button>
      ) : null}
      <div className="ml-auto flex flex-wrap items-center gap-2">
        {toolbarExtra}
        {columnToggle}
      </div>
    </div>
  )
}

function DataTableFooter({
  pagination,
  disabled,
}: {
  pagination: DataTablePagination
  disabled: boolean
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-xs text-slate-500 dark:text-slate-400">
        共 {pagination.total} 条，第 {pagination.page}/{pagination.totalPages} 页
      </p>
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!pagination.hasPrev || disabled}
          onClick={pagination.onPrev}
        >
          上一页
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!pagination.hasNext || disabled}
          onClick={pagination.onNext}
        >
          下一页
        </Button>
      </div>
    </div>
  )
}

/** 表格里的下拉筛选。带标签，因为一排裸下拉框没人知道哪个筛什么。 */
export function DataTableSelectFilter({
  label,
  value,
  onChange,
  options,
  allLabel = "全部",
}: {
  label: string
  value: string
  onChange: (value: string) => void
  options: Array<{ label: string; value: string }>
  allLabel?: string
}) {
  return (
    <label className="inline-flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
      {label}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-8 rounded-lg border border-slate-900/15 bg-white/70 px-2 text-sm text-slate-900 outline-none dark:border-white/20 dark:bg-white/8 dark:text-slate-100"
      >
        <option value="">{allLabel}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  )
}

/** 工具栏里的开关，如「显示已隐藏的记录」。 */
export function DataTableToggle({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <label className="inline-flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="size-3.5"
      />
      {label}
    </label>
  )
}

/** 空值占位。统一成一个淡灰破折号，免得各页面各写各的「未填写 / -- / 无」。 */
export function EmptyValue({ children = "—" }: { children?: React.ReactNode }) {
  return <span className="text-slate-400 dark:text-slate-500">{children}</span>
}

/**
 * 布尔单元格：勾 / 叉。比「是 / 否」两个同宽汉字好扫读——整列扫一眼找绿色即可。
 * 叉沿用 {@link EmptyValue} 的淡灰，让"否"退到背景里。
 *
 * 接受 null / undefined：接口里的布尔标记常是可选字段，"没有这个标记"就是否。
 */
export function BoolMark({ value }: { value: boolean | null | undefined }) {
  return value ? (
    <Check className="size-4 text-emerald-600 dark:text-emerald-400" aria-label="是" />
  ) : (
    <X className="size-4 text-slate-400 dark:text-slate-500" aria-label="否" />
  )
}

/**
 * 长文本单元格。表格里截成一行，详情抽屉里铺开全文并保留换行。
 *
 * 这三个 `*Cell` 都靠 {@link useDataTableCellVariant} 分辨自己在哪儿，所以列定义
 * 只写一遍，抽屉里的完整形态是白送的。
 */
export function TruncatedCell({
  children,
  title,
  className,
}: {
  children: React.ReactNode
  title?: string
  className?: string
}) {
  const variant = useDataTableCellVariant()

  if (variant === "detail") {
    return (
      <div className="max-h-96 overflow-y-auto text-sm break-words whitespace-pre-wrap">
        {children}
      </div>
    )
  }

  return (
    <div className={cn("max-w-[22rem] truncate", className)} title={title}>
      {children}
    </div>
  )
}

/** JSON 单元格。表格里只报有几项，详情抽屉里展开成可折叠的树。 */
export function JsonCell({ value }: { value: unknown }) {
  const variant = useDataTableCellVariant()

  if (value === null || value === undefined) {
    return <EmptyValue />
  }

  if (variant === "detail") {
    return (
      <div className="max-h-96 overflow-auto rounded-lg border border-slate-900/10 px-3 py-2 dark:border-white/10">
        <JsonViewer value={value} />
      </div>
    )
  }

  const size =
    typeof value === "object" && value !== null
      ? Array.isArray(value)
        ? value.length
        : Object.keys(value).length
      : 0

  return <span className="text-xs text-slate-500 tabular-nums dark:text-slate-400">{size} 项</span>
}

/** Markdown 单元格。表格里退成截断的纯文本，详情抽屉里正常渲染。 */
export function MarkdownCell({ value }: { value: string | null | undefined }) {
  const variant = useDataTableCellVariant()

  if (!value) {
    return <EmptyValue />
  }

  if (variant === "detail") {
    return (
      <div className="max-h-96 overflow-y-auto">
        <MarkdownContent className="text-sm">{value}</MarkdownContent>
      </div>
    )
  }

  return (
    <div className="max-w-[22rem] truncate" title={value}>
      {value}
    </div>
  )
}

export { DataTableCellVariantProvider, useDataTableCellVariant }
