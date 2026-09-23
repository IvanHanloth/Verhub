import { Module } from "@nestjs/common"

import { AuthModule } from "../auth/auth.module"
import { CdnRefreshService } from "./cdn-refresh.service"
import { DistController } from "./dist.controller"
import { FileIngestService } from "./file-ingest.service"
import { FileJobsService } from "./file-jobs.service"
import { FilesController, VersionAssetMirrorController } from "./files.controller"
import { FilesService } from "./files.service"
import { StorageBackendsController } from "./storage-backends.controller"
import { StorageBackendsService } from "./storage-backends.service"
import { UploadsService } from "./uploads.service"

@Module({
  imports: [AuthModule],
  controllers: [
    FilesController,
    VersionAssetMirrorController,
    StorageBackendsController,
    DistController,
  ],
  providers: [
    StorageBackendsService,
    CdnRefreshService,
    FilesService,
    UploadsService,
    FileJobsService,
    FileIngestService,
  ],
  exports: [FilesService, FileIngestService],
})
export class FilesModule {}
