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
import { AdminCard, AdminItemCard } from "@/components/admin/admin-card"
import { AdminPageHeader } from "@/components/admin/admin-page-header"
import { ProjectApiOverview } from "@/components/admin/project-api-overview"
import { ProjectSelectorCard } from "@/components/admin/project-selector-card"
import { useSharedProjectSelection } from "@/hooks/use-shared-project-selection"
import {
  createAction,
  deleteAction,
  listActionRecords,
  listActions,
  updateAction,
  type ActionItem,
  type ActionRecordItem,
} from "@/lib/actions-api"
import { listProjects, type ProjectItem } from "@/lib/projects-api"
import { getSessionToken } from "@/lib/auth-session"

const PAGE_SIZE = 10

type EditFormState = {
  id: string
  name: string
  description: string
  customData: string
}

export function ActionsDashboard() {
  const [projects, setProjects] = React.useState<ProjectItem[]>([])
  const { selectedProjectKey, setSelectedProjectKey } = useSharedProjectSelection()
  const [actions, setActions] = React.useState<ActionItem[]>([])
  const [records, setRecords] = React.useState<ActionRecordItem[]>([])
  const [selectedActionId, setSelectedActionId] = React.useState("")

  const [name, setName] = React.useState("")
  const [description, setDescription] = React.useState("")
  const [customData, setCustomData] = React.useState("")

  const [editDialogOpen, setEditDialogOpen] = React.useState(false)
  const [editForm, setEditForm] = React.useState<EditFormState | null>(null)

  const [loading, setLoading] = React.useState(false)
  const [savingEdit, setSavingEdit] = React.useState(false)

  const selectedProject = React.useMemo(
    () => projects.find((project) => project.project_key === selectedProjectKey) ?? null,
    [projects, selectedProjectKey],
  )

  const loadProjects = React.useCallback(async () => {
    const token = getSessionToken()
    if (!token) {
      return
    }

    const response = await listProjects(token, { limit: 100, offset: 0 })
    setProjects(response.data)

    const hasCurrent = response.data.some((project) => project.project_key === selectedProjectKey)
    if (hasCurrent) {
      return
    }

    const firstProject = response.data[0]
    if (firstProject) {
      setSelectedProjectKey(firstProject.project_key)
    }
  }, [selectedProjectKey, setSelectedProjectKey])

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
    void loadProjects().catch((error) => toast.error(getErrorMessage(error)))
  }, [loadProjects])

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

  async function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const project = projects.find((item) => item.project_key === selectedProjectKey)
    if (!project) {
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
        project_key: project.project_key,
        name: name.trim(),
        description: description.trim(),
        custom_data: customDataObject,
      })

      toast.success("行为已创建")
      setName("")
      setDescription("")
      setCustomData("")
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
    const confirmed = window.confirm("确认删除此行为吗？")
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
    toast.success("已复制配置到创建表单")
  }

  return (
    <section className="space-y-5">
      <AdminPageHeader
        title="行为事件管理"
        description="维护行为定义并查看最新上报记录。"
        badge="Verhub Actions"
      />

      <section className="grid gap-6 lg:grid-cols-[1.1fr_1.9fr]">
        <div className="space-y-6">
          <ProjectSelectorCard
            selectId="actions-project-select"
            selectedProjectKey={selectedProjectKey}
            projects={projects}
            ringClassName="ring-cyan-300"
            onChange={setSelectedProjectKey}
          />

          <ProjectApiOverview
            title="接口示例 · 行为"
            projectKey={selectedProject?.project_key}
            groups={[
              {
                label: "公开接口",
                endpoints: [
                  {
                    method: "POST",
                    path: "/api/v1/public/{projectKey}/actions",
                    description: "客户端上报行为记录",
                    auth: { tokenRequired: false },
                    requestBody: {
                      name: "open_settings",
                      custom_data: { platform: "web", from: "header" },
                    },
                  },
                ],
              },
              {
                label: "管理接口",
                endpoints: [
                  {
                    method: "GET",
                    path: "/api/v1/admin/projects/{projectKey}/actions",
                    description: "查询行为定义",
                    auth: { tokenRequired: true },
                  },
                  {
                    method: "POST",
                    path: "/api/v1/admin/projects/actions",
                    description: "创建行为定义",
                    auth: { tokenRequired: true },
                    requestBody: {
                      project_key: "{projectKey}",
                      name: "open_settings",
                      description: "用户打开设置页",
                      custom_data: { module: "settings" },
                    },
                  },
                  {
                    method: "PATCH",
                    path: "/api/v1/admin/actions/{action_id}",
                    description: "编辑行为定义",
                    auth: { tokenRequired: true },
                    requestBody: {
                      name: "open_settings_v2",
                      description: "用户打开设置页（新版）",
                      custom_data: { module: "settings-v2" },
                    },
                  },
                ],
              },
            ]}
          />
        </div>

        <AdminCard>
          <div className="mb-4 space-y-1">
            <h2 className="text-lg font-semibold">新增行为</h2>
            <p className="text-sm text-slate-700 dark:text-slate-300">
              名称与描述为必填项，custom_data 需为 JSON 对象。
            </p>
          </div>
          <form className="grid gap-3" onSubmit={handleCreate}>
            <label className="space-y-1 text-sm">
              <span className="text-slate-300">行为名称</span>
              <input
                required
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="w-full rounded-xl border border-white/20 bg-white/5 px-3 py-2 text-sm"
                placeholder="例如：打开设置页"
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-slate-300">行为描述</span>
              <input
                required
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                className="w-full rounded-xl border border-white/20 bg-white/5 px-3 py-2 text-sm"
                placeholder="说明该行为会记录什么"
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-slate-300">扩展数据 JSON</span>
              <textarea
                value={customData}
                onChange={(event) => setCustomData(event.target.value)}
                className="w-full rounded-xl border border-white/20 bg-white/5 px-3 py-2 text-xs"
                rows={4}
                placeholder='例如：{"channel":"release"}'
              />
            </label>
            <div className="flex gap-2">
              <Button type="submit" disabled={loading}>
                <Plus className="size-4" />
                新增行为
              </Button>
            </div>
          </form>
        </AdminCard>
      </section>

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
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => copyFromAction(action)}
                      >
                        <Copy className="size-4" />
                        复制配置
                      </Button>
                      <Button type="button" variant="outline" onClick={() => startEdit(action)}>
                        <PencilLine className="size-4" />
                        编辑
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => void handleDelete(action.action_id)}
                      >
                        <Trash2 className="size-4" />
                        删除
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setSelectedActionId(action.action_id)}
                      >
                        <History className="size-4" />
                        查看记录
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
              className="border-white/10 bg-white/5 p-3 text-xs"
            >
              <p>记录ID：{record.action_record_id}</p>
              <p className="mt-1">时间：{new Date(record.created_time * 1000).toLocaleString()}</p>
              {record.custom_data ? (
                <pre className="mt-2 overflow-auto rounded bg-black/30 p-2">
                  {JSON.stringify(record.custom_data, null, 2)}
                </pre>
              ) : null}
            </AdminItemCard>
          ))}
          {!records.length ? <p className="text-sm text-slate-400">暂无行为记录</p> : null}
        </div>
      </AdminCard>

      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-xl">
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
