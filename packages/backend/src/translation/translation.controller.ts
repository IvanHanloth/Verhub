import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  UseGuards,
} from "@nestjs/common"

import { JwtAdminGuard } from "../auth/guards/jwt-admin.guard"
import { TranslateDto } from "./dto/translate.dto"
import { UpdateTranslationConfigDto } from "./dto/update-translation-config.dto"
import { TranslationConfigService } from "./translation-config.service"
import { TranslationService } from "./translation.service"

/**
 * 实例级 AI 翻译配置与调用。只收管理员 JWT，不开放给 API key：
 * 这是一份能直接产生上游账单的出站凭据，不该被按资源划分的 scope 委托出去。
 */
@Controller("admin/translation")
@UseGuards(JwtAdminGuard)
export class TranslationConfigController {
  constructor(
    private readonly configService: TranslationConfigService,
    private readonly translationService: TranslationService,
  ) {}

  @Get()
  async getConfig() {
    return this.configService.getView()
  }

  @Put()
  @HttpCode(200)
  async updateConfig(@Body() dto: UpdateTranslationConfigDto) {
    return this.configService.update(dto)
  }

  @Delete()
  async clearConfig() {
    return this.configService.clear()
  }

  /** 用当前配置译一句样例。失败也回 200，原因写在结果里给设置页展示。 */
  @Post("test")
  @HttpCode(200)
  async test() {
    return this.translationService.test()
  }
}

/**
 * 翻译端点挂在项目下：目标语言要拿项目的注册表来校验，译文也只对这个项目有意义。
 * 鉴权口径同上，与 admin/projects 下其余端点（可用 API key）不同。
 */
@Controller("admin/projects")
@UseGuards(JwtAdminGuard)
export class ProjectTranslationController {
  constructor(private readonly translationService: TranslationService) {}

  @Post(":projectKey/translate")
  @HttpCode(200)
  async translate(@Param("projectKey") projectKey: string, @Body() dto: TranslateDto) {
    return this.translationService.translate(projectKey, dto)
  }
}
