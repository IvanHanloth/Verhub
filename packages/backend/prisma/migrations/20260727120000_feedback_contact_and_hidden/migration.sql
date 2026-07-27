-- Add contact info and hidden flag for feedbacks
ALTER TABLE "Feedback"
  ADD COLUMN "contact" TEXT,
  ADD COLUMN "isHidden" BOOLEAN NOT NULL DEFAULT false;
