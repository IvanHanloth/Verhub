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
import { useUnsavedChangesGuard } from "@/components/common/unsaved-changes-guard"
import { AdminCard } from "@/components/admin/admin-card"
import { AdminFormDialog } from "@/components/admin/admin-form-dialog"
import { AdminPageHeader } from "@/components/admin/admin-page-header"
import { ClientOriginBadges } from "@/components/common/client-origin-badges"
import {
  DataTable,
  EmptyValue,
  TruncatedCell,
  type DataTableColumn,
} from "@/components/common/data-table"
import { JsonField } from "@/components/common/json-viewer"
import { ApiReferenceDrawer } from "@/components/docs/api-reference-drawer"
import { useAdminProjects } from "@/hooks/use-admin-projects"
import { usePagination } from "@/hooks/use-pagination"
import { formatTimestamp } from "@/lib/format"
import { formatPlatformVersion } from "@/lib/platform"
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
  const handleEditOpenChange = useUnsavedChangesGuard({
    open: editDialogOpen,
    onOpenChange: setEditDialogOpen,
    value: editForm,
  })

  const [loading, setLoading] = React.useState(false)
  const [savingEdit, setSavingEdit] = React.useState(false)
  const [search, setSearch] = React.useState("")

  const actionsPagination = usePagination({ pageSize: PAGE_SIZE })
  const recordsPagination = usePagination({ pageSize: PAGE_SIZE })
  const { setTotal: setActionsTotal, resetOffset: resetActionsOffset } = actionsPagination
  const { setTotal: setRecordsTotal, resetOffset: resetRecordsOffset } = recordsPagination

  const loadActions = React.useCallback(
    async (nextOffset: number) => {
      if (!selectedProjectKey) {
        setActions([])
        setActionsTotal(0)
        return
      }

      const response = await listActions(selectedProjectKey, {
        limit: PAGE_SIZE,
        offset: nextOffset,
        search: search.trim() || undefined,
      })
      setActions(response.data)
      setActionsTotal(response.total)
    },
    [selectedProjectKey, search, setActionsTotal],
  )

  const loadRecords = React.useCallback(
    async (nextOffset: number) => {
      if (!selectedActionId) {
        setRecords([])
        setRecordsTotal(0)
        return
      }

      const response = await listActionRecords(selectedActionId, {
        limit: PAGE_SIZE,
        offset: nextOffset,
      })
      setRecords(response.data)
      setRecordsTotal(response.total)
    },
    [selectedActionId, setRecordsTotal],
  )

  React.useEffect(() => {
    void loadActions(actionsPagination.offset).catch((error) => toast.error(getErrorMessage(error)))
  }, [loadActions, actionsPagination.offset])

  React.useEffect(() => {
    void loadRecords(recordsPagination.offset).catch((error) => toast.error(getErrorMessage(error)))
  }, [loadRecords, recordsPagination.offset])

  // 换了行为定义就从记录第一页看起，否则会停在上一个行为的页码上。
  React.useEffect(() => {
    resetRecordsOffset()
  }, [selectedActionId, resetRecordsOffset])

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
      await loadActions(actionsPagination.offset)
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
      await loadActions(actionsPagination.offset)
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
      await loadActions(actionsPagination.offset)
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

  // 不做 memo：操作按钮闭包了当前页数据，缓存下来会让编辑/删除作用在上一轮的行上。
  const actionColumns: Array<DataTableColumn<ActionItem>> = [
    {
      id: "name",
      header: "名称",
      label: "名称",
      alwaysVisible: true,
      className: "font-medium",
      cell: (action) => (
        <TruncatedCell className="max-w-[16rem]" title={action.name}>
          {action.name}
        </TruncatedCell>
      ),
    },
    {
      id: "description",
      header: "描述",
      label: "描述",
      className: "text-xs text-slate-600 dark:text-slate-300",
      cell: (action) => (
        <TruncatedCell className="max-w-[26rem]" title={action.description}>
          {action.description}
        </TruncatedCell>
      ),
    },
    {
      id: "custom_data",
      header: "扩展数据",
      label: "扩展数据",
      defaultHidden: true,
      className: "text-xs text-slate-500 tabular-nums dark:text-slate-400",
      cell: (action) =>
        action.custom_data ? `${Object.keys(action.custom_data).length} 项` : <EmptyValue />,
    },
    {
      id: "created_time",
      header: "创建时间",
      label: "创建时间",
      className: "whitespace-nowrap text-xs text-slate-600 tabular-nums dark:text-slate-300",
      cell: (action) => formatTimestamp(action.created_time, "—"),
    },
    {
      id: "action_id",
      header: "行为 ID",
      label: "行为 ID",
      defaultHidden: true,
      className: "font-mono text-xs text-slate-500 dark:text-slate-400",
      cell: (action) => action.action_id,
    },
    {
      id: "actions",
      header: "操作",
      label: "操作",
      alwaysVisible: true,
      headerClassName: "text-right",
      className: "text-right",
      cell: (action) => (
        // 图标按钮：名字挂在 aria-label / title 上，读屏与悬停都拿得到。
        <div className="flex justify-end gap-1.5">
          <Button
            type="button"
            size="icon-sm"
            variant="outline"
            title="查看记录"
            aria-label="查看记录"
            onClick={() => setSelectedActionId(action.action_id)}
          >
            <History className="size-4" />
          </Button>
          <Button
            type="button"
            size="icon-sm"
            variant="outline"
            title="复制配置"
            aria-label="复制配置"
            onClick={() => copyFromAction(action)}
          >
            <Copy className="size-4" />
          </Button>
          <Button
            type="button"
            size="icon-sm"
            variant="outline"
            title="编辑"
            aria-label="编辑"
            onClick={() => startEdit(action)}
          >
            <PencilLine className="size-4" />
          </Button>
          <Button
            type="button"
            size="icon-sm"
            variant="destructive"
            title="删除"
            aria-label="删除"
            onClick={() => void handleDelete(action.action_id)}
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      ),
    },
  ]

  const recordColumns: Array<DataTableColumn<ActionRecordItem>> = [
    {
      id: "created_time",
      header: "时间",
      label: "时间",
      className: "whitespace-nowrap text-xs text-slate-600 tabular-nums dark:text-slate-300",
      cell: (record) => formatTimestamp(record.created_time, "—"),
    },
    {
      id: "ip",
      header: "IP",
      label: "来源 IP",
      className: "font-mono text-xs text-slate-600 dark:text-slate-300",
      cell: (record) => record.ip ?? <EmptyValue />,
    },
    {
      id: "location",
      header: "地区",
      label: "来源地区",
      className: "text-xs text-slate-600 dark:text-slate-300",
      cell: (record) => {
        const parts = [record.city, record.region_name, record.country_name ?? record.country_code]
          .map((part) => part?.trim())
          .filter((part): part is string => Boolean(part))
        const unique = parts.filter((part, index) => parts.indexOf(part) === index)
        return unique.length > 0 ? unique.join(" · ") : <EmptyValue />
      },
    },
    {
      id: "platform",
      header: "平台",
      label: "平台",
      className: "whitespace-nowrap text-xs text-slate-600 dark:text-slate-300",
      cell: (record) =>
        formatPlatformVersion(record.platform, record.platform_version) ?? <EmptyValue />,
    },
    {
      id: "user_agent",
      header: "User-Agent",
      label: "User-Agent",
      defaultHidden: true,
      className: "font-mono text-xs text-slate-600 dark:text-slate-300",
      cell: (record) =>
        record.user_agent ? (
          <TruncatedCell className="max-w-[18rem]" title={record.user_agent}>
            {record.user_agent}
          </TruncatedCell>
        ) : (
          <EmptyValue />
        ),
    },
    {
      id: "custom_data",
      header: "扩展数据",
      label: "扩展数据",
      className: "text-xs text-slate-500 tabular-nums dark:text-slate-400",
      cell: (record) =>
        record.custom_data ? `${Object.keys(record.custom_data).length} 项` : <EmptyValue />,
    },
    {
      id: "action_record_id",
      header: "记录 ID",
      label: "记录 ID",
      defaultHidden: true,
      className: "font-mono text-xs text-slate-500 dark:text-slate-400",
      cell: (record) => record.action_record_id,
    },
  ]

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

      <AdminCard className="space-y-4">
        <h3 className="font-medium">行为列表</h3>

        <DataTable
          storageKey="actions"
          columns={actionColumns}
          rows={actions}
          getRowId={(action) => action.action_id}
          emptyMessage="暂无行为数据。"
          // 选中的行为高亮：下面那张记录表跟着它走。
          rowClassName={(action) =>
            action.action_id === selectedActionId ? "bg-sky-500/10" : undefined
          }
          search={{
            value: search,
            onChange: (value) => {
              setSearch(value)
              resetActionsOffset()
            },
            placeholder: "搜索名称 / 描述",
          }}
          pagination={{
            total: actionsPagination.total,
            page: actionsPagination.page,
            totalPages: actionsPagination.totalPages,
            hasPrev: actionsPagination.hasPrev,
            hasNext: actionsPagination.hasNext,
            onPrev: actionsPagination.onPrev,
            onNext: actionsPagination.onNext,
          }}
        />
      </AdminCard>

      <AdminCard className="space-y-4">
        <h3 className="font-medium">行为记录</h3>

        <DataTable
          storageKey="action-records"
          columns={recordColumns}
          rows={records}
          getRowId={(record) => record.action_record_id}
          emptyMessage={selectedActionId ? "该行为暂无上报记录。" : "请先在上方选择一个行为。"}
          renderExpanded={(record) => (
            <div className="space-y-3">
              <ClientOriginBadges origin={record} />
              {/* http 里是整套请求头，默认折叠：需要时才展开逐层看。 */}
              <div className="grid gap-2 sm:grid-cols-2">
                <JsonField label="custom_data" value={record.custom_data} />
                <JsonField label="http" value={record.http} />
              </div>
            </div>
          )}
          pagination={{
            total: recordsPagination.total,
            page: recordsPagination.page,
            totalPages: recordsPagination.totalPages,
            hasPrev: recordsPagination.hasPrev,
            hasNext: recordsPagination.hasNext,
            onPrev: recordsPagination.onPrev,
            onNext: recordsPagination.onNext,
          }}
        />
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
        formValue={{ name, description, customData }}
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

      <Dialog open={editDialogOpen} onOpenChange={handleEditOpenChange}>
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
            <Button type="button" variant="outline" onClick={() => handleEditOpenChange(false)}>
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
