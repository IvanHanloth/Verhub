-- Refactor Version milestone marker from TEXT to BOOLEAN
ALTER TABLE "Version"
  ADD COLUMN "isMilestone" BOOLEAN NOT NULL DEFAULT false;

-- Backfill: any non-empty legacy milestone text becomes true
UPDATE "Version"
SET "isMilestone" = true
WHERE "milestone" IS NOT NULL AND btrim("milestone") <> '';

-- Drop legacy free-text milestone column
ALTER TABLE "Version"
  DROP COLUMN "milestone";
