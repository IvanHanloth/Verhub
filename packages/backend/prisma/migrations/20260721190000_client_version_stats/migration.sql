-- Hourly rollup of the version clients report to check-update.
-- Answers "what is actually installed in the field", which the Version table
-- (published releases only) cannot.
CREATE TABLE "ClientVersionStat" (
  "id" TEXT NOT NULL,
  "projectKey" TEXT NOT NULL,
  "version" TEXT NOT NULL,
  "hourBucket" INTEGER NOT NULL,
  "platform" "StatPlatform" NOT NULL DEFAULT 'UNKNOWN',
  "count" INTEGER NOT NULL DEFAULT 0,
  "createdAt" INTEGER NOT NULL DEFAULT CAST(EXTRACT(EPOCH FROM now()) AS INTEGER),
  "updatedAt" INTEGER NOT NULL DEFAULT CAST(EXTRACT(EPOCH FROM now()) AS INTEGER),

  CONSTRAINT "ClientVersionStat_pkey" PRIMARY KEY ("id")
);

-- Upsert-increment target. Dimension columns are NOT NULL so NULLs cannot split
-- buckets. The name is Prisma's own truncation of the @@unique index to
-- Postgres's 63-char identifier limit; spelling it differently would let
-- Postgres truncate it its own way and leave the schema permanently drifted.
CREATE UNIQUE INDEX "ClientVersionStat_projectKey_version_hourBucket_platform_key"
  ON "ClientVersionStat" ("projectKey", "version", "hourBucket", "platform");

-- Big-screen queries: one project over a time range
CREATE INDEX "ClientVersionStat_projectKey_hourBucket_idx"
  ON "ClientVersionStat" ("projectKey", "hourBucket");

-- Retention sweep scans by age across all projects
CREATE INDEX "ClientVersionStat_hourBucket_idx"
  ON "ClientVersionStat" ("hourBucket");

ALTER TABLE "ClientVersionStat"
  ADD CONSTRAINT "ClientVersionStat_projectKey_fkey"
  FOREIGN KEY ("projectKey") REFERENCES "Project" ("projectKey")
  ON DELETE CASCADE ON UPDATE CASCADE;
