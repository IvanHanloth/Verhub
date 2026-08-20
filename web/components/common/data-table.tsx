"use client"

import * as React from "react"
import { AlertTriangle, Check, ChevronRight, Columns3, Inbox, Search, X } from "lucide-react"

import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"

/**
 * 后台统一的数据表格。
 *
 * 之前每个列表页都把好几个字段垒进同一个单元格（「用户/评分」「状态」这类），
 * 于是既没法按单个字段扫读，也没法隐藏用不上的信息。这里改成一字段一列，
 * 再配上列显隐——列多不再是问题，因为看不看得到由使用者决定。
 *
 * 搜索与筛选一律走服务端：列表是服务端分页的，只在当前页里过滤会让人以为
 * 「没搜到」，而实际上只是不在这十条里。所以本组件不持有任何过滤逻辑，只负责
 * 把输入交回页面，由页面带进请求。
 */

export type DataTableColumn<T> = {
  /** 稳定标识；列显隐按它持久化，改名会让用户已保存的偏好失效。 */
  id: string
  header: React.ReactNode
  cell: (row: T) => React.ReactNode
  /** 默认隐藏。给次要字段用：需要时能开出来，但不占默认视野。 */
  defaultHidden?: boolean
  /** 不可隐藏。留给主键列与操作列——藏掉它们这一行就没法认也没法操作了。 */
  alwaysVisible?: boolean
  /** 列显隐菜单里的名字。header 是 ReactNode 时必填。 */
  label?: string
  className?: string
  headerClassName?: string
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

type DataTableProps<T> = {
  columns: Array<DataTableColumn<T>>
  rows: T[]
  getRowId: (row: T) => string
  /** localStorage 键；不传则列显隐只在本次会话内有效。 */
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
  /** 展开行内容；返回 null 表示该行没有可展开的东西。 */
  renderExpanded?: (row: T) => React.ReactNode
  pagination?: DataTablePagination
}

const SKELETON_ROWS = 6

/** 搜索输入的防抖时长：够短不影响手感，够长不至于每敲一个字就打一次接口。 */
const SEARCH_DEBOUNCE_MS = 350

function loadHiddenColumns(storageKey: string | undefined): string[] | null {
  if (!storageKey || typeof window === "undefined") {
    return null
  }

  try {
    const raw = window.localStorage.getItem(`verhub:table-columns:${storageKey}`)
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

function saveHiddenColumns(storageKey: string | undefined, hidden: string[]) {
  if (!storageKey || typeof window === "undefined") {
    return
  }

  try {
    window.localStorage.setItem(`verhub:table-columns:${storageKey}`, JSON.stringify(hidden))
  } catch {
    // 隐私模式下 localStorage 会抛异常；偏好丢了不影响本次使用。
  }
}

/**
 * 列显隐面板。
 *
 * 自己实现而不是引入下拉菜单组件：整个项目只有这一处需要「按钮 + 浮层 +
 * 点外面关掉」，为它添一份 radix 依赖不划算。
 */
function ColumnToggle<T>({
  columns,
  hidden,
  onToggle,
  onReset,
}: {
  columns: Array<DataTableColumn<T>>
  hidden: Set<string>
  onToggle: (id: string) => void
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

  const toggleable = columns.filter((column) => !column.alwaysVisible)
  const visibleCount =
    toggleable.length - toggleable.filter((column) => hidden.has(column.id)).length

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
                  checked={!hidden.has(column.id)}
                  onChange={() => onToggle(column.id)}
                />
                <span className="truncate">{column.label ?? column.id}</span>
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

/** 一行数据；有展开内容时整行可点开，展开态是行内的第二块区域。 */
function DataTableRow<T>({
  row,
  columns,
  expandedContent,
  className,
}: {
  row: T
  columns: Array<DataTableColumn<T>>
  expandedContent: React.ReactNode
  className?: string
}) {
  const [expanded, setExpanded] = React.useState(false)
  const expandable = expandedContent !== null && expandedContent !== undefined

  return (
    <>
      <tr
        className={cn(
          "border-t border-slate-900/8 align-top transition-colors hover:bg-slate-900/[0.02] dark:border-white/8 dark:hover:bg-white/[0.03]",
          className,
        )}
      >
        {expandable ? (
          <td className="w-8 px-2 py-2.5">
            <button
              type="button"
              aria-expanded={expanded}
              aria-label={expanded ? "收起详情" : "展开详情"}
              onClick={() => setExpanded((current) => !current)}
              className="rounded-md p-1 text-slate-400 hover:bg-slate-900/5 hover:text-slate-600 dark:hover:bg-white/10 dark:hover:text-slate-200"
            >
              <ChevronRight
                className={cn("size-4 transition-transform", expanded ? "rotate-90" : "")}
                aria-hidden
              />
            </button>
          </td>
        ) : null}

        {columns.map((column) => (
          <td key={column.id} className={cn("px-3 py-2.5 text-sm", column.className)}>
            {column.cell(row)}
          </td>
        ))}
      </tr>

      {expandable && expanded ? (
        <tr className="border-t border-slate-900/8 bg-slate-900/[0.02] dark:border-white/8 dark:bg-white/[0.03]">
          <td colSpan={columns.length + 1} className="px-4 py-3">
            {expandedContent}
          </td>
        </tr>
      ) : null}
    </>
  )
}

export function DataTable<T>({
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
  renderExpanded,
  pagination,
}: DataTableProps<T>) {
  const defaultHidden = React.useMemo(
    () => columns.filter((column) => column.defaultHidden).map((column) => column.id),
    [columns],
  )

  const [hidden, setHidden] = React.useState<Set<string>>(() => new Set(defaultHidden))

  // 读 localStorage 只能在挂载后做，服务端渲染时拿不到它；首帧先用默认列，
  // 挂载后再套用用户偏好。
  React.useEffect(() => {
    const stored = loadHiddenColumns(storageKey)
    if (stored) {
      setHidden(new Set(stored))
    }
  }, [storageKey])

  const updateHidden = React.useCallback(
    (next: Set<string>) => {
      setHidden(next)
      saveHiddenColumns(storageKey, Array.from(next))
    },
    [storageKey],
  )

  const toggleColumn = React.useCallback(
    (id: string) => {
      const next = new Set(hidden)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      updateHidden(next)
    },
    [hidden, updateHidden],
  )

  const resetColumns = React.useCallback(() => {
    updateHidden(new Set(defaultHidden))
  }, [defaultHidden, updateHidden])

  const visibleColumns = React.useMemo(
    () => columns.filter((column) => column.alwaysVisible || !hidden.has(column.id)),
    [columns, hidden],
  )

  const columnSpan = visibleColumns.length + (renderExpanded ? 1 : 0)

  return (
    <div className="space-y-3">
      <DataTableToolbar
        search={search}
        filters={filters}
        toolbarExtra={toolbarExtra}
        onResetFilters={onResetFilters}
        columnToggle={
          <ColumnToggle
            columns={columns}
            hidden={hidden}
            onToggle={toggleColumn}
            onReset={resetColumns}
          />
        }
      />

      <div className="overflow-x-auto rounded-2xl border border-slate-900/10 bg-white/60 dark:border-white/10 dark:bg-white/5">
        <table className="min-w-full border-collapse text-left">
          <thead className="bg-slate-900/[0.04] text-xs tracking-wide text-slate-600 uppercase dark:bg-white/8 dark:text-slate-300">
            <tr>
              {renderExpanded ? <th className="w-8 px-2 py-2.5" /> : null}
              {visibleColumns.map((column) => (
                <th
                  key={column.id}
                  scope="col"
                  className={cn(
                    "px-3 py-2.5 font-medium whitespace-nowrap",
                    column.headerClassName,
                  )}
                >
                  {column.header}
                </th>
              ))}
            </tr>
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

            {!loading && !error && rows.length === 0 ? (
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
              ? rows.map((row) => (
                  <DataTableRow
                    key={getRowId(row)}
                    row={row}
                    columns={visibleColumns}
                    className={rowClassName?.(row)}
                    expandedContent={renderExpanded ? renderExpanded(row) : null}
                  />
                ))
              : null}
          </tbody>
        </table>
      </div>

      {pagination ? <DataTableFooter pagination={pagination} disabled={loading} /> : null}
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

/** 单元格里的长文本：截断到一行，完整内容进 title。 */
export function TruncatedCell({
  children,
  title,
  className,
}: {
  children: React.ReactNode
  title?: string
  className?: string
}) {
  return (
    <div className={cn("max-w-[22rem] truncate", className)} title={title}>
      {children}
    </div>
  )
}
