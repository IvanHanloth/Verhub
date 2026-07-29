import { Module } from "@nestjs/common"

import { AuthModule } from "../auth/auth.module"
import { TermsController } from "./terms.controller"
import { TermsPublicController } from "./terms-public.controller"
import { TermsService } from "./terms.service"

@Module({
  imports: [AuthModule],
  controllers: [TermsController, TermsPublicController],
  providers: [TermsService],
})
export class TermsModule {}
