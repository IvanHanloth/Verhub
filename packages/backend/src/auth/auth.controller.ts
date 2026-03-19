import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common"

import { AuthService } from "./auth.service"
import { ChangePasswordDto } from "./dto/change-password.dto"
import { CreateApiKeyDto } from "./dto/create-api-key.dto"
import { LoginDto } from "./dto/login.dto"
import { UpdateAdminAccountDto } from "./dto/update-admin-account.dto"
import { UpdateAdminProfileDto } from "./dto/update-admin-profile.dto"
import { JwtAdminGuard } from "./guards/jwt-admin.guard"

type AdminRequest = {
  user?: {
    sub?: string
  }
}

@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post("login")
  async login(@Body() dto: LoginDto) {
    return this.authService.login(dto)
  }

  @Get("admin-profile")
  @UseGuards(JwtAdminGuard)
  async getAdminProfile() {
    return this.authService.getAdminProfile()
  }

  @Get("me")
  @UseGuards(JwtAdminGuard)
  async getMe() {
    return this.authService.getAdminProfile()
  }

  @Patch("admin-profile")
  @UseGuards(JwtAdminGuard)
  async updateAdminProfile(@Body() dto: UpdateAdminProfileDto) {
    return this.authService.updateAdminProfile(dto)
  }

  @Patch("password")
  @UseGuards(JwtAdminGuard)
  async changePassword(@Body() dto: ChangePasswordDto) {
    await this.authService.updateAdminProfile({
      current_password: dto.current_password,
      new_password: dto.new_password,
    })
    return { success: true }
  }

  @Patch("account")
  @UseGuards(JwtAdminGuard)
  async updateAccount(@Body() dto: UpdateAdminAccountDto) {
    await this.authService.updateAdminProfile({
      current_password: dto.current_password,
      username: dto.username,
    })
    return { success: true }
  }

  @Get("api-keys")
  @UseGuards(JwtAdminGuard)
  async listApiKeys() {
    return this.authService.listApiKeys()
  }

  @Get("tokens")
  @UseGuards(JwtAdminGuard)
  async listTokens() {
    const result = await this.authService.listApiKeys()
    return result.data
  }

  @Post("api-keys")
  @UseGuards(JwtAdminGuard)
  async createApiKey(@Req() request: AdminRequest, @Body() dto: CreateApiKeyDto) {
    const actorId = request.user?.sub
    if (!actorId) {
      throw new BadRequestException("Missing actor identity")
    }

    return this.authService.createApiKey(dto, actorId)
  }

  @Post("tokens")
  @UseGuards(JwtAdminGuard)
  async createToken(@Req() request: AdminRequest, @Body() dto: CreateApiKeyDto) {
    const actorId = request.user?.sub
    if (!actorId) {
      throw new BadRequestException("Missing actor identity")
    }

    return this.authService.createApiKey(dto, actorId)
  }

  @Delete("api-keys/:id")
  @UseGuards(JwtAdminGuard)
  async revokeApiKey(@Param("id") id: string) {
    await this.authService.revokeApiKey(id)
    return { success: true }
  }

  @Delete("tokens/:id")
  @UseGuards(JwtAdminGuard)
  async revokeToken(@Param("id") id: string) {
    await this.authService.revokeApiKey(id)
    return { success: true }
  }

  @Get("status")
  getModuleStatus(): { module: string; implemented: boolean } {
    return this.authService.getStatus()
  }
}
