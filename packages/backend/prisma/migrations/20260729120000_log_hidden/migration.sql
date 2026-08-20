-- Add hidden flag for logs
ALTER TABLE "Log"
  ADD COLUMN "isHidden" BOOLEAN NOT NULL DEFAULT false;
