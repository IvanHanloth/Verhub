-- Add multi-platform targeting to versions while keeping legacy single platform column
ALTER TABLE "Version"
  ADD COLUMN "platforms" "ClientPlatform"[] NOT NULL DEFAULT ARRAY[]::"ClientPlatform"[];

-- Backfill from existing single platform value when present
UPDATE "Version"
SET "platforms" = ARRAY["platform"]::"ClientPlatform"[]
WHERE "platform" IS NOT NULL;
