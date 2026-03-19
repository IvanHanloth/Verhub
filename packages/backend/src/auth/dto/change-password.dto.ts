import { IsString, MaxLength, MinLength } from "class-validator"

export class ChangePasswordDto {
  @IsString()
  @MinLength(6)
  @MaxLength(128)
  current_password!: string

  @IsString()
  @MinLength(6)
  @MaxLength(128)
  new_password!: string
}
