import { Body, Controller, Get, Post } from "@nestjs/common"

import { AuthService } from "./auth.service"
import { LoginDto } from "./dto/login.dto"

@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post("login")
  async login(@Body() dto: LoginDto) {
    return this.authService.login(dto)
  }

  @Get("status")
  getModuleStatus(): { module: string; implemented: boolean } {
    return this.authService.getStatus()
  }
}
