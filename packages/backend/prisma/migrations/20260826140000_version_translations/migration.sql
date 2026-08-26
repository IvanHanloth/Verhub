-- Per-locale overrides for a version's title and release notes; no isHidden by design
CREATE TABLE "VersionTranslation" (
  "versionId" TEXT NOT NULL,
  "locale" TEXT NOT NULL,
  "title" TEXT,
  "content" TEXT,
  "createdAt" INTEGER NOT NULL DEFAULT CAST(EXTRACT(EPOCH FROM now()) AS INTEGER),
  "updatedAt" INTEGER NOT NULL DEFAULT CAST(EXTRACT(EPOCH FROM now()) AS INTEGER),

  CONSTRAINT "VersionTranslation_pkey" PRIMARY KEY ("versionId", "locale")
);

CREATE INDEX "VersionTranslation_versionId_idx" ON "VersionTranslation"("versionId");

ALTER TABLE "VersionTranslation" ADD CONSTRAINT "VersionTranslation_versionId_fkey"
  FOREIGN KEY ("versionId") REFERENCES "Version"("id") ON DELETE CASCADE ON UPDATE CASCADE;
