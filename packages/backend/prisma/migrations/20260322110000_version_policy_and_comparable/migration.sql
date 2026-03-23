-- Project-level optional update range policy
ALTER TABLE "Project"
  ADD COLUMN "optionalUpdateMinComparableVersion" TEXT,
  ADD COLUMN "optionalUpdateMaxComparableVersion" TEXT;

-- Version-level comparable version and update policy metadata
ALTER TABLE "Version"
  ADD COLUMN "comparableVersion" TEXT,
  ADD COLUMN "milestone" TEXT,
  ADD COLUMN "isDeprecated" BOOLEAN NOT NULL DEFAULT false;

-- Best-effort backfill: use existing version value when it already matches comparable format
UPDATE "Version"
SET "comparableVersion" = "version"
WHERE "version" ~ '^[0-9]+(\.[0-9]+)*(\-(alpha|beta|rc)(\.[0-9]+(\.[0-9]+)*)?)?$';
