import { SetMetadata } from "@nestjs/common"
import { PublicEndpoint } from "@prisma/client"

export const TRACK_ENDPOINT_KEY = "verhub:track-endpoint"

/**
 * Mark a public route for request statistics.
 *
 * Tracking is opt-in per route rather than inferred from the URL path: paths
 * change, and an untracked route should fail by recording nothing rather than
 * by silently landing in the wrong bucket.
 */
export const TrackEndpoint = (endpoint: PublicEndpoint) => SetMetadata(TRACK_ENDPOINT_KEY, endpoint)
