import * as React from "react"
import { Save } from "lucide-react"

import { AdminFormDialog } from "@/components/admin/admin-form-dialog"
import { validateComparableVersion } from "@/lib/comparable-version"

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
    >
      <VersionFormFields
        form={form}
        setForm={setForm}
        comparableVersionError={validateComparableVersion(form.comparable_version)}
      />
    </AdminFormDialog>
  )
}
