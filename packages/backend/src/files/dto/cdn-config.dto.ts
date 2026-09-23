import { IsBoolean, IsOptional, IsString, MaxLength } from "class-validator"

/** 部分更新：只动传了的字段。access_key_secret 传空字符串表示清除。 */
export class UpdateCdnConfigDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean

  @IsOptional()
  @IsString()
  @MaxLength(128)
  access_key_id?: string

  /** 只写不读，回读只给指纹。 */
  @IsOptional()
  @IsString()
  @MaxLength(256)
  access_key_secret?: string
}
