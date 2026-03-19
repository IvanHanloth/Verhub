import { Module } from "@nestjs/common"

import { AuthModule } from "../auth/auth.module"
import { ActionsController } from "./actions.controller"
import { ActionsService } from "./actions.service"

@Module({
  imports: [AuthModule],
  controllers: [ActionsController],
  providers: [ActionsService],
  exports: [ActionsService],
})
export class ActionsModule {}
