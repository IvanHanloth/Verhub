import { IsString, MaxLength } from "class-validator"

import { CreateVersionDto } from "./create-version.dto"

export class CreateProjectVersionDto extends CreateVersionDto {
  @IsString()
  @MaxLength(64)
  project_key!: string
}
