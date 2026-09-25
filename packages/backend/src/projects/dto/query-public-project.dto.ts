import { IsOptional, IsString } from "class-validator"

import { NormalizeLocale } from "../../common/locale"

/** 公开项目详情的查询参数。 */
export class QueryPublicProjectDto {
  /**
   * 语言偏好。命中项目注册的语言（主标签或同义标签，大小写不敏感）且该语言的译文
   * 填了对应字段时，`name` / `description` 返回译文，`locale` 字段标出实际语言。
   * 没命中或译文留空则回落项目自身的值，`locale` 为 null。
   */
  @IsOptional()
  @NormalizeLocale()
  @IsString()
  locale?: string
}
