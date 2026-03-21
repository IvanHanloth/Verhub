"use client"

import * as React from "react"
import { Copy, PencilLine, Plus, Save, Trash2, History } from "lucide-react"

import { Button } from "@workspace/ui/components/button"

import { ApiError } from "@/lib/api-client"
import { AdminCard, AdminItemCard } from "@/components/admin/admin-card"
import { ManagementListItem } from "@/components/admin/management-list-item"
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

function toMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return error.message
  }

  if (error instanceof Error) {
    return error.message
  }

  return "请求失败，请稍后重试。"
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
  const [editingActionId, setEditingActionId] = React.useState<string | null>(null)

  const [loading, setLoading] = React.useState(false)
  const [message, setMessage] = React.useState<string | null>(null)

  const selectedProject = React.useMemo(
    () => projects.find((project) => project.id === selectedProjectKey) ?? null,
    [projects, selectedProjectKey],
  )

  const loadProjects = React.useCallback(async () => {
    const token = getSessionToken()
    if (!token) {
      return
    }

    const response = await listProjects(token, { limit: 100, offset: 0 })
    setProjects(response.data)
    const hasCurrent = response.data.some((project) => project.id === selectedProjectKey)
    if (hasCurrent) {
      return
    }

    const firstProject = response.data[0]
    if (firstProject) {
      setSelectedProjectKey(firstProject.id)
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
    void loadProjects().catch((error) => setMessage(toMessage(error)))
  }, [loadProjects])

  React.useEffect(() => {
    void loadActions().catch((error) => setMessage(toMessage(error)))
  }, [loadActions])

  React.useEffect(() => {
    void loadRecords().catch((error) => setMessage(toMessage(error)))
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

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setMessage(null)

    const project = projects.find((item) => item.id === selectedProjectKey)
    if (!project) {
      setMessage("请先选择项目")
      return
    }

    let customDataObject: Record<string, unknown> | undefined
    const customDataText = customData.trim()
    if (customDataText) {
      const parsed = JSON.parse(customDataText) as unknown
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        setMessage("自定义数据必须是 JSON 对象")
        return
      }
      customDataObject = parsed as Record<string, unknown>
    }

    setLoading(true)
    try {
      if (editingActionId) {
        await updateAction(editingActionId, {
          name: name.trim(),
          description: description.trim(),
          custom_data: customDataObject,
        })
        setMessage("行为已更新")
      } else {
        await createAction({
          project_key: project.project_key,
          name: name.trim(),
          description: description.trim(),
          custom_data: customDataObject,
        })
        setMessage("行为已创建")
      }

      setEditingActionId(null)
      setName("")
      setDescription("")
      setCustomData("")
      await loadActions()
    } catch (error) {
      setMessage(toMessage(error))
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete(actionId: string) {
    const confirmed = window.confirm("确认删除此行为吗？")
    if (!confirmed) {
      return
    }

    try {
      await deleteAction(actionId)
      setMessage("行为已删除")
      await loadActions()
    } catch (error) {
      setMessage(toMessage(error))
    }
  }

  function startEdit(action: ActionItem) {
    setEditingActionId(action.action_id)
    setName(action.name)
    setDescription(action.description)
    setCustomData(action.custom_data ? JSON.stringify(action.custom_data, null, 2) : "")
  }

  function copyFromAction(action: ActionItem) {
    setEditingActionId(null)
    setName(action.name)
    setDescription(action.description)
    setCustomData(action.custom_data ? JSON.stringify(action.custom_data, null, 2) : "")
    setMessage("已复制配置到表单，可直接创建新行为。")
  }

  return (
    <section className="space-y-5">
      <AdminPageHeader
        title="行为事件管理"
        description="维护项目行为定义并查看最近上报记录，用于埋点治理与事件追踪。"
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
            title="API Demo · 行为"
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
                    },
                  },
                ],
              },
            ]}
          />
        </div>

        <AdminCard>
          <div className="mb-4 space-y-1">
            <h2 className="text-lg font-semibold">{editingActionId ? "编辑行为" : "新增行为"}</h2>
            <p className="text-sm text-slate-700 dark:text-slate-300">
              表单字段与后端 DTO 对齐，custom_data 需为 JSON 对象。
            </p>
          </div>
          <form className="grid gap-3" onSubmit={handleSubmit}>
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
                {editingActionId ? <Save className="size-4" /> : <Plus className="size-4" />}
                {editingActionId ? "保存编辑" : "新增行为"}
              </Button>
              {editingActionId ? (
                <Button
                  type="button"
                  variant="outline"
                  className="border-white/20 bg-white/5"
                  onClick={() => {
                    setEditingActionId(null)
                    setName("")
                    setDescription("")
                    setCustomData("")
                  }}
                >
                  取消编辑
                </Button>
              ) : null}
            </div>
          </form>
        </AdminCard>
      </section>

      <AdminCard>
        <h3 className="mb-3 font-medium">行为列表</h3>
        <div className="space-y-3">
          {actions.map((action) => (
            <ManagementListItem
              key={action.action_id}
              className="border-white/10 bg-white/5 text-sm"
              title={action.name}
              subtitle={
                <p className="font-mono text-xs text-slate-700 dark:text-cyan-100/90">
                  ID: {action.action_id}
                </p>
              }
              meta={
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  项目：{action.project_key}
                </p>
              }
              content={
                <p className="mt-1 text-slate-700 dark:text-slate-300">{action.description}</p>
              }
              actions={
                <>
                  <Button type="button" variant="outline" onClick={() => copyFromAction(action)}>
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
                </>
              }
            />
          ))}
          {!actions.length ? <p className="text-sm text-slate-400">暂无行为数据</p> : null}
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

      {message ? <p className="text-sm text-cyan-200">{message}</p> : null}
    </section>
  )
}
