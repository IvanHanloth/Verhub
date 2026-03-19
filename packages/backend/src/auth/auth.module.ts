import { Module } from "@nestjs/common"
import { ConfigModule, ConfigService } from "@nestjs/config"
import { JwtModule } from "@nestjs/jwt"

import { AuthController } from "./auth.controller"
import { AuthService } from "./auth.service"
import { AdminOrApiKeyGuard } from "./guards/admin-or-api-key.guard"
import { ApiKeyGuard } from "./guards/api-key.guard"
import { JwtAdminGuard } from "./guards/jwt-admin.guard"
import { parseExpiresInToSeconds } from "./utils/jwt-expiration"

@Module({
  imports: [
    ConfigModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>("JWT_SECRET") ?? "replace-with-a-strong-secret",
        signOptions: {
          expiresIn: parseExpiresInToSeconds(configService.get<string>("JWT_EXPIRES_IN")),
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtAdminGuard, ApiKeyGuard, AdminOrApiKeyGuard],
  exports: [JwtModule, AuthService, JwtAdminGuard, ApiKeyGuard, AdminOrApiKeyGuard],
})
export class AuthModule {}
