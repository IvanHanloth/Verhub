import { Global, Module } from "@nestjs/common"

import { PrismaService } from "./prisma.service"
import { ProjectResolverService } from "./project-resolver.service"

@Global()
@Module({
  providers: [PrismaService, ProjectResolverService],
  exports: [PrismaService, ProjectResolverService],
})
export class DatabaseModule {}
