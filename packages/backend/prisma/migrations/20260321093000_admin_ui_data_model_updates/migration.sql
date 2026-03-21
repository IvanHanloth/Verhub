-- Allow versions without download URL
ALTER TABLE "Version"
ALTER COLUMN "downloadUrl" DROP NOT NULL;

-- Add announcement author and publish time fields
ALTER TABLE "Announcement"
ADD COLUMN "author" TEXT,
ADD COLUMN "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
