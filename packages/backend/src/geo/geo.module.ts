import { Global, Module } from "@nestjs/common"

import { ClientOriginService } from "./client-origin.service"
import { GeoLocationService } from "./geo-location.service"

/**
 * Global because every collection point needs it — stats, logs, feedbacks and
 * action records — and the service holds a process-wide cache that must not be
 * instantiated once per importing module.
 */
@Global()
@Module({
  providers: [GeoLocationService, ClientOriginService],
  exports: [GeoLocationService, ClientOriginService],
})
export class GeoModule {}
