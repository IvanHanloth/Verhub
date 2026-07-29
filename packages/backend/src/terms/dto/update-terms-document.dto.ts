import { IsBoolean, IsOptional, IsString, MaxLength } from "class-validator"

/** 上限按一份长条款给足；正文以 Markdown 存储，渲染在前台展示页。 */
export const MAX_TERMS_DOCUMENT_LENGTH = 65536

/** 部分更新：只动传了的字段。custom 关掉时 content 仍会被保存，作为草稿留着。 */
export class UpdateTermsDocumentDto {
  @IsOptional()
  @IsBoolean()
  custom?: boolean

  /** 自定义正文（Markdown）。传空字符串表示清除草稿。 */
  @IsOptional()
  @IsString()
  @MaxLength(MAX_TERMS_DOCUMENT_LENGTH)
  content?: string
}
