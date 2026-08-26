-- Instance-level AI translation config; single row keyed on the literal 'default'
CREATE TABLE "TranslationConfig" (
  "id" TEXT NOT NULL DEFAULT 'default',
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "provider" TEXT NOT NULL DEFAULT 'openai',
  "baseUrl" TEXT,
  "apiKeyEncrypted" TEXT,
  "apiKeyFingerprint" TEXT,
  "apiKeyUpdatedAt" INTEGER,
  "model" TEXT,
  "customPrompt" BOOLEAN NOT NULL DEFAULT false,
  "systemPrompt" TEXT,
  "updatedAt" INTEGER NOT NULL DEFAULT CAST(EXTRACT(EPOCH FROM now()) AS INTEGER),

  CONSTRAINT "TranslationConfig_pkey" PRIMARY KEY ("id")
);
