"use client"

import * as React from "react"

import { Button } from "@workspace/ui/components/button"

import { ApiError } from "@/lib/api-client"
import { AdminCard, AdminItemCard } from "@/components/admin/admin-card"
import { AdminPageHeader } from "@/components/admin/admin-page-header"
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
  const { selectedProjectId, setSelectedProjectId } = useSharedProjectSelection()
  const [actions, setActions] = React.useState<ActionItem[]>([])
  const [records, setRecords] = React.useState<ActionRecordItem[]>([])
  const [selectedActionId, setSelectedActionId] = React.useState("")

  const [name, setName] = React.useState("")
  const [description, setDescription] = React.useState("")
  const [customData, setCustomData] = React.useState("")
  const [editingActionId, setEditingActionId] = React.useState<string | null>(null)

  const [loading, setLoading] = React.useState(false)
  const [message, setMessage] = React.useState<string | null>(null)

  const loadProjects = React.useCallback(async () => {
    const token = getSessionToken()
    if (!token) {
      return
    }

    const response = await listProjects(token, { limit: 100, offset: 0 })
    setProjects(response.data)
    const hasCurrent = response.data.some((project) => project.id === selectedProjectId)
    if (hasCurrent) {
      return
    }

    const firstProject = response.data[0]
    if (firstProject) {
      setSelectedProjectId(firstProject.id)
    }
  }, [selectedProjectId, setSelectedProjectId])

  const loadActions = React.useCallback(async () => {
    if (!selectedProjectId) {
      setActions([])
      return
    }

    const response = await listActions(selectedProjectId, { limit: PAGE_SIZE, offset: 0 })
    setActions(response.data)
  }, [selectedProjectId])

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

    const project = projects.find((item) => item.id === selectedProjectId)
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

  return (
    <section className="space-y-5">
      <AdminPageHeader
        title="行为事件管理"
        description="维护项目行为定义并查看最近上报记录，用于埋点治理与事件追踪。"
        badge="Verhub Actions"
      />

      <AdminCard>
        <label className="text-sm text-slate-300" htmlFor="actions-project-select">
          选择项目
        </label>
        <select
          id="actions-project-select"
          value={selectedProjectId}
          onChange={(event) => setSelectedProjectId(event.target.value)}
          className="mt-2 w-full rounded-xl border border-white/20 bg-white/5 px-3 py-2 text-sm"
        >
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </select>
      </AdminCard>

      <AdminCard>
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
            <span className="text-slate-300">扩展数据 JSON（可选）</span>
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
              {editingActionId ? "保存编辑" : "新增行为"}
            </Button>
            {editingActionId ? (
              <Button
                type="button"
                variant="outline"
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

      <AdminCard>
        <h3 className="mb-3 font-medium">行为列表</h3>
        <div className="space-y-3">
          {actions.map((action) => (
            <AdminItemCard
              key={action.action_id}
              as="div"
              className="border-white/10 bg-white/5 text-sm"
            >
              <p className="font-medium">{action.name}</p>
              <p className="font-mono text-xs text-cyan-100/90">ID: {action.action_id}</p>
              <p className="mt-1 text-slate-300">{action.description}</p>
              <p className="mt-1 text-xs text-slate-400">项目：{action.project_key}</p>
              <div className="mt-2 flex gap-2">
                <Button type="button" variant="outline" onClick={() => startEdit(action)}>
                  编辑
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void handleDelete(action.action_id)}
                >
                  删除
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setSelectedActionId(action.action_id)}
                >
                  查看记录
                </Button>
              </div>
            </AdminItemCard>
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
              <p className="mt-1">时间：{new Date(record.created_time).toLocaleString()}</p>
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
