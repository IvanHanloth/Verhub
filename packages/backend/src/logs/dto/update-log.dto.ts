import { IsBoolean, IsOptional } from "class-validator"

/**
 * 后台更新日志。
 *
 * 只开放 is_hidden：日志是排障凭证，内容、级别与来源改了就不再是当时发生的事，
 * 所以这里刻意不做成 `PartialType(CreateLogDto)`——能改的只有「要不要在列表里看到它」。
 */
export class UpdateLogDto {
  @IsOptional()
  @IsBoolean()
  is_hidden?: boolean
}
