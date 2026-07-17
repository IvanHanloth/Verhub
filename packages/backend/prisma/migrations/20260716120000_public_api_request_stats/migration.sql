-- Platform dimension for request statistics (ClientPlatform plus an UNKNOWN sentinel)
CREATE TYPE "StatPlatform" AS ENUM ('IOS', 'ANDROID', 'WINDOWS', 'MAC', 'WEB', 'UNKNOWN');

-- One member per tracked public route
CREATE TYPE "PublicEndpoint" AS ENUM (
  'PROJECT_DETAIL',
  'VERSION_LIST',
  'VERSION_LATEST',
  'VERSION_LATEST_PREVIEW',
  'VERSION_BY_VERSION',
  'VERSION_CHECK_UPDATE',
  'ANNOUNCEMENT_LIST',
  'ANNOUNCEMENT_LATEST',
  'FEEDBACK_SUBMIT',
  'LOG_UPLOAD',
  'ACTION_RECORD'
);

-- Per-project retention window for hourly statistics
ALTER TABLE "Project"
  ADD COLUMN "statsRetentionDays" INTEGER NOT NULL DEFAULT 365;

-- Hourly rollup of public API requests
CREATE TABLE "ApiRequestStat" (
  "id" TEXT NOT NULL,
  "projectKey" TEXT NOT NULL,
  "endpoint" "PublicEndpoint" NOT NULL,
  "hourBucket" INTEGER NOT NULL,
  "platform" "StatPlatform" NOT NULL DEFAULT 'UNKNOWN',
  "region" TEXT NOT NULL DEFAULT 'UNKNOWN',
  "count" INTEGER NOT NULL DEFAULT 0,
  "createdAt" INTEGER NOT NULL DEFAULT CAST(EXTRACT(EPOCH FROM now()) AS INTEGER),
  "updatedAt" INTEGER NOT NULL DEFAULT CAST(EXTRACT(EPOCH FROM now()) AS INTEGER),

  CONSTRAINT "ApiRequestStat_pkey" PRIMARY KEY ("id")
);

-- Upsert-increment target: dimension columns are NOT NULL so NULLs cannot split buckets.
-- The name is Prisma's own truncation of the @@unique index to Postgres's 63-char
-- identifier limit (note "regi_key", not "region_key"); spelling it out in full
-- would let Postgres truncate it differently and leave the schema permanently drifted.
CREATE UNIQUE INDEX "ApiRequestStat_projectKey_endpoint_hourBucket_platform_regi_key"
  ON "ApiRequestStat" ("projectKey", "endpoint", "hourBucket", "platform", "region");

-- Big-screen queries: one project over a time range
CREATE INDEX "ApiRequestStat_projectKey_hourBucket_idx"
  ON "ApiRequestStat" ("projectKey", "hourBucket");

-- Retention sweep scans by age across all projects
CREATE INDEX "ApiRequestStat_hourBucket_idx"
  ON "ApiRequestStat" ("hourBucket");

ALTER TABLE "ApiRequestStat"
  ADD CONSTRAINT "ApiRequestStat_projectKey_fkey"
  FOREIGN KEY ("projectKey") REFERENCES "Project" ("projectKey")
  ON DELETE CASCADE ON UPDATE CASCADE;
