import { Module } from "@nestjs/common"

import { AuthModule } from "../auth/auth.module"
import { VersionsController } from "./versions.controller"
import { VersionsService } from "./versions.service"

@Module({
  imports: [AuthModule],
  controllers: [VersionsController],
  providers: [VersionsService],
  exports: [VersionsService],
})
export class VersionsModule {}
