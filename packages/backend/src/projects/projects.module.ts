import { Module } from "@nestjs/common"

import { AuthModule } from "../auth/auth.module"
import { ProjectsController } from "./projects.controller"
import { ProjectsPublicController } from "./projects-public.controller"
import { ProjectsService } from "./projects.service"

@Module({
  imports: [AuthModule],
  controllers: [ProjectsController, ProjectsPublicController],
  providers: [ProjectsService],
  exports: [ProjectsService],
})
export class ProjectsModule {}
