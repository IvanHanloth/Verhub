"use client"

import * as React from "react"
import { AlertTriangle, Eye, EyeOff, Plus } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@workspace/ui/components/button"

import { isAuthError } from "@/lib/api-client"
import { getErrorMessage } from "@/lib/error-utils"
import { usePagination } from "@/hooks/use-pagination"
import { getSessionToken } from "@/lib/auth-session"
import { AdminCard } from "@/components/admin/admin-card"
import { AdminFormDialog } from "@/components/admin/admin-form-dialog"
import { AdminPageHeader } from "@/components/admin/admin-page-header"
import {
  DataTable,
  DataTableSelectFilter,
  DataTableToggle,
  EmptyValue,
  TruncatedCell,
  type DataTableColumn,
} from "@/components/common/data-table"
import { JsonField } from "@/components/common/json-viewer"
import { ApiReferenceDrawer } from "@/components/docs/api-reference-drawer"
import { useAdminProjects } from "@/hooks/use-admin-projects"
import {
  createLog,
  listLogs,
  updateLogVisibility,
  type LogItem,
  type LogLevel,
} from "@/lib/logs-api"
import { PLATFORM_OPTIONS, formatPlatformVersion, type Platform } from "@/lib/platform"

const PAGE_SIZE = 10

const levelOptions: Array<{ label: string; value: LogLevel }> = [
  { label: "Debug", value: 0 },
  { label: "Info", value: 1 },
  { label: "Warn", value: 2 },
  { label: "Error", value: 3 },
]

type FilterState = {
  level: "" | `${LogLevel}`
  platform: "" | Platform
  search: string
  startTime: string
  endTime: string
  includeHidden: boolean
}

const emptyFilters: FilterState = {
  level: "",
  platform: "",
  search: "",
  startTime: "",
  endTime: "",
  includeHidden: false,
}

type LogFormState = {
  level: `${LogLevel}`
  content: string
  platform: "" | Platform
  platform_version: string
  device_info: string
  custom_data: string
  is_hidden: boolean
}

const emptyLogForm: LogFormState = {
  level: "1",
  content: "",
  platform: "",
  platform_version: "",
  device_info: "",
  custom_data: "",
  is_hidden: false,
}

/** 空串视为未填；非法 JSON 直接抛出，由提交流程转成提示。 */
function parseJsonObject(value: string, field: string): Record<string, unknown> | undefined {
  const trimmed = value.trim()
  if (!trimmed) {
    return undefined
  }

  const parsed = JSON.parse(trimmed) as unknown
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(`${field} 必须是 JSON 对象。`)
  }

  return parsed as Record<string, unknown>
}

/**
 * 弹窗内表单字段的样式。
 *
 * 两套主题都写全：早先只给了 white/x 的取值，在浅色外壳上会淡到像禁用态。
 */
const FIELD_CLASS =
  "w-full rounded-xl border border-slate-900/15 bg-white/70 px-3 py-2 text-sm ring-teal-400 transition outline-none focus:ring-2 dark:border-white/20 dark:bg-white/8"

/** 工具栏里的时间输入，高度与其余筛选控件对齐。 */
const FILTER_INPUT_CLASS =
  "h-8 rounded-lg border border-slate-900/15 bg-white/70 px-2 text-sm outline-none dark:border-white/20 dark:bg-white/8"

function toEpochSeconds(value: string): number | undefined {
  const trimmed = value.trim()
  if (!trimmed) {
    return undefined
  }

  const time = Date.parse(trimmed)
  if (Number.isNaN(time)) {
    return undefined
  }

  return Math.floor(time / 1000)
}

function levelLabel(level: LogLevel): string {
  const mapping: Record<LogLevel, string> = {
    0: "Debug",
    1: "Info",
    2: "Warn",
    3: "Error",
  }

  return mapping[level]
}

/**
 * Level badge colors.
 *
 * 两套主题都写全：上一版只按深色外壳调过，浅色下会变成淡底近白字，
 * 而级别恰恰是这张表最先要扫到的东西。
 */
function levelBadgeClass(level: LogLevel): string {
  const mapping: Record<LogLevel, string> = {
    0: "border-cyan-500/30 bg-cyan-500/10 text-cyan-700 dark:border-cyan-300/30 dark:bg-cyan-300/15 dark:text-cyan-200",
    1: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:border-emerald-300/30 dark:bg-emerald-300/15 dark:text-emerald-200",
    2: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:border-amber-300/30 dark:bg-amber-300/15 dark:text-amber-200",
    3: "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:border-rose-300/30 dark:bg-rose-300/15 dark:text-rose-200",
  }

  return mapping[level]
}

function formatDateTime(value: number): string {
  const date = new Date(value * 1000)
  if (Number.isNaN(date.getTime())) {
    return String(value)
  }

  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date)
}

/** 地区列：由粗到细拼一串，缺哪级就跳过哪级。 */
function formatLocation(log: LogItem): string | null {
  const parts = [log.city, log.region_name, log.country_name ?? log.country_code]
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part))

  const unique = parts.filter((part, index) => parts.indexOf(part) === index)
  return unique.length > 0 ? unique.join(" · ") : null
}

/** JSON 列的单元格：只报有没有、有几项，具体内容进展开行。 */
function JsonSummaryCell({ value }: { value: unknown }) {
  if (value === null || value === undefined) {
    return <EmptyValue />
  }

  const size =
    typeof value === "object" && value !== null
      ? Array.isArray(value)
        ? value.length
        : Object.keys(value).length
      : 0

  return <span className="text-xs text-slate-500 tabular-nums dark:text-slate-400">{size} 项</span>
}

export function LogsDashboard() {
  const [token, setToken] = React.useState(() => getSessionToken().trim())
  const [authError, setAuthError] = React.useState<string | null>(null)

  const { selectedProject, selectedProjectKey, error: projectsError } = useAdminProjects()

  const [logs, setLogs] = React.useState<LogItem[]>([])
  const {
    offset,
    total,
    setTotal,
    page,
    totalPages,
    hasPrev,
    hasNext,
    onPrev,
    onNext,
    adjustAfterDelete,
    resetOffset,
  } = usePagination({ pageSize: PAGE_SIZE })
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const [filters, setFilters] = React.useState<FilterState>(emptyFilters)

  const [createDialogOpen, setCreateDialogOpen] = React.useState(false)
  const [createForm, setCreateForm] = React.useState<LogFormState>(emptyLogForm)
  const [createLoading, setCreateLoading] = React.useState(false)

  const hasToken = token.trim().length > 0

  const loadLogs = React.useCallback(
    async (nextOffset: number, signal?: AbortSignal) => {
      if (!token || !selectedProjectKey) {
        setLogs([])
        setTotal(0)
        return
      }

      const startTime = toEpochSeconds(filters.startTime)
      const endTime = toEpochSeconds(filters.endTime)

      if (startTime !== undefined && endTime !== undefined && startTime > endTime) {
        setError("开始时间不能晚于结束时间。")
        setLogs([])
        setTotal(0)
        return
      }

      setLoading(true)
      setError(null)

      try {
        const response = await listLogs(
          token,
          selectedProjectKey,
          {
            limit: PAGE_SIZE,
            offset: nextOffset,
            level: filters.level ? (Number(filters.level) as LogLevel) : undefined,
            platform: filters.platform || undefined,
            search: filters.search.trim() || undefined,
            start_time: startTime,
            end_time: endTime,
            include_hidden: filters.includeHidden || undefined,
          },
          signal,
        )

        setLogs(response.data)
        setTotal(response.total)
      } catch (loadError) {
        if (signal?.aborted) {
          return
        }

        if (isAuthError(loadError)) {
          setToken("")
          setAuthError("登录状态已过期，请重新登录。")
        }

        setError(getErrorMessage(loadError))
        setLogs([])
        setTotal(0)
      } finally {
        if (!signal?.aborted) {
          setLoading(false)
        }
      }
    },
    [filters, selectedProjectKey, token, setTotal],
  )

  React.useEffect(() => {
    const controller = new AbortController()
    void loadLogs(offset, controller.signal)

    return () => {
      controller.abort()
    }
  }, [loadLogs, offset])

  React.useEffect(() => {
    resetOffset()
  }, [selectedProjectKey, resetOffset])

  /** 改任何一个筛选条件都回到第一页：留在第 5 页看新条件的结果没有意义。 */
  const updateFilter = React.useCallback(
    <K extends keyof FilterState>(key: K, value: FilterState[K]) => {
      setFilters((current) => ({ ...current, [key]: value }))
      resetOffset()
    },
    [resetOffset],
  )

  function resetFilters() {
    setFilters(emptyFilters)
    resetOffset()
  }

  function openCreateDialog() {
    setCreateForm(emptyLogForm)
    setCreateDialogOpen(true)
  }

  async function handleCreateLog() {
    if (!token) {
      toast.error("请先登录后再操作。")
      return
    }

    if (!selectedProjectKey) {
      toast.error("请先选择项目。")
      return
    }

    const content = createForm.content.trim()
    if (!content) {
      toast.error("日志内容不能为空。")
      return
    }

    setCreateLoading(true)
    try {
      await createLog(token, selectedProjectKey, {
        level: Number(createForm.level) as LogLevel,
        content,
        platform: createForm.platform || undefined,
        platform_version: createForm.platform_version.trim() || undefined,
        device_info: parseJsonObject(createForm.device_info, "device_info"),
        custom_data: parseJsonObject(createForm.custom_data, "custom_data"),
        is_hidden: createForm.is_hidden,
      })
      toast.success("日志已新建。")
      setCreateDialogOpen(false)
      setCreateForm(emptyLogForm)
      resetOffset()
      await loadLogs(0)
    } catch (createError) {
      if (isAuthError(createError)) {
        setToken("")
        setAuthError("登录状态已过期，请重新登录。")
      }
      toast.error(getErrorMessage(createError))
    } finally {
      setCreateLoading(false)
    }
  }

  /** 行内隐藏/取消隐藏。未开启「显示隐藏日志」时，隐藏后该行会从当前页消失。 */
  async function handleToggleHidden(item: LogItem) {
    if (!token || !selectedProjectKey) {
      toast.error("请先登录并选择项目。")
      return
    }

    try {
      await updateLogVisibility(token, selectedProjectKey, item.id, !item.is_hidden)
      toast.success(item.is_hidden ? "日志已取消隐藏。" : "日志已隐藏。")

      // 隐藏会让该行从当前视图里消失，和删除一样可能把最后一页掏空。
      const leavesList = !filters.includeHidden && !item.is_hidden
      if (leavesList) {
        adjustAfterDelete(logs.length - 1)
      }
      const nextOffset =
        leavesList && logs.length === 1 && offset > 0 ? Math.max(0, offset - PAGE_SIZE) : offset
      await loadLogs(nextOffset)
    } catch (toggleError) {
      if (isAuthError(toggleError)) {
        setToken("")
        setAuthError("登录状态已过期，请重新登录。")
      }
      toast.error(getErrorMessage(toggleError))
    }
  }

  // 不做 memo：列定义里的操作按钮闭包了当前页数据与筛选状态，缓存下来只会让
  // 「隐藏」拿到上一轮的行。十列的对象字面量重建不值得为此冒风险。
  const columns: Array<DataTableColumn<LogItem>> = [
    {
      id: "level",
      header: "级别",
      label: "级别",
      alwaysVisible: true,
      cell: (log) => (
        <span
          className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium ${levelBadgeClass(log.level)}`}
        >
          {levelLabel(log.level)}
        </span>
      ),
    },
    {
      id: "created_at",
      header: "时间",
      label: "时间",
      className: "whitespace-nowrap text-xs text-slate-600 tabular-nums dark:text-slate-300",
      cell: (log) => formatDateTime(log.created_at),
    },
    {
      id: "content",
      header: "内容",
      label: "内容",
      alwaysVisible: true,
      className: "min-w-64",
      cell: (log) => (
        <TruncatedCell className="max-w-[32rem]" title={log.content}>
          {log.content}
        </TruncatedCell>
      ),
    },
    {
      id: "status",
      header: "状态",
      label: "状态（是否隐藏）",
      cell: (log) =>
        log.is_hidden ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[11px] text-amber-700 dark:border-amber-300/40 dark:bg-amber-300/10 dark:text-amber-200">
            <EyeOff className="size-3" />
            已隐藏
          </span>
        ) : (
          <span className="text-xs text-slate-500 dark:text-slate-400">正常</span>
        ),
    },
    {
      id: "platform",
      header: "平台",
      label: "平台",
      className: "whitespace-nowrap text-xs text-slate-600 dark:text-slate-300",
      cell: (log) => formatPlatformVersion(log.platform, log.platform_version) ?? <EmptyValue />,
    },
    {
      id: "ip",
      header: "IP",
      label: "来源 IP",
      className: "font-mono text-xs text-slate-600 dark:text-slate-300",
      cell: (log) => log.ip ?? <EmptyValue />,
    },
    {
      id: "location",
      header: "地区",
      label: "来源地区",
      className: "text-xs text-slate-600 dark:text-slate-300",
      cell: (log) => formatLocation(log) ?? <EmptyValue />,
    },
    {
      id: "user_agent",
      header: "User-Agent",
      label: "User-Agent",
      defaultHidden: true,
      className: "font-mono text-xs text-slate-600 dark:text-slate-300",
      cell: (log) =>
        log.user_agent ? (
          <TruncatedCell className="max-w-[18rem]" title={log.user_agent}>
            {log.user_agent}
          </TruncatedCell>
        ) : (
          <EmptyValue />
        ),
    },
    {
      id: "device_info",
      header: "device_info",
      label: "device_info",
      defaultHidden: true,
      cell: (log) => <JsonSummaryCell value={log.device_info} />,
    },
    {
      id: "custom_data",
      header: "custom_data",
      label: "custom_data",
      defaultHidden: true,
      cell: (log) => <JsonSummaryCell value={log.custom_data} />,
    },
    {
      id: "id",
      header: "ID",
      label: "日志 ID",
      defaultHidden: true,
      className: "font-mono text-xs text-slate-500 dark:text-slate-400",
      cell: (log) => log.id,
    },
    {
      id: "actions",
      header: "操作",
      label: "操作",
      alwaysVisible: true,
      headerClassName: "text-right",
      className: "text-right",
      cell: (log) => (
        <Button
          type="button"
          size="icon-sm"
          variant="outline"
          title={log.is_hidden ? "取消隐藏" : "隐藏"}
          aria-label={log.is_hidden ? "取消隐藏" : "隐藏"}
          onClick={() => void handleToggleHidden(log)}
        >
          {log.is_hidden ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
        </Button>
      ),
    },
  ]

  return (
    <section className="space-y-6">
      <AdminPageHeader
        title="日志审计中心"
        description="按项目、级别、平台和时间范围筛选日志，定位运行问题。"
        badge="Verhub Logs"
        actions={
          <>
            <ApiReferenceDrawer
              tag="Logs"
              title="日志接口文档"
              projectKey={selectedProject?.project_key}
            />
            <Button type="button" disabled={!selectedProjectKey} onClick={openCreateDialog}>
              <Plus className="size-4" />
              新增日志
            </Button>
          </>
        }
      />

      {authError || projectsError ? (
        <AdminCard className="flex items-center gap-2 text-sm text-rose-500 dark:text-rose-300">
          <AlertTriangle className="size-4" />
          {authError ?? projectsError}
        </AdminCard>
      ) : null}

      <AdminCard as="section" className="space-y-4">
        <h2 className="text-lg font-semibold">日志列表</h2>

        <DataTable
          storageKey="logs"
          columns={columns}
          rows={logs}
          getRowId={(log) => log.id}
          loading={hasToken && Boolean(selectedProjectKey) && loading}
          error={error}
          emptyMessage={
            !hasToken
              ? "请先在登录页完成登录后查看日志数据。"
              : !selectedProjectKey
                ? "暂无项目，请先去项目管理页创建项目。"
                : "当前筛选条件下暂无日志。"
          }
          rowClassName={(log) => (log.is_hidden ? "opacity-60" : undefined)}
          search={{
            value: filters.search,
            onChange: (value) => updateFilter("search", value),
            placeholder: "搜索内容 / IP / 地区",
          }}
          filters={
            <>
              <DataTableSelectFilter
                label="级别"
                value={filters.level}
                onChange={(value) => updateFilter("level", value as FilterState["level"])}
                options={levelOptions.map((option) => ({
                  label: option.label,
                  value: String(option.value),
                }))}
              />
              <DataTableSelectFilter
                label="平台"
                value={filters.platform}
                onChange={(value) => updateFilter("platform", value as FilterState["platform"])}
                options={PLATFORM_OPTIONS}
              />
              <label className="inline-flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                起
                <input
                  type="datetime-local"
                  aria-label="开始时间"
                  className={FILTER_INPUT_CLASS}
                  value={filters.startTime}
                  onChange={(event) => updateFilter("startTime", event.target.value)}
                />
              </label>
              <label className="inline-flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                止
                <input
                  type="datetime-local"
                  aria-label="结束时间"
                  className={FILTER_INPUT_CLASS}
                  value={filters.endTime}
                  onChange={(event) => updateFilter("endTime", event.target.value)}
                />
              </label>
            </>
          }
          onResetFilters={resetFilters}
          toolbarExtra={
            <DataTableToggle
              label="显示已隐藏"
              checked={filters.includeHidden}
              onChange={(checked) => updateFilter("includeHidden", checked)}
            />
          }
          renderExpanded={(log) => (
            <div className="grid gap-2 sm:grid-cols-2">
              <JsonField label="device_info" value={log.device_info} />
              <JsonField label="custom_data" value={log.custom_data} />
            </div>
          )}
          pagination={{ total, page, totalPages, hasPrev, hasNext, onPrev, onNext }}
        />
      </AdminCard>

      <AdminFormDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        title="新增日志"
        description="手动补录一条日志；IP、UA、地理位置留空，不会伪装成客户端上报。"
        submitLabel="创建日志"
        submitIcon={<Plus className="size-4" />}
        submitting={createLoading}
        submitDisabled={!selectedProjectKey}
        onSubmit={() => void handleCreateLog()}
        formValue={createForm}
        className="sm:max-w-3xl"
      >
        <label className="space-y-1 text-sm">
          <span className="text-slate-700 dark:text-slate-300">日志级别</span>
          <select
            value={createForm.level}
            onChange={(event) =>
              setCreateForm((prev) => ({
                ...prev,
                level: event.target.value as LogFormState["level"],
              }))
            }
            className={FIELD_CLASS}
          >
            {levelOptions.map((option) => (
              <option key={option.value} value={String(option.value)}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-1 text-sm">
          <span className="text-slate-700 dark:text-slate-300">日志内容</span>
          <textarea
            value={createForm.content}
            onChange={(event) =>
              setCreateForm((prev) => ({ ...prev, content: event.target.value }))
            }
            rows={5}
            maxLength={4096}
            placeholder="例如：定时任务执行失败，已人工恢复"
            className={FIELD_CLASS}
          />
        </label>

        <label className="space-y-1 text-sm">
          <span className="text-slate-700 dark:text-slate-300">平台</span>
          <select
            value={createForm.platform}
            onChange={(event) =>
              setCreateForm((prev) => ({ ...prev, platform: event.target.value as "" | Platform }))
            }
            className={FIELD_CLASS}
          >
            <option value="">未指定平台</option>
            {PLATFORM_OPTIONS.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-1 text-sm">
          <span className="text-slate-700 dark:text-slate-300">平台版本</span>
          <input
            type="text"
            value={createForm.platform_version}
            onChange={(event) =>
              setCreateForm((prev) => ({ ...prev, platform_version: event.target.value }))
            }
            maxLength={32}
            placeholder="例如：11 / ubuntu 24.04"
            className={FIELD_CLASS}
          />
        </label>

        <label className="space-y-1 text-sm">
          <span className="text-slate-700 dark:text-slate-300">device_info JSON</span>
          <textarea
            value={createForm.device_info}
            onChange={(event) =>
              setCreateForm((prev) => ({ ...prev, device_info: event.target.value }))
            }
            rows={3}
            placeholder='例如：{"os":"windows"}'
            className={`${FIELD_CLASS} font-mono text-xs`}
          />
        </label>

        <label className="space-y-1 text-sm">
          <span className="text-slate-700 dark:text-slate-300">custom_data JSON</span>
          <textarea
            value={createForm.custom_data}
            onChange={(event) =>
              setCreateForm((prev) => ({ ...prev, custom_data: event.target.value }))
            }
            rows={3}
            placeholder='例如：{"build":"1.0.0"}'
            className={`${FIELD_CLASS} font-mono text-xs`}
          />
        </label>

        <label className="inline-flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
          <input
            type="checkbox"
            checked={createForm.is_hidden}
            onChange={(event) =>
              setCreateForm((prev) => ({ ...prev, is_hidden: event.target.checked }))
            }
            className="size-4"
          />
          隐藏日志（列表默认不显示，等级统计仍计入）
        </label>
      </AdminFormDialog>
    </section>
  )
}
