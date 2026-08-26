import * as React from "react"
import { Save } from "lucide-react"

import { AdminFormDialog } from "@/components/admin/admin-form-dialog"
import { validateComparableVersion } from "@/lib/comparable-version"

import type { ProjectLocaleItem } from "@/lib/projects-api"

import { VersionFormFields } from "./version-form-fields"
import { type VersionFormState } from "./version-form-utils"

interface VersionEditDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  form: VersionFormState
  setForm: React.Dispatch<React.SetStateAction<VersionFormState>>
  saving: boolean
  editingVersionId: string | null
  onSave: () => void
  /** 项目注册的语言，决定是否显示译文页签。 */
  locales?: ProjectLocaleItem[]
  projectKey?: string | null
  translationEnabled?: boolean
}

export function VersionEditDialog({
  open,
  onOpenChange,
  form,
  setForm,
  saving,
  editingVersionId,
  onSave,
  locales,
  projectKey,
  translationEnabled,
}: VersionEditDialogProps) {
  return (
    <AdminFormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="编辑版本"
      description="在弹窗中更新版本字段并保存。"
      submitLabel="保存版本"
      submitIcon={<Save className="size-4" />}
      submitting={saving}
      submitDisabled={!editingVersionId}
      onSubmit={onSave}
      formValue={form}
    >
      <VersionFormFields
        form={form}
        setForm={setForm}
        comparableVersionError={validateComparableVersion(form.comparable_version)}
        locales={locales}
        projectKey={projectKey}
        translationEnabled={translationEnabled}
      />
    </AdminFormDialog>
  )
}
