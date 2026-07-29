import { PRIVACY_POLICY_CONTENT, PRIVACY_POLICY_UPDATED_AT } from "./builtin/privacy-policy"
import { SDK_COMPLIANCE_CONTENT, SDK_COMPLIANCE_UPDATED_AT } from "./builtin/sdk-compliance"
import { resolvePlaceholders, type TermsPlaceholder } from "./placeholders"

/**
 * 条款文档登记表。
 *
 * 文档是一组同构的东西（各有内置正文、各可被运营者替换），所以按 slug 建表而不是
 * 给每份文档在配置行上开一组列 —— 加第三份条款时只需在这里追加一条，库结构、
 * 接口与管理端都不用动。
 *
 * 顺序即前台与管理端的展示顺序：《隐私政策》是总纲，《SDK 合规性文档》是它逐项
 * 展开的附件，所以政策在前、公示在后。
 */
export const TERMS_DOCUMENT_SLUGS = ["privacy-policy", "sdk-compliance"] as const

export type TermsDocumentSlug = (typeof TERMS_DOCUMENT_SLUGS)[number]

export type BuiltinTermsDocument = {
  slug: TermsDocumentSlug
  title: string
  /** 一句话说明，用于管理端选项卡与前台互链，不进正文。 */
  summary: string
  content: string
  updatedAt: number
  /** 内置正文里待填的占位符，按出现顺序。管理端据此渲染填空表单。 */
  placeholders: TermsPlaceholder[]
}

function builtin(document: Omit<BuiltinTermsDocument, "placeholders">): BuiltinTermsDocument {
  return { ...document, placeholders: resolvePlaceholders(document.content) }
}

export const BUILTIN_TERMS_DOCUMENTS: Record<TermsDocumentSlug, BuiltinTermsDocument> = {
  "privacy-policy": builtin({
    slug: "privacy-policy",
    title: "隐私政策",
    summary: "说明数据如何去标识化、以何种口径统计、留存多久，以及如何行使权利。",
    content: PRIVACY_POLICY_CONTENT,
    updatedAt: PRIVACY_POLICY_UPDATED_AT,
  }),
  "sdk-compliance": builtin({
    slug: "sdk-compliance",
    title: "SDK 合规性文档",
    summary: "逐项公示 SDK 收集哪些字段、申请哪些权限、如何关闭，以及接入方的合规义务。",
    content: SDK_COMPLIANCE_CONTENT,
    updatedAt: SDK_COMPLIANCE_UPDATED_AT,
  }),
}

export function isTermsDocumentSlug(value: string): value is TermsDocumentSlug {
  return (TERMS_DOCUMENT_SLUGS as readonly string[]).includes(value)
}
