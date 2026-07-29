"use client"

import * as React from "react"
import { Link2, Loader2, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@workspace/ui/components/button"

import { getErrorMessage } from "@/lib/error-utils"
import { formatTimestamp } from "@/lib/format"
import { useConfirm } from "@/components/common/confirm-dialog"
import { LoadingLine } from "@/components/common/skeleton"
import { deleteProjectAlias, listProjectAliases, type ProjectAliasItem } from "@/lib/projects-api"

/**
 * 项目别名（改名保留的旧 Project Key）管理。
 *
 * 别名由「改名」自动登记，此处只做展示与删除：删掉后旧 key 立即失效。
 * keyed on projectKey（父级已做）以在切换项目时重新拉取。
 */
export function ProjectAliasesSettings({
  token,
  projectKey,
}: {
  token: string
  projectKey: string | null
}) {
  const confirm = useConfirm()
  const [aliases, setAliases] = React.useState<ProjectAliasItem[]>([])
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [busyAlias, setBusyAlias] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!token || !projectKey) {
      setAliases([])
      return
    }

    const controller = new AbortController()
    setLoading(true)
    setError(null)

    listProjectAliases(token, projectKey, controller.signal)
      .then((result) => setAliases(result.data))
      .catch((loadError: unknown) => {
        if (controller.signal.aborted) {
          return
        }
        setAliases([])
        setError(getErrorMessage(loadError))
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false)
        }
      })

    return () => {
      controller.abort()
    }
  }, [token, projectKey])

  if (!projectKey) {
    return null
  }

  async function handleDelete(alias: string) {
    if (!token || !projectKey) {
      return
    }
    const confirmed = await confirm({
      title: "删除别名",
      description: `删除后旧 Key「${alias}」将不再指向本项目，用它访问会 404。确认继续？`,
      confirmLabel: "删除",
      destructive: true,
    })
    if (!confirmed) {
      return
    }

    setBusyAlias(alias)
    try {
      await deleteProjectAlias(token, projectKey, alias)
      setAliases((prev) => prev.filter((item) => item.alias !== alias))
      toast.success("别名已删除。")
    } catch (deleteError) {
      toast.error(getErrorMessage(deleteError))
    } finally {
      setBusyAlias(null)
    }
  }

  return (
    <section className="space-y-3 rounded-xl border border-slate-900/15 bg-slate-50/60 p-4 dark:border-white/15 dark:bg-white/5">
      <div className="space-y-1">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Link2 className="size-4" />
          项目别名
        </h3>
        <p className="text-xs text-slate-600 dark:text-slate-400">
          修改上方的 Project Key 保存后，旧 Key 会自动登记为别名并继续指向本项目
        </p>
      </div>

      {loading ? <LoadingLine size="sm">正在读取别名...</LoadingLine> : null}

      {error ? <p className="text-xs text-rose-500">{error}</p> : null}

      {!loading && !error && aliases.length === 0 ? (
        <p className="text-xs text-slate-500 dark:text-slate-400">
          暂无别名，改名后会自动出现在这里。
        </p>
      ) : null}

      {aliases.length > 0 ? (
        <ul className="space-y-2">
          {aliases.map((item) => (
            <li
              key={item.alias}
              className="flex items-center justify-between gap-2 rounded-lg border border-slate-900/15 bg-white/70 px-3 py-2 dark:border-white/15 dark:bg-white/10"
            >
              <div className="min-w-0">
                <code className="block truncate text-xs">{item.alias}</code>
                <span className="text-[11px] text-slate-500 dark:text-slate-400">
                  登记于 {formatTimestamp(item.created_at)}
                </span>
              </div>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                disabled={busyAlias === item.alias}
                onClick={() => void handleDelete(item.alias)}
              >
                {busyAlias === item.alias ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Trash2 className="size-4" />
                )}
                删除
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  )
}
