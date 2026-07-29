-- Instance-level terms documents; one row per customised document, builtin text lives in code
CREATE TABLE "TermsDocument" (
  "slug" TEXT NOT NULL,
  "custom" BOOLEAN NOT NULL DEFAULT false,
  "content" TEXT,
  "contentUpdatedAt" INTEGER,
  "updatedAt" INTEGER NOT NULL DEFAULT CAST(EXTRACT(EPOCH FROM now()) AS INTEGER),

  CONSTRAINT "TermsDocument_pkey" PRIMARY KEY ("slug")
);
