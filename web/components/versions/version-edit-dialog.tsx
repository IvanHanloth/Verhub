import * as React from "react"
import { Loader2, Save } from "lucide-react"

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

import { platformOptions, type VersionFormState } from "./version-form-utils"

interface VersionEditDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  form: VersionFormState
  setForm: React.Dispatch<React.SetStateAction<VersionFormState>>
  saving: boolean
  editingVersionId: string | null
  onSave: () => void
}

export function VersionEditDialog({
  open,
  onOpenChange,
  form,
  setForm,
  saving,
  editingVersionId,
  onSave,
}: VersionEditDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>编辑版本</DialogTitle>
          <DialogDescription>在弹窗中更新版本字段并保存。</DialogDescription>
        </DialogHeader>

        <DialogBody className="max-h-[70vh] overflow-y-auto pr-4">
          <div className="grid gap-3">
            <label className="space-y-1 text-sm">
              <span className="text-slate-700 dark:text-slate-300">版本号</span>
              <input
                type="text"
                value={form.version}
                onChange={(event) => setForm((prev) => ({ ...prev, version: event.target.value }))}
                className="w-full rounded-xl border border-slate-900/20 bg-white/80 px-3 py-2 text-sm dark:border-white/20 dark:bg-white/10"
                maxLength={64}
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-slate-700 dark:text-slate-300">可比较版本号</span>
              <input
                type="text"
                value={form.comparable_version}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, comparable_version: event.target.value }))
                }
                className="w-full rounded-xl border border-slate-900/20 bg-white/80 px-3 py-2 text-sm dark:border-white/20 dark:bg-white/10"
                maxLength={64}
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-slate-700 dark:text-slate-300">版本标题</span>
              <input
                type="text"
                value={form.title}
                onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
                className="w-full rounded-xl border border-slate-900/20 bg-white/80 px-3 py-2 text-sm dark:border-white/20 dark:bg-white/10"
                maxLength={128}
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-slate-700 dark:text-slate-300">下载地址</span>
              <input
                type="url"
                value={form.download_url}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, download_url: event.target.value }))
                }
                className="w-full rounded-xl border border-slate-900/20 bg-white/80 px-3 py-2 text-sm dark:border-white/20 dark:bg-white/10"
                maxLength={2048}
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-slate-700 dark:text-slate-300">下载链接列表 JSON</span>
              <textarea
                value={form.download_links_json}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, download_links_json: event.target.value }))
                }
                rows={4}
                className="w-full rounded-xl border border-slate-900/20 bg-white/80 px-3 py-2 font-mono text-xs dark:border-white/20 dark:bg-white/10"
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-slate-700 dark:text-slate-300">更新内容</span>
              <textarea
                value={form.content}
                onChange={(event) => setForm((prev) => ({ ...prev, content: event.target.value }))}
                rows={4}
                className="w-full rounded-xl border border-slate-900/20 bg-white/80 px-3 py-2 text-sm dark:border-white/20 dark:bg-white/10"
                maxLength={4096}
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-slate-700 dark:text-slate-300">发布时间</span>
              <input
                type="datetime-local"
                value={form.published_at}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, published_at: event.target.value }))
                }
                className="w-full rounded-xl border border-slate-900/20 bg-white/80 px-3 py-2 text-sm dark:border-white/20 dark:bg-white/10"
              />
            </label>
            <div className="rounded-xl border border-slate-900/20 bg-white/80 px-3 py-2 text-sm dark:border-white/20 dark:bg-white/10">
              <p className="mb-2 text-slate-700 dark:text-slate-300">
                平台范围（多选，空表示全部）
              </p>
              <div className="flex flex-wrap gap-3">
                {platformOptions.map((item) => (
                  <label
                    key={item.value}
                    className="inline-flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300"
                  >
                    <input
                      type="checkbox"
                      checked={form.platforms.includes(item.value)}
                      onChange={() =>
                        setForm((prev) => ({
                          ...prev,
                          platforms: prev.platforms.includes(item.value)
                            ? prev.platforms.filter((platform) => platform !== item.value)
                            : [...prev.platforms, item.value],
                        }))
                      }
                      className="size-4"
                    />
                    {item.label}
                  </label>
                ))}
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="inline-flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                <input
                  type="checkbox"
                  checked={form.is_latest}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, is_latest: event.target.checked }))
                  }
                  className="size-4 rounded border-white/30 bg-white/10"
                />
                设为 latest
              </label>
              <label className="inline-flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                <input
                  type="checkbox"
                  checked={form.is_preview}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, is_preview: event.target.checked }))
                  }
                  className="size-4 rounded border-white/30 bg-white/10"
                />
                预发布版本
              </label>
            </div>
            <label className="inline-flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
              <input
                type="checkbox"
                checked={form.is_milestone}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, is_milestone: event.target.checked }))
                }
                className="size-4 rounded border-white/30 bg-white/10"
              />
              标记为里程碑版本
            </label>
            <label className="inline-flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
              <input
                type="checkbox"
                checked={form.is_deprecated}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, is_deprecated: event.target.checked }))
                }
                className="size-4 rounded border-white/30 bg-white/10"
              />
              标记为废弃版本
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-slate-700 dark:text-slate-300">扩展数据 JSON</span>
              <textarea
                value={form.custom_data}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, custom_data: event.target.value }))
                }
                rows={4}
                className="w-full rounded-xl border border-slate-900/20 bg-white/80 px-3 py-2 font-mono text-xs dark:border-white/20 dark:bg-white/10"
              />
            </label>
          </div>
        </DialogBody>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button
            type="button"
            disabled={saving || !editingVersionId}
            onClick={() => void onSave()}
          >
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            保存版本
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
