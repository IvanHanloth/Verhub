import { IsInt, IsOptional, IsString, MaxLength, Min, MinLength } from "class-validator"

/** 创建分片上传会话。 */
export class CreateUploadDto {
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  filename!: string

  /** 文件总字节数。 */
  @IsInt()
  @Min(1)
  size!: number

  /** 指定写入的存储后端；不传则使用项目或实例默认存储。 */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  storage_backend_id?: string
}
