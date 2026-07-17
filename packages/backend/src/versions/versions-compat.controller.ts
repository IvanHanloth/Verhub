import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from "@nestjs/common"

import { AdminOrApiKeyGuard } from "../auth/guards/admin-or-api-key.guard"
import { RequireApiScope } from "../auth/guards/api-scope.decorator"
import { CreateProjectVersionDto } from "./dto/create-project-version.dto"
import { UpdateVersionDto } from "./dto/update-version.dto"
import { VersionsService } from "./versions.service"

@Controller("admin")
@UseGuards(AdminOrApiKeyGuard)
export class VersionsCompatController {
  constructor(private readonly versionsService: VersionsService) {}

  @Post("projects/versions")
  @RequireApiScope("versions:write")
  async createByProjectKey(@Body() dto: CreateProjectVersionDto) {
    return this.versionsService.createByProjectKey(dto.project_key, dto)
  }

  @Get("versions/:version_id")
  @RequireApiScope("versions:read")
  async findOneById(@Param("version_id") versionId: string) {
    return this.versionsService.findOneById(versionId)
  }

  @Patch("versions/:version_id")
  @RequireApiScope("versions:write")
  async updateById(@Param("version_id") versionId: string, @Body() dto: UpdateVersionDto) {
    return this.versionsService.updateById(versionId, dto)
  }

  @Delete("versions/:version_id")
  @RequireApiScope("versions:write")
  async removeById(@Param("version_id") versionId: string) {
    await this.versionsService.removeById(versionId)
    return { success: true }
  }
}
