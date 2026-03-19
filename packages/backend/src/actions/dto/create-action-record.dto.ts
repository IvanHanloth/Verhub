import { IsObject, IsOptional, IsString, MaxLength } from "class-validator"

export class CreateActionRecordDto {
  @IsString()
  @MaxLength(64)
  action_id!: string

  @IsOptional()
  @IsObject()
  custom_data?: Record<string, unknown>
}
