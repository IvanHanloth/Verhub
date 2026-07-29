import { Body, Controller, Delete, Get, HttpCode, Param, Put, UseGuards } from "@nestjs/common"

import { JwtAdminGuard } from "../auth/guards/jwt-admin.guard"
import { UpdateTermsDocumentDto } from "./dto/update-terms-document.dto"
import { TermsService } from "./terms.service"

/**
 * 实例级条款设置。同 GitHub App 配置，只收管理员 JWT：条款是站点对外的
 * 法律声明，改动影响每一个访问者，不适合按资源划分的 API Key scope 委托出去。
 */
@Controller("admin/terms/documents")
@UseGuards(JwtAdminGuard)
export class TermsController {
  constructor(private readonly termsService: TermsService) {}

  @Get()
  async listDocuments() {
    return { data: await this.termsService.listConfigViews() }
  }

  @Get(":slug")
  async getDocument(@Param("slug") slug: string) {
    return this.termsService.getConfigView(slug)
  }

  @Put(":slug")
  @HttpCode(200)
  async updateDocument(@Param("slug") slug: string, @Body() dto: UpdateTermsDocumentDto) {
    return this.termsService.updateDocument(slug, dto)
  }

  @Delete(":slug")
  async resetDocument(@Param("slug") slug: string) {
    return this.termsService.resetDocument(slug)
  }
}
