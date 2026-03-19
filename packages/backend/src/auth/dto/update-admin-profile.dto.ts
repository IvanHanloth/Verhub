import { IsOptional, IsString, MaxLength, MinLength } from "class-validator"

export class UpdateAdminProfileDto {
  @IsString()
  @MinLength(6)
  @MaxLength(128)
  current_password!: string

  @IsOptional()
  @IsString()
  @MaxLength(64)
  username?: string

  @IsOptional()
  @IsString()
  @MinLength(6)
  @MaxLength(128)
  new_password?: string
}
