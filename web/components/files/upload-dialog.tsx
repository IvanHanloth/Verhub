"use client"

import * as React from "react"
import { FileUp, Trash2, Upload } from "lucide-react"

import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"

import { formatBytes, type StorageBackendView } from "@/lib/files-api"

const SELECT_CLASS =
  "h-9 w-full rounded-lg border border-slate-900/15 bg-white/70 px-2 text-sm outline-none dark:border-white/20 dark:bg-white/8"

/** 待上传列表中的一项。 */
type PendingFile = {
  key: string
  file: File
  /** 不能上传的原因；为空表示可上传。 */
  problem: string | null
}

/**
 * 上传文件弹窗：拖放或点击选择文件，确认存储后开始上传。
 * 点「开始上传」后以 `onStart(files, storageBackendId)` 回调并关闭弹窗，进度由调用方展示。
 * `storageBackendId` 为空串表示使用项目默认存储。
 */
export function UploadDialog({
  open,
  onOpenChange,
  backends,
  defaultBackendName,
  uploadMaxBytes,
  onStart,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  backends: StorageBackendView[]
  defaultBackendName: string | null
  uploadMaxBytes: number | null
  onStart: (files: File[], storageBackendId: string) => void
}) {
  const [pending, setPending] = React.useState<PendingFile[]>([])
  const [backendId, setBackendId] = React.useState("")
  const [dragging, setDragging] = React.useState(false)
  const inputRef = React.useRef<HTMLInputElement>(null)
  const dragDepth = React.useRef(0)

  React.useEffect(() => {
    if (open) {
      setPending([])
      setBackendId("")
      setDragging(false)
      dragDepth.current = 0
    }
  }, [open])

  function addFiles(list: FileList | File[]) {
    const limit = uploadMaxBytes ?? Number.POSITIVE_INFINITY
    const next = Array.from(list).map<PendingFile>((file) => ({
      key: `${file.name}-${file.size}-${file.lastModified}-${Math.random()}`,
      file,
      problem:
        file.size === 0
          ? "空文件"
          : file.size > limit
            ? `超过单文件上限 ${formatBytes(limit)}`
            : null,
    }))
    setPending((current) => [...current, ...next])
  }

  const uploadable = pending.filter((item) => !item.problem)
  const totalBytes = uploadable.reduce((sum, item) => sum + item.file.size, 0)

  function handleStart() {
    if (uploadable.length === 0) {
      return
    }
    onStart(
      uploadable.map((item) => item.file),
      backendId,
    )
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>上传文件</DialogTitle>
          <DialogDescription>
            每个文件上传后得到一条固定直链。大文件自动分片上传，关闭弹窗不影响进行中的上传。
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-4">
          <div
            role="button"
            tabIndex={0}
            aria-label="拖放文件到这里，或点击选择文件"
            onClick={() => inputRef.current?.click()}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault()
                inputRef.current?.click()
              }
            }}
            onDragEnter={(event) => {
              event.preventDefault()
              dragDepth.current += 1
              setDragging(true)
            }}
            onDragOver={(event) => {
              event.preventDefault()
              event.dataTransfer.dropEffect = "copy"
            }}
            onDragLeave={() => {
              dragDepth.current = Math.max(0, dragDepth.current - 1)
              if (dragDepth.current === 0) {
                setDragging(false)
              }
            }}
            onDrop={(event) => {
              event.preventDefault()
              dragDepth.current = 0
              setDragging(false)
              if (event.dataTransfer.files.length > 0) {
                addFiles(event.dataTransfer.files)
              }
            }}
            className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-10 text-center transition outline-none focus-visible:ring-2 focus-visible:ring-sky-400 ${
              dragging
                ? "border-sky-500 bg-sky-500/10"
                : "border-slate-900/20 hover:border-slate-900/40 hover:bg-slate-900/5 dark:border-white/20 dark:hover:border-white/40 dark:hover:bg-white/5"
            }`}
          >
            <FileUp className="size-8 text-slate-500 dark:text-slate-400" />
            <p className="text-sm font-medium">
              {dragging ? "松开以添加文件" : "拖放文件到这里，或点击选择"}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              可一次添加多个文件
              {uploadMaxBytes ? `，单个文件不超过 ${formatBytes(uploadMaxBytes)}` : ""}
            </p>
            <input
              ref={inputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(event) => {
                if (event.target.files) {
                  addFiles(event.target.files)
                }
                event.target.value = ""
              }}
            />
          </div>

          {pending.length > 0 ? (
            <ul className="divide-y divide-slate-900/10 rounded-xl border border-slate-900/10 dark:divide-white/10 dark:border-white/10">
              {pending.map((item) => (
                <li key={item.key} className="flex items-center justify-between gap-3 px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm">{item.file.name}</p>
                    <p
                      className={`text-xs ${
                        item.problem
                          ? "text-rose-600 dark:text-rose-300"
                          : "text-slate-500 dark:text-slate-400"
                      }`}
                    >
                      {formatBytes(item.file.size)}
                      {item.problem ? ` · ${item.problem}，不会上传` : ""}
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    title="移除"
                    aria-label={`移除 ${item.file.name}`}
                    onClick={() =>
                      setPending((current) => current.filter((entry) => entry.key !== item.key))
                    }
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </li>
              ))}
            </ul>
          ) : null}

          <label className="block space-y-1 text-sm">
            <span className="text-slate-700 dark:text-slate-300">写入存储</span>
            <select
              className={SELECT_CLASS}
              value={backendId}
              onChange={(event) => setBackendId(event.target.value)}
            >
              <option value="">
                {defaultBackendName ? `项目默认（${defaultBackendName}）` : "项目默认"}
              </option>
              {backends.map((backend) => (
                <option key={backend.id} value={backend.id}>
                  {backend.name}
                </option>
              ))}
            </select>
          </label>
        </DialogBody>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button type="button" onClick={handleStart} disabled={uploadable.length === 0}>
            <Upload className="size-4" />
            {uploadable.length > 0
              ? `开始上传（${uploadable.length} 个，${formatBytes(totalBytes)}）`
              : "开始上传"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
