-- Normalize project keys to lowercase so project_key can be case-insensitive in API usage.
UPDATE "Project"
SET "projectKey" = LOWER("projectKey");

-- Add projectKey reference columns for relation tables.
ALTER TABLE "Action" ADD COLUMN "projectKey" TEXT;
ALTER TABLE "Version" ADD COLUMN "projectKey" TEXT;
ALTER TABLE "Announcement" ADD COLUMN "projectKey" TEXT;
ALTER TABLE "Feedback" ADD COLUMN "projectKey" TEXT;
ALTER TABLE "Log" ADD COLUMN "projectKey" TEXT;

-- Backfill new relation columns from old projectId references.
UPDATE "Action" a
SET "projectKey" = p."projectKey"
FROM "Project" p
WHERE a."projectId" = p."id";

UPDATE "Version" v
SET "projectKey" = p."projectKey"
FROM "Project" p
WHERE v."projectId" = p."id";

UPDATE "Announcement" a
SET "projectKey" = p."projectKey"
FROM "Project" p
WHERE a."projectId" = p."id";

UPDATE "Feedback" f
SET "projectKey" = p."projectKey"
FROM "Project" p
WHERE f."projectId" = p."id";

UPDATE "Log" l
SET "projectKey" = p."projectKey"
FROM "Project" p
WHERE l."projectId" = p."id";

ALTER TABLE "Action" ALTER COLUMN "projectKey" SET NOT NULL;
ALTER TABLE "Version" ALTER COLUMN "projectKey" SET NOT NULL;
ALTER TABLE "Announcement" ALTER COLUMN "projectKey" SET NOT NULL;
ALTER TABLE "Feedback" ALTER COLUMN "projectKey" SET NOT NULL;
ALTER TABLE "Log" ALTER COLUMN "projectKey" SET NOT NULL;

-- Drop foreign keys to old projectId.
ALTER TABLE "Action" DROP CONSTRAINT IF EXISTS "Action_projectId_fkey";
ALTER TABLE "Version" DROP CONSTRAINT IF EXISTS "Version_projectId_fkey";
ALTER TABLE "Announcement" DROP CONSTRAINT IF EXISTS "Announcement_projectId_fkey";
ALTER TABLE "Feedback" DROP CONSTRAINT IF EXISTS "Feedback_projectId_fkey";
ALTER TABLE "Log" DROP CONSTRAINT IF EXISTS "Log_projectId_fkey";

-- Drop old indexes and constraints that rely on projectId.
DROP INDEX IF EXISTS "Action_projectId_createdAt_idx";
DROP INDEX IF EXISTS "Version_projectId_createdAt_idx";
DROP INDEX IF EXISTS "Version_projectId_version_key";
DROP INDEX IF EXISTS "Announcement_projectId_createdAt_idx";
DROP INDEX IF EXISTS "Feedback_projectId_createdAt_idx";
DROP INDEX IF EXISTS "Log_projectId_createdAt_idx";

-- Replace old projectId columns.
ALTER TABLE "Action" DROP COLUMN "projectId";
ALTER TABLE "Version" DROP COLUMN "projectId";
ALTER TABLE "Announcement" DROP COLUMN "projectId";
ALTER TABLE "Feedback" DROP COLUMN "projectId";
ALTER TABLE "Log" DROP COLUMN "projectId";

-- Switch Project primary key from id to projectKey.
ALTER TABLE "Project" DROP CONSTRAINT IF EXISTS "Project_pkey";
ALTER TABLE "Project" ADD CONSTRAINT "Project_pkey" PRIMARY KEY ("projectKey");
ALTER TABLE "Project" DROP COLUMN "id";

-- Re-create relation indexes.
CREATE INDEX "Action_projectKey_createdAt_idx" ON "Action"("projectKey", "createdAt");
CREATE UNIQUE INDEX "Version_projectKey_version_key" ON "Version"("projectKey", "version");
CREATE INDEX "Version_projectKey_createdAt_idx" ON "Version"("projectKey", "createdAt");
CREATE INDEX "Announcement_projectKey_createdAt_idx" ON "Announcement"("projectKey", "createdAt");
CREATE INDEX "Feedback_projectKey_createdAt_idx" ON "Feedback"("projectKey", "createdAt");
CREATE INDEX "Log_projectKey_createdAt_idx" ON "Log"("projectKey", "createdAt");

-- Re-create foreign keys to projectKey.
ALTER TABLE "Action"
  ADD CONSTRAINT "Action_projectKey_fkey"
  FOREIGN KEY ("projectKey") REFERENCES "Project"("projectKey") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Version"
  ADD CONSTRAINT "Version_projectKey_fkey"
  FOREIGN KEY ("projectKey") REFERENCES "Project"("projectKey") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Announcement"
  ADD CONSTRAINT "Announcement_projectKey_fkey"
  FOREIGN KEY ("projectKey") REFERENCES "Project"("projectKey") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Feedback"
  ADD CONSTRAINT "Feedback_projectKey_fkey"
  FOREIGN KEY ("projectKey") REFERENCES "Project"("projectKey") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Log"
  ADD CONSTRAINT "Log_projectKey_fkey"
  FOREIGN KEY ("projectKey") REFERENCES "Project"("projectKey") ON DELETE CASCADE ON UPDATE CASCADE;
