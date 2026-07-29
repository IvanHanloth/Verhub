import { requestJson } from "@/lib/api-client"

/** 条款文档标识。与后端 TERMS_DOCUMENT_SLUGS 一致。 */
export type TermsDocumentSlug = "privacy-policy" | "sdk-compliance"

/** 生效正文的来源：内置正文还是运营者自定义。 */
export type TermsDocumentSource = "builtin" | "custom"

export type TermsDocumentSummary = {
  slug: TermsDocumentSlug
  title: string
  summary: string
  source: TermsDocumentSource
  updated_at: number
}

export type TermsDocument = TermsDocumentSummary & {
  content: string
}

/** 内置正文里待填的一处占位符，正文中的写法为 {{key}}。 */
export type TermsPlaceholder = {
  key: string
  label: string
  hint: string
  example: string
  /** false 表示留空也允许发布。 */
  required: boolean
}

export type TermsDocumentConfigView = {
  slug: TermsDocumentSlug
  title: string
  summary: string
  /** 关闭时前台展示内置正文，自定义草稿仍留在库里。 */
  custom: boolean
  /** 当前对外生效的正文。 */
  content: string
  custom_content: string | null
  custom_updated_at: number | null
  /** 内置正文原文，用作「恢复内置正文」的初值。 */
  builtin_content: string
  builtin_updated_at: number
  updated_at: number | null
  /** 替换在管理端完成、库里只存成品，所以公开视图没有这个字段。 */
  placeholders: TermsPlaceholder[]
}

export type UpdateTermsDocumentInput = {
  custom?: boolean
  /** 空字符串表示清除草稿。 */
  content?: string
}

export async function listTermsDocumentConfigs(
  token: string,
  signal?: AbortSignal,
): Promise<TermsDocumentConfigView[]> {
  const response = await requestJson<{ data: TermsDocumentConfigView[] }>(
    "/admin/terms/documents",
    {
      token,
      signal,
    },
  )
  return response.data
}

export async function updateTermsDocument(
  token: string,
  slug: TermsDocumentSlug,
  input: UpdateTermsDocumentInput,
): Promise<TermsDocumentConfigView> {
  return requestJson<TermsDocumentConfigView>(`/admin/terms/documents/${slug}`, {
    method: "PUT",
    token,
    body: input,
  })
}

export async function resetTermsDocument(
  token: string,
  slug: TermsDocumentSlug,
): Promise<TermsDocumentConfigView> {
  return requestJson<TermsDocumentConfigView>(`/admin/terms/documents/${slug}`, {
    method: "DELETE",
    token,
  })
}
