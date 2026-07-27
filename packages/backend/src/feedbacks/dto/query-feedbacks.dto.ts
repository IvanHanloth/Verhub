import { Transform } from "class-transformer"
import { IsBoolean, IsInt, IsOptional, Max, Min } from "class-validator"

export class QueryFeedbacksDto {
  @IsOptional()
  @Transform(({ value }) => Number(value ?? 20))
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20

  @IsOptional()
  @Transform(({ value }) => Number(value ?? 0))
  @IsInt()
  @Min(0)
  offset = 0

  /**
   * 是否把已隐藏的反馈也列出来。查询串里只有字符串，"true" / "1" 都当真，
   * 其余一律为假 —— 默认不返回隐藏内容。
   */
  @IsOptional()
  @Transform(({ value }) => value === true || value === "true" || value === "1")
  @IsBoolean()
  include_hidden = false
}
