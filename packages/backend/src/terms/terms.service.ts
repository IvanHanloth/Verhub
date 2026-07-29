import { Injectable, NotFoundException } from "@nestjs/common"

import { PrismaService } from "../database/prisma.service"
import { nowSeconds } from "../common/utils"
import { UpdateTermsDocumentDto } from "./dto/update-terms-document.dto"
import {
  BUILTIN_TERMS_DOCUMENTS,
  TERMS_DOCUMENT_SLUGS,
  isTermsDocumentSlug,
  type BuiltinTermsDocument,
  type TermsDocumentSlug,
} from "./terms-documents"
import type { TermsDocumentConfigView, TermsDocumentSummaryView, TermsDocumentView } from "./types"

type DocumentRecord = {
  slug: string
  custom: boolean
  content: string | null
  contentUpdatedAt: number | null
  updatedAt: number
}

/**
 * 条款文档的读取与维护。
 *
 * 内置正文随时可用，运营者打开开关才让自定义正文生效；草稿始终留在库里，
 * 关掉开关即刻回到内置正文，不必逐字删回原文。整行不存在即表示全部沿用内置。
 */
@Injectable()
export class TermsService {
  constructor(private readonly prisma: PrismaService) {}

  /** 前台展示页读的就是这个：只给生效正文，不暴露草稿与开关。 */
  async getDocument(slug: string): Promise<TermsDocumentView> {
    const builtin = this.requireBuiltin(slug)
    return toDocumentView(builtin, await this.find(builtin.slug))
  }

  /** 文档间导航用，不带正文。 */
  async listDocumentSummaries(): Promise<TermsDocumentSummaryView[]> {
    const records = await this.findAll()
    return TERMS_DOCUMENT_SLUGS.map((slug) =>
      toSummaryView(BUILTIN_TERMS_DOCUMENTS[slug], records.get(slug) ?? null),
    )
  }

  async listConfigViews(): Promise<TermsDocumentConfigView[]> {
    const records = await this.findAll()
    return TERMS_DOCUMENT_SLUGS.map((slug) =>
      toConfigView(BUILTIN_TERMS_DOCUMENTS[slug], records.get(slug) ?? null),
    )
  }

  async getConfigView(slug: string): Promise<TermsDocumentConfigView> {
    const builtin = this.requireBuiltin(slug)
    return toConfigView(builtin, await this.find(builtin.slug))
  }

  async updateDocument(
    slug: string,
    dto: UpdateTermsDocumentDto,
  ): Promise<TermsDocumentConfigView> {
    const builtin = this.requireBuiltin(slug)
    const data: Record<string, unknown> = { updatedAt: nowSeconds() }

    if (dto.custom !== undefined) {
      data.custom = dto.custom
    }

    if (dto.content !== undefined) {
      const content = dto.content.trim()
      data.content = content || null
      // 正文时间戳只跟随正文本身：改开关不该让前台的「最后更新」跳到今天。
      data.contentUpdatedAt = content ? nowSeconds() : null
    }

    const updated = await this.prisma.termsDocument.upsert({
      where: { slug: builtin.slug },
      create: { slug: builtin.slug, ...data },
      update: data,
    })

    return toConfigView(builtin, updated)
  }

  /** 恢复内置正文：关掉开关并丢弃草稿。 */
  async resetDocument(slug: string): Promise<TermsDocumentConfigView> {
    const builtin = this.requireBuiltin(slug)
    const cleared = await this.prisma.termsDocument.upsert({
      where: { slug: builtin.slug },
      create: { slug: builtin.slug },
      update: {
        custom: false,
        content: null,
        contentUpdatedAt: null,
        updatedAt: nowSeconds(),
      },
    })

    return toConfigView(builtin, cleared)
  }

  private requireBuiltin(slug: string): BuiltinTermsDocument {
    if (!isTermsDocumentSlug(slug)) {
      throw new NotFoundException("Terms document not found")
    }
    return BUILTIN_TERMS_DOCUMENTS[slug]
  }

  private find(slug: TermsDocumentSlug): Promise<DocumentRecord | null> {
    return this.prisma.termsDocument.findUnique({ where: { slug } })
  }

  private async findAll(): Promise<Map<string, DocumentRecord>> {
    const records = await this.prisma.termsDocument.findMany({
      where: { slug: { in: [...TERMS_DOCUMENT_SLUGS] } },
    })
    return new Map(records.map((record) => [record.slug, record]))
  }
}

/**
 * 生效正文。开关关着，或打开了却没有草稿，都回落到内置正文 —— 条款页任何时候
 * 都必须有一份可读的文本，不允许出现空白页。
 */
function resolveContent(
  builtin: BuiltinTermsDocument,
  record: DocumentRecord | null,
): { content: string; source: "builtin" | "custom"; updatedAt: number } {
  const custom = record?.custom ? record.content?.trim() : null

  if (!custom) {
    return { content: builtin.content, source: "builtin", updatedAt: builtin.updatedAt }
  }

  return {
    content: custom,
    source: "custom",
    updatedAt: record?.contentUpdatedAt ?? record?.updatedAt ?? builtin.updatedAt,
  }
}

function toSummaryView(
  builtin: BuiltinTermsDocument,
  record: DocumentRecord | null,
): TermsDocumentSummaryView {
  const effective = resolveContent(builtin, record)

  return {
    slug: builtin.slug,
    title: builtin.title,
    summary: builtin.summary,
    source: effective.source,
    updated_at: effective.updatedAt,
  }
}

function toDocumentView(
  builtin: BuiltinTermsDocument,
  record: DocumentRecord | null,
): TermsDocumentView {
  return {
    ...toSummaryView(builtin, record),
    content: resolveContent(builtin, record).content,
  }
}

function toConfigView(
  builtin: BuiltinTermsDocument,
  record: DocumentRecord | null,
): TermsDocumentConfigView {
  return {
    slug: builtin.slug,
    title: builtin.title,
    summary: builtin.summary,
    custom: record?.custom ?? false,
    content: resolveContent(builtin, record).content,
    custom_content: record?.content ?? null,
    custom_updated_at: record?.contentUpdatedAt ?? null,
    builtin_content: builtin.content,
    builtin_updated_at: builtin.updatedAt,
    updated_at: record?.updatedAt ?? null,
    placeholders: builtin.placeholders,
  }
}
