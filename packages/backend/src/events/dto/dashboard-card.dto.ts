import { IsInt, IsObject, IsOptional, IsString, MaxLength, Min, MinLength } from "class-validator"

/**
 * 看板卡片的入参。
 *
 * `query` 声明成 object 而不是嵌套 EventQueryDto：它要按指标 DSL 完整校验，
 * 而那份校验在 EventsDashboardService 里手动跑（连公式一起验），放在这里只能
 * 验到结构一半。
 */
export class CreateDashboardCardDto {
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  title!: string

  @IsOptional()
  @IsString()
  @MaxLength(512)
  description?: string

  @IsObject()
  query!: Record<string, unknown>

  /** 前端网格布局，后端只存不解析。 */
  @IsOptional()
  @IsObject()
  layout?: Record<string, unknown>

  @IsOptional()
  @IsInt()
  @Min(0)
  sort_order?: number
}

export class UpdateDashboardCardDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  title?: string

  @IsOptional()
  @IsString()
  @MaxLength(512)
  description?: string

  @IsOptional()
  @IsObject()
  query?: Record<string, unknown>

  @IsOptional()
  @IsObject()
  layout?: Record<string, unknown>

  @IsOptional()
  @IsInt()
  @Min(0)
  sort_order?: number
}
