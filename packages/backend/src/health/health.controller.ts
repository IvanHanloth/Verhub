import { Controller, Get } from "@nestjs/common"

@Controller("health")
export class HealthController {
  @Get()
  getHealth(): { status: string; timestamp: number } {
    return {
      status: "ok",
      timestamp: Date.now(),
    }
  }
}
