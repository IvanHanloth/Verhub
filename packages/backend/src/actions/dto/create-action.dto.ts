import { IsObject, IsOptional, IsString, MaxLength } from "class-validator"

export class CreateActionDto {
  @IsString()
  @MaxLength(64)
  project_key!: string

  @IsString()
  @MaxLength(128)
  name!: string

  @IsString()
  @MaxLength(512)
  description!: string

  @IsOptional()
  @IsObject()
  custom_data?: Record<string, unknown>
}
