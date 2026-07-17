import { PartialType } from "@nestjs/mapped-types"

import { CreateVersionDto } from "./create-version.dto"

/**
 * Body of `PUT .../versions/by-version/:version`.
 *
 * Every field is optional: the target version number comes from the path, and
 * omitted fields keep their current value on an existing record. `version` may
 * still be sent for convenience but must match the path segment.
 */
export class UpsertVersionDto extends PartialType(CreateVersionDto) {}
