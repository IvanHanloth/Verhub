import { Body, Controller, Delete, Get, HttpCode, Put, UseGuards } from "@nestjs/common"

import { JwtAdminGuard } from "../auth/guards/jwt-admin.guard"
import { UpdateGithubAppConfigDto } from "./dto/update-github-app-config.dto"
import { GithubAppConfigService } from "./github-app-config.service"

/**
 * 实例级 GitHub App 配置。只收管理员 JWT，不开放给 API key：
 * 私钥与 App 凭据是整个实例的最高权限机密，不该被按资源划分的 scope 委托出去。
 */
@Controller("admin/github-app")
@UseGuards(JwtAdminGuard)
export class GithubAppConfigController {
  constructor(private readonly configService: GithubAppConfigService) {}

  @Get()
  async getConfig() {
    return this.configService.getView()
  }

  @Put()
  @HttpCode(200)
  async updateConfig(@Body() dto: UpdateGithubAppConfigDto) {
    return this.configService.update(dto)
  }

  @Delete()
  async clearConfig() {
    return this.configService.clear()
  }
}
