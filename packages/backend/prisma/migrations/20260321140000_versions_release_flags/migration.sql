ALTER TABLE "Version"
  ADD COLUMN "isLatest" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "isPreview" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "publishedAt" INTEGER NOT NULL DEFAULT CAST(EXTRACT(EPOCH FROM now()) AS INTEGER);

UPDATE "Version"
SET "isLatest" = true
WHERE "id" IN (
  SELECT DISTINCT ON ("projectId") "id"
  FROM "Version"
  ORDER BY "projectId", "createdAt" DESC
);
