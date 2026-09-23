import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from "class-validator"

/** 分片大小的取值范围（KB）。 */
export const MIN_PART_SIZE_KB = 64
export const MAX_PART_SIZE_KB = 1024 * 1024

const URL_OPTIONS = { require_protocol: true, protocols: ["http", "https"], require_tld: false }

/** 新建 WebDAV 存储后端。本机存储为内置项，不可新建。 */
export class CreateStorageBackendDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  name!: string

  @IsIn(["webdav"])
  kind!: "webdav"

  /** WebDAV 根地址，对象路径拼接在其后。 */
  @IsUrl(URL_OPTIONS)
  @MaxLength(512)
  base_url!: string

  @IsOptional()
  @IsString()
  @MaxLength(256)
  username?: string

  /** 只写不读，回读只给指纹。 */
  @IsOptional()
  @IsString()
  @MaxLength(512)
  password?: string

  /** 分片大小（KB）。大于该值的文件按分片写入，单次请求体不超过它；不传或 null 表示整文件写入。 */
  @IsOptional()
  @ValidateIf((_object, value) => value !== null)
  @IsInt()
  @Min(MIN_PART_SIZE_KB)
  @Max(MAX_PART_SIZE_KB)
  part_size_kb?: number | null

  @IsOptional()
  @IsBoolean()
  is_default?: boolean
}

/** 部分更新。password 传空字符串表示清除；is_default 只接受 true。 */
export class UpdateStorageBackendDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  name?: string

  @IsOptional()
  @IsUrl(URL_OPTIONS)
  @MaxLength(512)
  base_url?: string

  @IsOptional()
  @IsString()
  @MaxLength(256)
  username?: string

  @IsOptional()
  @IsString()
  @MaxLength(512)
  password?: string

  /** null 表示取消分片，之后的文件整文件写入；已有文件不受影响。 */
  @IsOptional()
  @ValidateIf((_object, value) => value !== null)
  @IsInt()
  @Min(MIN_PART_SIZE_KB)
  @Max(MAX_PART_SIZE_KB)
  part_size_kb?: number | null

  @IsOptional()
  @IsIn([true])
  is_default?: true
}
