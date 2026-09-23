"use client"

import * as React from "react"
import {
  AlertTriangle,
  Copy,
  ExternalLink,
  Github,
  Loader2,
  RefreshCw,
  RotateCcw,
  Trash2,
  Upload,
  X,
} from "lucide-react"
import Link from "next/link"
import { toast } from "sonner"

import { Button } from "@workspace/ui/components/button"

import { AdminCard } from "@/components/admin/admin-card"
import { AdminPageHeader } from "@/components/admin/admin-page-header"
import { useConfirm } from "@/components/common/confirm-dialog"
import {
  DataTable,
  DataTableSelectFilter,
  EmptyValue,
  TruncatedCell,
  createDataTableColumns,
} from "@/components/common/data-table"
import { ApiReferenceDrawer } from "@/components/docs/api-reference-drawer"
import { UploadDialog } from "@/components/files/upload-dialog"
import { useAdminProjects } from "@/hooks/use-admin-projects"
import { usePagination } from "@/hooks/use-pagination"
import { isAuthError } from "@/lib/api-client"
import { getSessionToken } from "@/lib/auth-session"
import { copyToClipboard } from "@/lib/clipboard"
import { getErrorMessage } from "@/lib/error-utils"
import {
  deleteFile,
  formatBytes,
  getCdnConfig,
  getStorageOverview,
  listFiles,
  refreshFileCdn,
  resolveFileUrl,
  retryFile,
  uploadFile,
  type CdnRefreshResult,
  type FileStatus,
  type StorageOverview,
  type StoredFileItem,
} from "@/lib/files-api"
import { formatTimestamp } from "@/lib/format"

const PAGE_SIZE = 20
const PENDING_POLL_MS = 3000

const STATUS_OPTIONS: Array<{ label: string; value: FileStatus }> = [
  { label: "可分发", value: "ready" },
  { label: "写入中", value: "pending" },
  { label: "失败", value: "failed" },
]

const STATUS_BADGE: Record<FileStatus, { label: string; className: string }> = {
  ready: {
    label: "可分发",
    className:
      "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:border-emerald-300/30 dark:bg-emerald-300/15 dark:text-emerald-200",
  },
  pending: {
    label: "写入中",
    className:
      "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:border-sky-300/30 dark:bg-sky-300/15 dark:text-sky-200",
  },
  failed: {
    label: "失败",
    className:
      "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:border-rose-300/30 dark:bg-rose-300/15 dark:text-rose-200",
  },
}

/** 一个进行中的上传任务。 */
type UploadTask = {
  key: string
  filename: string
  size: number
  uploaded: number
  controller: AbortController
}

const column = createDataTableColumns<StoredFileItem>()

export function FilesDashboard() {
  const confirm = useConfirm()
  const [token, setToken] = React.useState(() => getSessionToken().trim())
  const [authError, setAuthError] = React.useState<string | null>(null)
  const { selectedProject, selectedProjectKey, error: projectsError } = useAdminProjects()

  const [overview, setOverview] = React.useState<StorageOverview | null>(null)
  const [cdnEnabled, setCdnEnabled] = React.useState(false)
  const [uploadDialogOpen, setUploadDialogOpen] = React.useState(false)
  const [files, setFiles] = React.useState<StoredFileItem[]>([])
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [search, setSearch] = React.useState("")
  const [status, setStatus] = React.useState<"" | FileStatus>("")
  const [uploads, setUploads] = React.useState<UploadTask[]>([])

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

  const handleAuthError = React.useCallback((value: unknown) => {
    if (isAuthError(value)) {
      setToken("")
      setAuthError("登录状态已过期，请重新登录。")
    }
  }, [])

  React.useEffect(() => {
    if (!token) {
      return
    }
    const controller = new AbortController()
    getStorageOverview(token, controller.signal)
      .then(setOverview)
      .catch((loadError: unknown) => {
        if (!controller.signal.aborted) {
          handleAuthError(loadError)
          toast.error(getErrorMessage(loadError))
        }
      })
    getCdnConfig(token, controller.signal)
      .then((cdn) => setCdnEnabled(cdn.enabled && cdn.configured && Boolean(cdn.dist_base_url)))
      .catch(() => setCdnEnabled(false))
    return () => controller.abort()
  }, [token, handleAuthError])

  React.useEffect(() => {
    resetOffset()
  }, [selectedProjectKey, resetOffset])

  // 往页面里拖入文件时打开上传弹窗；弹窗外松手不让浏览器直接打开文件。
  const canUpload = Boolean(token && selectedProjectKey)
  React.useEffect(() => {
    if (!canUpload) {
      return
    }
    const hasFiles = (event: DragEvent) => event.dataTransfer?.types.includes("Files") ?? false
    const onDragEnter = (event: DragEvent) => {
      if (hasFiles(event)) {
        setUploadDialogOpen(true)
      }
    }
    const onDragOver = (event: DragEvent) => {
      if (hasFiles(event)) {
        event.preventDefault()
      }
    }
    const onDrop = (event: DragEvent) => {
      if (hasFiles(event)) {
        event.preventDefault()
      }
    }
    window.addEventListener("dragenter", onDragEnter)
    window.addEventListener("dragover", onDragOver)
    window.addEventListener("drop", onDrop)
    return () => {
      window.removeEventListener("dragenter", onDragEnter)
      window.removeEventListener("dragover", onDragOver)
      window.removeEventListener("drop", onDrop)
    }
  }, [canUpload])

  const loadFiles = React.useCallback(
    async (nextOffset: number, signal?: AbortSignal, silent = false) => {
      if (!token || !selectedProjectKey) {
        setFiles([])
        setTotal(0)
        return
      }
      if (!silent) {
        setLoading(true)
      }
      setError(null)
      try {
        const response = await listFiles(
          token,
          selectedProjectKey,
          {
            limit: PAGE_SIZE,
            offset: nextOffset,
            search: search.trim() || undefined,
            status: status || undefined,
          },
          signal,
        )
        setFiles(response.data)
        setTotal(response.total)
      } catch (loadError) {
        if (signal?.aborted) {
          return
        }
        handleAuthError(loadError)
        setError(getErrorMessage(loadError))
        setFiles([])
        setTotal(0)
      } finally {
        if (!signal?.aborted && !silent) {
          setLoading(false)
        }
      }
    },
    [token, selectedProjectKey, search, status, setTotal, handleAuthError],
  )

  React.useEffect(() => {
    const controller = new AbortController()
    void loadFiles(offset, controller.signal)
    return () => controller.abort()
  }, [loadFiles, offset])

  const hasPending = files.some((file) => file.status === "pending")
  React.useEffect(() => {
    if (!hasPending) {
      return
    }
    const timer = window.setInterval(() => void loadFiles(offset, undefined, true), PENDING_POLL_MS)
    return () => window.clearInterval(timer)
  }, [hasPending, loadFiles, offset])

  const backends = overview?.backends ?? []
  const projectBackend = backends.find((item) => item.id === selectedProject?.storage_backend_id)
  const defaultBackend = projectBackend ?? backends.find((item) => item.is_default)

  /** 依次上传弹窗里确认的文件；storageBackendId 为空串表示项目默认存储。 */
  async function handleStartUpload(list: File[], storageBackendId: string) {
    if (list.length === 0 || !token || !selectedProjectKey) {
      return
    }
    const projectKey = selectedProjectKey

    for (const file of list) {
      const task: UploadTask = {
        key: `${Date.now()}-${Math.random()}`,
        filename: file.name,
        size: file.size,
        uploaded: 0,
        controller: new AbortController(),
      }
      setUploads((current) => [...current, task])

      try {
        const stored = await uploadFile({
          token,
          projectKey,
          file,
          storageBackendId: storageBackendId || undefined,
          signal: task.controller.signal,
          onProgress: (uploaded) =>
            setUploads((current) =>
              current.map((item) => (item.key === task.key ? { ...item, uploaded } : item)),
            ),
        })
        toast.success(
          stored.status === "pending"
            ? `${stored.filename} 已上传，正在写入存储。`
            : `${stored.filename} 已上传。`,
        )
      } catch (uploadError) {
        if (!task.controller.signal.aborted) {
          handleAuthError(uploadError)
          toast.error(`${file.name}：${getErrorMessage(uploadError)}`)
        }
      } finally {
        setUploads((current) => current.filter((item) => item.key !== task.key))
      }
    }

    resetOffset()
    await loadFiles(0)
  }

  async function handleDelete(file: StoredFileItem) {
    if (!token || !selectedProjectKey) {
      return
    }
    const confirmed = await confirm({
      title: "删除文件",
      description: (
        <>
          将从存储中删除 <code className="font-mono">{file.filename}</code>，直链随即在源站失效。
          {cdnEnabled
            ? "删除后会自动提交 CDN 刷新任务，通常几分钟内生效。"
            : "未启用 CDN 刷新，CDN 上已缓存的副本在过期前仍可下载，需要立即失效请到 CDN 控制台刷新该 URL。"}
          {file.referenced_by.length > 0
            ? ` 版本 ${file.referenced_by.join("、")} 的下载链接仍指向它，删除后这些链接将无法下载。`
            : null}
        </>
      ),
      confirmLabel: "删除",
      destructive: true,
    })
    if (!confirmed) {
      return
    }

    try {
      const result = await deleteFile(token, selectedProjectKey, file.id)
      if (result.cdn_refresh && !result.cdn_refresh.ok) {
        toast.warning(`文件已删除，但 CDN 刷新失败：${result.cdn_refresh.error}`)
      } else if (result.cdn_refresh) {
        toast.success("文件已删除，已提交 CDN 刷新。")
      } else {
        toast.success("文件已删除。")
      }
      adjustAfterDelete(files.length - 1)
      const nextOffset = files.length === 1 && offset > 0 ? Math.max(0, offset - PAGE_SIZE) : offset
      await loadFiles(nextOffset)
    } catch (deleteError) {
      handleAuthError(deleteError)
      toast.error(getErrorMessage(deleteError))
    }
  }

  async function handleRefreshCdn(file: StoredFileItem) {
    if (!token || !selectedProjectKey) {
      return
    }
    try {
      const result: CdnRefreshResult = await refreshFileCdn(token, selectedProjectKey, file.id)
      if (result.ok) {
        toast.success("已提交 CDN 刷新任务，通常几分钟内生效。")
      } else {
        toast.error(`CDN 刷新失败：${result.error}`)
      }
    } catch (refreshError) {
      handleAuthError(refreshError)
      toast.error(getErrorMessage(refreshError))
    }
  }

  async function handleRetry(file: StoredFileItem) {
    if (!token || !selectedProjectKey) {
      return
    }
    try {
      await retryFile(token, selectedProjectKey, file.id)
      toast.success("已重新加入任务队列。")
      await loadFiles(offset)
    } catch (retryError) {
      handleAuthError(retryError)
      toast.error(getErrorMessage(retryError))
    }
  }

  const columns = [
    column.display({
      id: "filename",
      header: "文件名",
      enableHiding: false,
      cell: ({ row }) => (
        <span className="inline-flex max-w-[22rem] items-center gap-1.5">
          {row.original.source === "github_release" ? (
            <Github className="size-3.5 shrink-0 text-slate-500" aria-label="GitHub 附件镜像" />
          ) : null}
          <TruncatedCell title={row.original.filename}>{row.original.filename}</TruncatedCell>
        </span>
      ),
      meta: { className: "min-w-48" },
    }),
    column.display({
      id: "status",
      header: "状态",
      cell: ({ row }) => {
        const badge = STATUS_BADGE[row.original.status]
        return (
          <span
            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap ${badge.className}`}
            title={row.original.error ?? undefined}
          >
            {row.original.status === "pending" ? <Loader2 className="size-3 animate-spin" /> : null}
            {badge.label}
          </span>
        )
      },
    }),
    column.display({
      id: "size",
      header: "大小",
      cell: ({ row }) =>
        row.original.status === "pending" && row.original.size === 0 ? (
          <EmptyValue />
        ) : (
          formatBytes(row.original.size)
        ),
      meta: {
        className: "whitespace-nowrap text-xs tabular-nums text-slate-600 dark:text-slate-300",
      },
    }),
    column.display({
      id: "url",
      header: "直链",
      cell: ({ row }) => (
        <TruncatedCell className="max-w-[26rem]" title={resolveFileUrl(row.original)}>
          {resolveFileUrl(row.original)}
        </TruncatedCell>
      ),
      meta: { className: "font-mono text-xs text-slate-600 dark:text-slate-300" },
    }),
    column.display({
      id: "referenced_by",
      header: "引用版本",
      cell: ({ row }) =>
        row.original.referenced_by.length > 0 ? (
          row.original.referenced_by.join("、")
        ) : (
          <EmptyValue />
        ),
      meta: { className: "text-xs text-slate-600 dark:text-slate-300" },
    }),
    column.display({
      id: "storage",
      header: "存储",
      cell: ({ row }) => row.original.storage_backend_name,
      meta: { className: "whitespace-nowrap text-xs text-slate-600 dark:text-slate-300" },
    }),
    column.display({
      id: "created_at",
      header: "上传时间",
      cell: ({ row }) => formatTimestamp(row.original.created_at),
      meta: {
        className: "whitespace-nowrap text-xs tabular-nums text-slate-600 dark:text-slate-300",
      },
    }),
    column.display({
      id: "error",
      header: "错误",
      cell: ({ row }) =>
        row.original.error ? (
          <TruncatedCell className="max-w-[18rem]" title={row.original.error}>
            {row.original.error}
          </TruncatedCell>
        ) : (
          <EmptyValue />
        ),
      meta: { defaultHidden: true, className: "text-xs text-rose-600 dark:text-rose-300" },
    }),
    column.display({
      id: "sha256",
      header: "SHA-256",
      cell: ({ row }) => row.original.sha256 ?? <EmptyValue />,
      meta: {
        defaultHidden: true,
        className: "font-mono text-xs text-slate-500 dark:text-slate-400",
      },
    }),
    column.display({
      id: "content_type",
      header: "Content-Type",
      cell: ({ row }) => row.original.content_type,
      meta: {
        defaultHidden: true,
        className: "font-mono text-xs text-slate-500 dark:text-slate-400",
      },
    }),
    column.display({
      id: "source_url",
      header: "镜像来源",
      cell: ({ row }) => row.original.source_url ?? <EmptyValue />,
      meta: {
        defaultHidden: true,
        className: "font-mono text-xs text-slate-500 dark:text-slate-400",
      },
    }),
    column.display({
      id: "id",
      header: "文件 ID",
      cell: ({ row }) => row.original.id,
      meta: {
        defaultHidden: true,
        className: "font-mono text-xs text-slate-500 dark:text-slate-400",
      },
    }),
    column.display({
      id: "actions",
      header: "操作",
      enableHiding: false,
      cell: ({ row }) => {
        const file = row.original
        const url = resolveFileUrl(file)
        return (
          <div className="flex justify-end gap-1.5">
            {file.status === "failed" ? (
              <Button
                type="button"
                size="icon-sm"
                variant="outline"
                title={file.source === "github_release" ? "重试镜像" : "重试写入存储"}
                aria-label={file.source === "github_release" ? "重试镜像" : "重试写入存储"}
                onClick={() => void handleRetry(file)}
              >
                <RotateCcw className="size-4" />
              </Button>
            ) : null}
            <Button
              type="button"
              size="icon-sm"
              variant="outline"
              title="复制直链"
              aria-label="复制直链"
              disabled={file.status !== "ready"}
              onClick={() => void copyToClipboard(url, "直链已复制。")}
            >
              <Copy className="size-4" />
            </Button>
            <Button
              type="button"
              size="icon-sm"
              variant="outline"
              title="打开直链"
              aria-label="打开直链"
              disabled={file.status !== "ready"}
              onClick={() => window.open(url, "_blank", "noopener,noreferrer")}
            >
              <ExternalLink className="size-4" />
            </Button>
            {cdnEnabled ? (
              <Button
                type="button"
                size="icon-sm"
                variant="outline"
                title="刷新 CDN 缓存"
                aria-label="刷新 CDN 缓存"
                disabled={file.status !== "ready"}
                onClick={() => void handleRefreshCdn(file)}
              >
                <RefreshCw className="size-4" />
              </Button>
            ) : null}
            <Button
              type="button"
              size="icon-sm"
              variant="outline"
              title="删除"
              aria-label="删除"
              onClick={() => void handleDelete(file)}
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        )
      },
      meta: {
        hideInDetail: true,
        pin: "end",
        headerClassName: "text-right",
        className: "text-right",
      },
    }),
  ]

  return (
    <section className="space-y-6">
      <AdminPageHeader
        title="文件分发"
        description="上传安装包等文件，获得分发域名下不带跳转的固定直链，可直接用于版本下载链接与应用商店提交。"
        badge="Verhub Files"
        actions={
          <>
            <ApiReferenceDrawer
              tag="Files"
              title="文件接口文档"
              projectKey={selectedProject?.project_key}
            />
            <Button type="button" disabled={!canUpload} onClick={() => setUploadDialogOpen(true)}>
              <Upload className="size-4" />
              上传文件
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

      {overview && !overview.dist_base_url ? (
        <AdminCard className="flex items-start gap-2 text-sm text-amber-700 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <p>
            未配置分发域名（<code className="font-mono">VERHUB_DIST_BASE_URL</code>
            ），直链暂按当前站点地址展示， GitHub 附件镜像不可用。生产环境请配置独立的 CDN 域名，见
            <Link href="/admin/settings/storage" className="mx-1 underline underline-offset-2">
              存储设置
            </Link>
            。
          </p>
        </AdminCard>
      ) : null}

      <AdminCard as="section" className="space-y-4">
        <h2 className="text-lg font-semibold">文件列表</h2>

        {uploads.length > 0 ? (
          <ul className="space-y-2">
            {uploads.map((task) => {
              const percent = task.size > 0 ? Math.floor((task.uploaded / task.size) * 100) : 0
              return (
                <li
                  key={task.key}
                  className="rounded-xl border border-slate-900/10 bg-white/60 px-3 py-2 text-sm dark:border-white/10 dark:bg-white/5"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="truncate">{task.filename}</span>
                    <span className="flex shrink-0 items-center gap-2 text-xs text-slate-500 tabular-nums dark:text-slate-400">
                      {formatBytes(task.uploaded)} / {formatBytes(task.size)}
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        title="取消上传"
                        aria-label="取消上传"
                        onClick={() => task.controller.abort()}
                      >
                        <X className="size-4" />
                      </Button>
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-900/10 dark:bg-white/10">
                    <div
                      className="h-full rounded-full bg-sky-500 transition-[width]"
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                </li>
              )
            })}
          </ul>
        ) : null}

        <DataTable
          storageKey="files"
          columns={columns}
          rows={files}
          getRowId={(file) => file.id}
          loading={Boolean(token) && Boolean(selectedProjectKey) && loading}
          error={error}
          emptyMessage={
            !token
              ? "请先在登录页完成登录后查看文件。"
              : !selectedProjectKey
                ? "暂无项目，请先去项目管理页创建项目。"
                : "还没有文件，点击右上角「上传文件」开始。"
          }
          search={{
            value: search,
            onChange: (value) => {
              setSearch(value)
              resetOffset()
            },
            placeholder: "搜索文件名 / ID / SHA-256",
          }}
          filters={
            <DataTableSelectFilter
              label="状态"
              value={status}
              onChange={(value) => {
                setStatus(value as "" | FileStatus)
                resetOffset()
              }}
              options={STATUS_OPTIONS}
            />
          }
          onResetFilters={() => {
            setSearch("")
            setStatus("")
            resetOffset()
          }}
          detailTitle={(file) => file.filename}
          pagination={{ total, page, totalPages, hasPrev, hasNext, onPrev, onNext }}
        />
      </AdminCard>

      <UploadDialog
        open={uploadDialogOpen}
        onOpenChange={setUploadDialogOpen}
        backends={backends}
        defaultBackendName={defaultBackend?.name ?? null}
        uploadMaxBytes={overview?.upload_max_bytes ?? null}
        onStart={(list, storageBackendId) => void handleStartUpload(list, storageBackendId)}
      />
    </section>
  )
}
