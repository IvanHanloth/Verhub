import { Module } from "@nestjs/common"

import { AuthModule } from "../auth/auth.module"
import { GeoModule } from "../geo/geo.module"
import { EventsAdminController } from "./events-admin.controller"
import { EventsAnalysisService } from "./events-analysis.service"
import { EventsController } from "./events.controller"
import { EventsDashboardService } from "./events-dashboard.service"
import { EventsDefinitionsService } from "./events-definitions.service"
import { EventsIngestService } from "./events-ingest.service"
import { EventsQueryService } from "./events-query.service"
import { EventsStatsService } from "./events-stats.service"

@Module({
  imports: [AuthModule, GeoModule],
  controllers: [EventsController, EventsAdminController],
  providers: [
    EventsIngestService,
    EventsStatsService,
    EventsAnalysisService,
    EventsQueryService,
    EventsDefinitionsService,
    EventsDashboardService,
  ],
  exports: [EventsIngestService, EventsStatsService],
})
export class EventsModule {}
