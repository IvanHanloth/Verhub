import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from "@nestjs/common"

import { JwtAdminGuard } from "../auth/guards/jwt-admin.guard"
import { CreateProjectVersionDto } from "./dto/create-project-version.dto"
import { UpdateVersionDto } from "./dto/update-version.dto"
import { VersionsService } from "./versions.service"

@Controller("admin")
@UseGuards(JwtAdminGuard)
export class VersionsCompatController {
  constructor(private readonly versionsService: VersionsService) {}

  @Post("projects/versions")
  async createByProjectKey(@Body() dto: CreateProjectVersionDto) {
    return this.versionsService.createByProjectKey(dto.project_key, dto)
  }

  @Get("versions/:version_id")
  async findOneById(@Param("version_id") versionId: string) {
    return this.versionsService.findOneById(versionId)
  }

  @Patch("versions/:version_id")
  async updateById(@Param("version_id") versionId: string, @Body() dto: UpdateVersionDto) {
    return this.versionsService.updateById(versionId, dto)
  }

  @Delete("versions/:version_id")
  async removeById(@Param("version_id") versionId: string) {
    await this.versionsService.removeById(versionId)
    return { success: true }
  }
}
