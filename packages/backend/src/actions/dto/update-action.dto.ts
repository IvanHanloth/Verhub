import { IsObject, IsOptional, IsString, MaxLength } from "class-validator"

export class UpdateActionDto {
  @IsOptional()
  @IsString()
  @MaxLength(128)
  name?: string

  @IsOptional()
  @IsString()
  @MaxLength(512)
  description?: string

  @IsOptional()
  @IsObject()
  custom_data?: Record<string, unknown>
}
