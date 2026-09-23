"use client"

import * as React from "react"
import { FolderOpen, Loader2, Plus } from "lucide-react"

import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"

import { getSessionToken } from "@/lib/auth-session"
import { getErrorMessage } from "@/lib/error-utils"
import { formatBytes, listFiles, resolveFileUrl, type StoredFileItem } from "@/lib/files-api"
import { formatTimestamp } from "@/lib/format"

const PICKER_PAGE_SIZE = 50

/**
 * 「从文件库添加」按钮：弹出项目内可分发的文件，选中后以 `onPick(url, file)` 回调。
 * 没有项目时不渲染。
 */
export function FilePickerButton({
  projectKey,
  onPick,
}: {
  projectKey: string | null | undefined
  onPick: (url: string, file: StoredFileItem) => void
}) {
  const [open, setOpen] = React.useState(false)
  const [search, setSearch] = React.useState("")
  const [files, setFiles] = React.useState<StoredFileItem[]>([])
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!open || !projectKey) {
      return
    }
    const token = getSessionToken().trim()
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      setLoading(true)
      setError(null)
      listFiles(
        token,
        projectKey,
        { limit: PICKER_PAGE_SIZE, status: "ready", search: search.trim() || undefined },
        controller.signal,
      )
        .then((response) => setFiles(response.data))
        .catch((loadError: unknown) => {
          if (!controller.signal.aborted) {
            setError(getErrorMessage(loadError))
          }
        })
        .finally(() => {
          if (!controller.signal.aborted) {
            setLoading(false)
          }
        })
    }, 250)

    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [open, projectKey, search])

  if (!projectKey) {
    return null
  }

  return (
    <>
      <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)}>
        <FolderOpen className="size-4" />
        从文件库添加
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>从文件库添加下载链接</DialogTitle>
            <DialogDescription>
              选中的文件以分发直链追加到下载链接列表，可多次添加。
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-3">
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="搜索文件名"
              className="w-full rounded-xl border border-slate-900/20 bg-white/80 px-3 py-2 text-sm outline-none dark:border-white/20 dark:bg-white/10"
            />
            {loading ? (
              <p className="flex items-center gap-2 text-sm text-slate-500">
                <Loader2 className="size-4 animate-spin" />
                正在加载...
              </p>
            ) : error ? (
              <p className="text-sm text-rose-500">{error}</p>
            ) : files.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                没有可用的文件，请先到「文件分发」上传。
              </p>
            ) : (
              <ul className="divide-y divide-slate-900/10 dark:divide-white/10">
                {files.map((file) => (
                  <li key={file.id} className="flex items-center justify-between gap-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm">{file.filename}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {formatBytes(file.size)} · {formatTimestamp(file.created_at)}
                        {file.referenced_by.length > 0
                          ? ` · 已被 ${file.referenced_by.join("、")} 引用`
                          : ""}
                      </p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => onPick(resolveFileUrl(file), file)}
                    >
                      <Plus className="size-4" />
                      添加
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </DialogBody>
        </DialogContent>
      </Dialog>
    </>
  )
}
