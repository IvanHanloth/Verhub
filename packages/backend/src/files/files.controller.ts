import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common"
import type { Request } from "express"

import { AdminOrApiKeyGuard } from "../auth/guards/admin-or-api-key.guard"
import { RequireApiScope } from "../auth/guards/api-scope.decorator"
import { QueryFilesDto } from "./dto/query-files.dto"
import { CreateUploadDto } from "./dto/upload.dto"
import { FileIngestService } from "./file-ingest.service"
import { FilesService } from "./files.service"
import { UploadsService } from "./uploads.service"

/** 项目文件库：列表、删除、分片上传。 */
@Controller("admin/projects/:projectKey/files")
@UseGuards(AdminOrApiKeyGuard)
export class FilesController {
  constructor(
    private readonly filesService: FilesService,
    private readonly uploads: UploadsService,
    private readonly ingest: FileIngestService,
  ) {}

  @Get()
  @RequireApiScope("files:read")
  async list(@Param("projectKey") projectKey: string, @Query() query: QueryFilesDto) {
    return this.filesService.list(projectKey, query)
  }

  @Post("uploads")
  @RequireApiScope("files:write")
  async createUpload(@Param("projectKey") projectKey: string, @Body() dto: CreateUploadDto) {
    return this.uploads.create(projectKey, dto)
  }

  @Get("uploads/:uploadId")
  @RequireApiScope("files:write")
  async uploadStatus(@Param("projectKey") projectKey: string, @Param("uploadId") uploadId: string) {
    return this.uploads.status(projectKey, uploadId)
  }

  /** 请求体为分片原始字节（application/octet-stream）。 */
  @Put("uploads/:uploadId/chunks/:index")
  @RequireApiScope("files:write")
  async putChunk(
    @Param("projectKey") projectKey: string,
    @Param("uploadId") uploadId: string,
    @Param("index", ParseIntPipe) index: number,
    @Req() req: Request,
  ) {
    return this.uploads.putChunk(projectKey, uploadId, index, req)
  }

  @Post("uploads/:uploadId/complete")
  @HttpCode(200)
  @RequireApiScope("files:write")
  async completeUpload(
    @Param("projectKey") projectKey: string,
    @Param("uploadId") uploadId: string,
  ) {
    return this.ingest.completeUpload(projectKey, uploadId)
  }

  @Delete("uploads/:uploadId")
  @RequireApiScope("files:write")
  async abortUpload(@Param("projectKey") projectKey: string, @Param("uploadId") uploadId: string) {
    await this.uploads.abort(projectKey, uploadId)
    return { success: true }
  }

  @Get(":fileId")
  @RequireApiScope("files:read")
  async findOne(@Param("projectKey") projectKey: string, @Param("fileId") fileId: string) {
    return this.filesService.findOne(projectKey, fileId)
  }

  @Post(":fileId/retry")
  @HttpCode(200)
  @RequireApiScope("files:write")
  async retry(@Param("projectKey") projectKey: string, @Param("fileId") fileId: string) {
    return this.ingest.retry(projectKey, fileId)
  }

  @Post(":fileId/refresh-cdn")
  @HttpCode(200)
  @RequireApiScope("files:write")
  async refreshCdn(@Param("projectKey") projectKey: string, @Param("fileId") fileId: string) {
    return this.filesService.refreshCdn(projectKey, fileId)
  }

  @Delete(":fileId")
  @RequireApiScope("files:write")
  async remove(@Param("projectKey") projectKey: string, @Param("fileId") fileId: string) {
    return this.filesService.remove(projectKey, fileId)
  }
}

/** 把版本下载链接中的 GitHub Release 附件镜像到文件存储。 */
@Controller("admin/projects/:projectKey/versions/:versionId/mirror-assets")
@UseGuards(AdminOrApiKeyGuard)
export class VersionAssetMirrorController {
  constructor(private readonly ingest: FileIngestService) {}

  @Post()
  @HttpCode(200)
  @RequireApiScope("files:write")
  async mirror(@Param("projectKey") projectKey: string, @Param("versionId") versionId: string) {
    return this.ingest.mirrorVersion(projectKey, versionId)
  }
}
