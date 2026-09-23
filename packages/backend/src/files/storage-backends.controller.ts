import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  UseGuards,
} from "@nestjs/common"

import { JwtAdminGuard } from "../auth/guards/jwt-admin.guard"
import { CdnRefreshService } from "./cdn-refresh.service"
import { UpdateCdnConfigDto } from "./dto/cdn-config.dto"
import { CreateStorageBackendDto, UpdateStorageBackendDto } from "./dto/storage-backend.dto"
import { StorageBackendsService } from "./storage-backends.service"

/** 实例级存储后端配置，只接受管理员 JWT。 */
@Controller("admin/storage")
@UseGuards(JwtAdminGuard)
export class StorageBackendsController {
  constructor(
    private readonly backends: StorageBackendsService,
    private readonly cdn: CdnRefreshService,
  ) {}

  @Get("cdn")
  async getCdnConfig() {
    return this.cdn.getView()
  }

  @Put("cdn")
  @HttpCode(200)
  async updateCdnConfig(@Body() dto: UpdateCdnConfigDto) {
    return this.cdn.update(dto)
  }

  @Delete("cdn")
  async clearCdnConfig() {
    return this.cdn.clear()
  }

  /** 用已保存的凭据查询刷新余量。失败也返回 200，原因在 error 里。 */
  @Post("cdn/test")
  @HttpCode(200)
  async testCdnConfig() {
    return this.cdn.test()
  }

  @Get()
  async overview() {
    return this.backends.overview()
  }

  @Post("backends")
  async create(@Body() dto: CreateStorageBackendDto) {
    return this.backends.create(dto)
  }

  @Patch("backends/:id")
  async update(@Param("id") id: string, @Body() dto: UpdateStorageBackendDto) {
    return this.backends.update(id, dto)
  }

  @Delete("backends/:id")
  async remove(@Param("id") id: string) {
    await this.backends.remove(id)
    return { success: true }
  }

  /** 写入、按 Range 读取并删除一个探测文件。失败也返回 200，原因在 error 里。 */
  @Post("backends/:id/test")
  @HttpCode(200)
  async test(@Param("id") id: string) {
    return this.backends.test(id)
  }
}
