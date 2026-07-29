import { Controller, Get, Param } from "@nestjs/common"

import { TermsService } from "./terms.service"

/**
 * 条款文档的公开读取端点。
 *
 * 不做请求统计：统计以项目为维度，而条款是实例级内容，没有可归属的项目。
 */
@Controller("public/terms")
export class TermsPublicController {
  constructor(private readonly termsService: TermsService) {}

  @Get()
  async listDocuments() {
    return { data: await this.termsService.listDocumentSummaries() }
  }

  @Get(":slug")
  async getDocument(@Param("slug") slug: string) {
    return this.termsService.getDocument(slug)
  }
}
