import { IsString, MaxLength } from "class-validator"

import { CreateAnnouncementDto } from "./create-announcement.dto"

export class CreateProjectAnnouncementDto extends CreateAnnouncementDto {
  @IsString()
  @MaxLength(64)
  project_key!: string
}
