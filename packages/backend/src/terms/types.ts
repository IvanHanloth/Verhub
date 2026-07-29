import type { TermsPlaceholder } from "./placeholders"
import type { TermsDocumentSlug } from "./terms-documents"

/** 生效正文的来源：内置文档还是运营者自定义。 */
export type TermsDocumentSource = "builtin" | "custom"

/**
 * 公开列表项。不含正文：列表只用来渲染文档间的导航，两份长条款的正文一起回传
 * 是纯浪费。
 */
export type TermsDocumentSummaryView = {
  slug: TermsDocumentSlug
  title: string
  summary: string
  source: TermsDocumentSource
  updated_at: number
}

/** 公开视图：前台展示页只需要正文与最后更新时间，不暴露编辑态。 */
export type TermsDocumentView = TermsDocumentSummaryView & {
  content: string
}

/**
 * 管理端视图。同时给出生效正文、库里的自定义草稿与内置原文：
 * 关掉自定义开关后草稿仍留在库里，重新打开还能接着改，而「恢复内置正文」
 * 按钮需要内置原文作为初值。
 */
export type TermsDocumentConfigView = {
  slug: TermsDocumentSlug
  title: string
  summary: string
  custom: boolean
  /** 当前对外生效的正文。custom 为 false 时即内置正文。 */
  content: string
  /** 库里存的自定义正文，从未编辑过为 null。 */
  custom_content: string | null
  custom_updated_at: number | null
  builtin_content: string
  builtin_updated_at: number
  updated_at: number | null
  /**
   * 内置正文里待填的占位符。替换在管理端完成、库里只存成品，所以公开视图不带
   * 这个字段。
   */
  placeholders: TermsPlaceholder[]
}
