import { Module } from "@nestjs/common"

import { AuthModule } from "../auth/auth.module"
import { ProjectTranslationController, TranslationConfigController } from "./translation.controller"
import { TranslationConfigService } from "./translation-config.service"
import { TranslationService } from "./translation.service"

@Module({
  imports: [AuthModule],
  controllers: [TranslationConfigController, ProjectTranslationController],
  providers: [TranslationConfigService, TranslationService],
})
export class TranslationModule {}
