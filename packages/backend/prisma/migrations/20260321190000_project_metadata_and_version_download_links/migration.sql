-- Add optional project showcase metadata fields.
ALTER TABLE "Project"
  ADD COLUMN "author" TEXT,
  ADD COLUMN "authorHomepageUrl" TEXT,
  ADD COLUMN "iconUrl" TEXT,
  ADD COLUMN "websiteUrl" TEXT,
  ADD COLUMN "publishedAt" INTEGER;

-- Add structured download links to support multiple release assets.
ALTER TABLE "Version"
  ADD COLUMN "downloadLinks" JSONB;

-- Backfill downloadLinks from existing single downloadUrl to keep backward compatibility.
UPDATE "Version"
SET "downloadLinks" = jsonb_build_array(jsonb_build_object('url', "downloadUrl"))
WHERE "downloadUrl" IS NOT NULL
  AND "downloadLinks" IS NULL;
