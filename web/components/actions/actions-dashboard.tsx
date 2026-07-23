"use client"

import * as React from "react"
import { Copy, History, PencilLine, Plus, Save, Trash2 } from "lucide-react"
import { toast } from "sonner"

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

import { getErrorMessage } from "@/lib/error-utils"
import { useConfirm } from "@/components/common/confirm-dialog"
import { AdminCard, AdminItemCard } from "@/components/admin/admin-card"
import { AdminFormDialog } from "@/components/admin/admin-form-dialog"
import { AdminPageHeader } from "@/components/admin/admin-page-header"
import { ClientOriginBadges } from "@/components/common/client-origin-badges"
import { JsonField } from "@/components/common/json-viewer"
import { ApiReferenceDrawer } from "@/components/docs/api-reference-drawer"
import { useAdminProjects } from "@/hooks/use-admin-projects"
import {
  createAction,
  deleteAction,
  listActionRecords,
  listActions,
  updateAction,
  type ActionItem,
  type ActionRecordItem,
} from "@/lib/actions-api"

const PAGE_SIZE = 10

type EditFormState = {
  id: string
  name: string
  description: string
  customData: string
}

export function ActionsDashboard() {
  const confirm = useConfirm()
  const { selectedProject, selectedProjectKey } = useAdminProjects()
  const [actions, setActions] = React.useState<ActionItem[]>([])
  const [records, setRecords] = React.useState<ActionRecordItem[]>([])
  const [selectedActionId, setSelectedActionId] = React.useState("")

  const [name, setName] = React.useState("")
  const [description, setDescription] = React.useState("")
  const [customData, setCustomData] = React.useState("")

  const [createDialogOpen, setCreateDialogOpen] = React.useState(false)
  const [editDialogOpen, setEditDialogOpen] = React.useState(false)
  const [editForm, setEditForm] = React.useState<EditFormState | null>(null)

  const [loading, setLoading] = React.useState(false)
  const [savingEdit, setSavingEdit] = React.useState(false)

  const loadActions = React.useCallback(async () => {
    if (!selectedProjectKey) {
      setActions([])
      return
    }

    const response = await listActions(selectedProjectKey, { limit: PAGE_SIZE, offset: 0 })
    setActions(response.data)
  }, [selectedProjectKey])

  const loadRecords = React.useCallback(async () => {
    if (!selectedActionId) {
      setRecords([])
      return
    }

    const response = await listActionRecords(selectedActionId, { limit: PAGE_SIZE, offset: 0 })
    setRecords(response.data)
  }, [selectedActionId])

  React.useEffect(() => {
    void loadActions().catch((error) => toast.error(getErrorMessage(error)))
  }, [loadActions])

  React.useEffect(() => {
    void loadRecords().catch((error) => toast.error(getErrorMessage(error)))
  }, [loadRecords])

  React.useEffect(() => {
    const firstAction = actions[0]
    if (firstAction) {
      setSelectedActionId((prev) => prev || firstAction.action_id)
    } else {
      setSelectedActionId("")
      setRecords([])
    }
  }, [actions])

  function openCreateDialog() {
    setName("")
    setDescription("")
    setCustomData("")
    setCreateDialogOpen(true)
  }

  async function handleCreate() {
    if (!selectedProject) {
      toast.error("请先选择项目")
      return
    }

    let customDataObject: Record<string, unknown> | undefined
    const customDataText = customData.trim()
    if (customDataText) {
      const parsed = JSON.parse(customDataText) as unknown
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        toast.error("自定义数据必须是 JSON 对象")
        return
      }
      customDataObject = parsed as Record<string, unknown>
    }

    setLoading(true)
    try {
      await createAction({
        project_key: selectedProject.project_key,
        name: name.trim(),
        description: description.trim(),
        custom_data: customDataObject,
      })

      toast.success("行为已创建")
      setName("")
      setDescription("")
      setCustomData("")
      setCreateDialogOpen(false)
      await loadActions()
    } catch (error) {
      toast.error(getErrorMessage(error))
    } finally {
      setLoading(false)
    }
  }

  function startEdit(action: ActionItem) {
    setEditForm({
      id: action.action_id,
      name: action.name,
      description: action.description,
      customData: action.custom_data ? JSON.stringify(action.custom_data, null, 2) : "",
    })
    setEditDialogOpen(true)
  }

  async function handleSaveEdit() {
    if (!editForm) {
      return
    }

    let customDataObject: Record<string, unknown> | undefined
    const customDataText = editForm.customData.trim()
    if (customDataText) {
      const parsed = JSON.parse(customDataText) as unknown
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        toast.error("自定义数据必须是 JSON 对象")
        return
      }
      customDataObject = parsed as Record<string, unknown>
    }

    setSavingEdit(true)
    try {
      await updateAction(editForm.id, {
        name: editForm.name.trim(),
        description: editForm.description.trim(),
        custom_data: customDataObject,
      })
      toast.success("行为已更新")
      setEditDialogOpen(false)
      setEditForm(null)
      await loadActions()
    } catch (error) {
      toast.error(getErrorMessage(error))
    } finally {
      setSavingEdit(false)
    }
  }

  async function handleDelete(actionId: string) {
    const confirmed = await confirm({
      title: "删除行为",
      description: "确认删除此行为吗？相关记录将不再归入该行为。",
      confirmLabel: "删除",
      destructive: true,
    })
    if (!confirmed) {
      return
    }

    try {
      await deleteAction(actionId)
      toast.success("行为已删除")
      await loadActions()
    } catch (error) {
      toast.error(getErrorMessage(error))
    }
  }

  function copyFromAction(action: ActionItem) {
    setName(action.name)
    setDescription(action.description)
    setCustomData(action.custom_data ? JSON.stringify(action.custom_data, null, 2) : "")
    setCreateDialogOpen(true)
    toast.success("已复制配置到创建表单")
  }

  return (
    <section className="space-y-5">
      <AdminPageHeader
        title="行为事件管理"
        description="维护行为定义并查看最新上报记录。"
        badge="Verhub Actions"
        actions={
          <>
            <ApiReferenceDrawer
              tag="Actions"
              title="行为埋点接口文档"
              projectKey={selectedProject?.project_key}
            />
            <Button type="button" disabled={!selectedProjectKey} onClick={openCreateDialog}>
              <Plus className="size-4" />
              新增行为
            </Button>
          </>
        }
      />

      <AdminCard>
        <h3 className="mb-3 font-medium">行为列表</h3>
        <div className="overflow-x-auto rounded-2xl border border-white/10 bg-white/5">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 text-left text-slate-300">
                <th className="px-3 py-2 font-medium">行为 ID</th>
                <th className="px-3 py-2 font-medium">名称</th>
                <th className="px-3 py-2 font-medium">描述</th>
                <th className="px-3 py-2 font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {actions.map((action) => (
                <tr key={action.action_id} className="border-b border-white/5 align-top">
                  <td className="px-3 py-2 font-mono text-xs text-slate-200">
                    ID: {action.action_id}
                  </td>
                  <td className="px-3 py-2 text-slate-200">{action.name}</td>
                  <td className="px-3 py-2 text-slate-300">{action.description}</td>
                  <td className="px-3 py-2">
                    {/* 图标按钮：名字挂在 aria-label / title 上，读屏与悬停都拿得到。 */}
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="icon"
                        variant="outline"
                        title="复制配置"
                        aria-label="复制配置"
                        onClick={() => copyFromAction(action)}
                      >
                        <Copy className="size-4" />
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="outline"
                        title="编辑"
                        aria-label="编辑"
                        onClick={() => startEdit(action)}
                      >
                        <PencilLine className="size-4" />
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="outline"
                        title="删除"
                        aria-label="删除"
                        onClick={() => void handleDelete(action.action_id)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="outline"
                        title="查看记录"
                        aria-label="查看记录"
                        onClick={() => setSelectedActionId(action.action_id)}
                      >
                        <History className="size-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!actions.length ? <p className="p-3 text-sm text-slate-400">暂无行为数据</p> : null}
        </div>
      </AdminCard>

      <AdminCard>
        <h3 className="mb-3 font-medium">行为记录（最新 {PAGE_SIZE} 条）</h3>
        <div className="space-y-2">
          {records.map((record) => (
            <AdminItemCard
              key={record.action_record_id}
              as="div"
              className="space-y-2 border-white/10 bg-white/5 p-3 text-xs"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-mono">{record.action_record_id}</span>
                <span className="text-slate-500 tabular-nums dark:text-slate-400">
                  {new Date(record.created_time * 1000).toLocaleString()}
                </span>
              </div>

              <ClientOriginBadges origin={record} />

              {/* http 里是整套请求头，默认折叠：需要时才展开逐层看。 */}
              <div className="grid gap-2 sm:grid-cols-2">
                <JsonField label="custom_data" value={record.custom_data} />
                <JsonField label="http" value={record.http} />
              </div>
            </AdminItemCard>
          ))}
          {!records.length ? <p className="text-sm text-slate-400">暂无行为记录</p> : null}
        </div>
      </AdminCard>

      <AdminFormDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        title="新增行为"
        description="名称与描述为必填项，扩展数据需为 JSON 对象。"
        submitLabel="创建行为"
        submitIcon={<Plus className="size-4" />}
        submitting={loading}
        onSubmit={() => void handleCreate()}
        className="sm:max-w-3xl"
      >
        <label className="space-y-1 text-sm">
          <span className="text-slate-700 dark:text-slate-300">行为名称</span>
          <input
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="w-full rounded-xl border border-slate-900/20 bg-white/80 px-3 py-2 text-sm dark:border-white/20 dark:bg-white/10"
            placeholder="例如：打开设置页"
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-slate-700 dark:text-slate-300">行为描述</span>
          <input
            required
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            className="w-full rounded-xl border border-slate-900/20 bg-white/80 px-3 py-2 text-sm dark:border-white/20 dark:bg-white/10"
            placeholder="说明该行为会记录什么"
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-slate-700 dark:text-slate-300">扩展数据 JSON</span>
          <textarea
            value={customData}
            onChange={(event) => setCustomData(event.target.value)}
            className="w-full rounded-xl border border-slate-900/20 bg-white/80 px-3 py-2 font-mono text-xs dark:border-white/20 dark:bg-white/10"
            rows={4}
            placeholder='例如：{"channel":"release"}'
          />
        </label>
      </AdminFormDialog>

      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>编辑行为</DialogTitle>
            <DialogDescription>修改行为名称、描述与扩展数据。</DialogDescription>
          </DialogHeader>

          <DialogBody>
            {editForm ? (
              <div className="grid gap-3">
                <label className="space-y-1 text-sm">
                  <span className="text-slate-700 dark:text-slate-300">行为名称</span>
                  <input
                    required
                    value={editForm.name}
                    onChange={(event) =>
                      setEditForm((prev) => (prev ? { ...prev, name: event.target.value } : prev))
                    }
                    className="w-full rounded-xl border border-slate-900/20 bg-white/80 px-3 py-2 text-sm dark:border-white/20 dark:bg-white/10"
                  />
                </label>
                <label className="space-y-1 text-sm">
                  <span className="text-slate-700 dark:text-slate-300">行为描述</span>
                  <input
                    required
                    value={editForm.description}
                    onChange={(event) =>
                      setEditForm((prev) =>
                        prev ? { ...prev, description: event.target.value } : prev,
                      )
                    }
                    className="w-full rounded-xl border border-slate-900/20 bg-white/80 px-3 py-2 text-sm dark:border-white/20 dark:bg-white/10"
                  />
                </label>
                <label className="space-y-1 text-sm">
                  <span className="text-slate-700 dark:text-slate-300">扩展数据 JSON</span>
                  <textarea
                    value={editForm.customData}
                    onChange={(event) =>
                      setEditForm((prev) =>
                        prev ? { ...prev, customData: event.target.value } : prev,
                      )
                    }
                    rows={4}
                    className="w-full rounded-xl border border-slate-900/20 bg-white/80 px-3 py-2 text-xs dark:border-white/20 dark:bg-white/10"
                  />
                </label>
              </div>
            ) : null}
          </DialogBody>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setEditDialogOpen(false)}>
              取消
            </Button>
            <Button
              type="button"
              disabled={savingEdit || !editForm}
              onClick={() => void handleSaveEdit()}
            >
              <Save className="size-4" />
              保存编辑
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}
