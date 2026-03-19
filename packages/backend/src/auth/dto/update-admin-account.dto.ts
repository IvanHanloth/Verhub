import { IsString, MaxLength, MinLength } from "class-validator"

export class UpdateAdminAccountDto {
  @IsString()
  @MinLength(6)
  @MaxLength(128)
  current_password!: string

  @IsString()
  @MaxLength(64)
  username!: string
}
