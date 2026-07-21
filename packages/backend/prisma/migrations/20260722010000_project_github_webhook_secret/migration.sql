-- Per-project GitHub release webhook secret.
-- Plaintext on purpose: HMAC-SHA256 verification recomputes the signature from
-- the original secret, so a one-way hash (as used for ApiKey) cannot work here.
-- NULL means the project has no webhook configured and every delivery is rejected.
ALTER TABLE "Project"
  ADD COLUMN "githubWebhookSecret" TEXT,
  ADD COLUMN "githubWebhookSecretUpdatedAt" INTEGER;
