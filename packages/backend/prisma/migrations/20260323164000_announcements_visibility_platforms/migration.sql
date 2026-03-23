-- Add hidden flag and platform targeting for announcements
ALTER TABLE "Announcement"
  ADD COLUMN "isHidden" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "platforms" "ClientPlatform"[] NOT NULL DEFAULT ARRAY[]::"ClientPlatform"[];

-- Query optimization for public announcement listing
CREATE INDEX "Announcement_projectKey_isHidden_createdAt_idx"
  ON "Announcement"("projectKey", "isHidden", "createdAt");
