-- Caller origin (IP / User-Agent / resolved geography) on every client
-- submission, plus the shared IP → geography cache that fills it in.

-- Persistent IP → origin cache. Public geo APIs are rate limited and are the
-- slowest step in an otherwise database-only request path, so each address is
-- resolved once and reused. Persisted (not merely in-memory) so a restart does
-- not replay the whole working set against the provider.
CREATE TABLE "IpGeoCache" (
  "ip" TEXT NOT NULL,
  "countryCode" TEXT NOT NULL DEFAULT 'UNKNOWN',
  "countryName" TEXT,
  "regionName" TEXT,
  "city" TEXT,
  -- Provider that answered, or 'NONE' for a cached failure.
  "source" TEXT NOT NULL,
  "resolvedAt" INTEGER NOT NULL DEFAULT CAST(EXTRACT(EPOCH FROM now()) AS INTEGER),
  "expiresAt" INTEGER NOT NULL,

  CONSTRAINT "IpGeoCache_pkey" PRIMARY KEY ("ip")
);

-- Expiry sweep scans by age.
CREATE INDEX "IpGeoCache_expiresAt_idx" ON "IpGeoCache" ("expiresAt");

-- Observed-at-submit-time columns. Kept out of the client-supplied JSON blobs
-- (deviceInfo / http) so forgeable and server-observed values stay separable.
ALTER TABLE "Log"
  ADD COLUMN "ip" TEXT,
  ADD COLUMN "userAgent" TEXT,
  ADD COLUMN "countryCode" TEXT,
  ADD COLUMN "countryName" TEXT,
  ADD COLUMN "regionName" TEXT,
  ADD COLUMN "city" TEXT,
  ADD COLUMN "platform" "ClientPlatform",
  ADD COLUMN "dedupHash" TEXT;

ALTER TABLE "Feedback"
  ADD COLUMN "ip" TEXT,
  ADD COLUMN "userAgent" TEXT,
  ADD COLUMN "countryCode" TEXT,
  ADD COLUMN "countryName" TEXT,
  ADD COLUMN "regionName" TEXT,
  ADD COLUMN "city" TEXT,
  ADD COLUMN "dedupHash" TEXT;

ALTER TABLE "ActionRecord"
  ADD COLUMN "ip" TEXT,
  ADD COLUMN "userAgent" TEXT,
  ADD COLUMN "countryCode" TEXT,
  ADD COLUMN "countryName" TEXT,
  ADD COLUMN "regionName" TEXT,
  ADD COLUMN "city" TEXT,
  ADD COLUMN "platform" "ClientPlatform",
  ADD COLUMN "dedupHash" TEXT;

-- Dedup lookup is always "this fingerprint, within the last N seconds", so the
-- timestamp belongs in the index rather than as a filter over the whole bucket.
CREATE INDEX "Log_dedupHash_createdAt_idx" ON "Log" ("dedupHash", "createdAt");
CREATE INDEX "Feedback_dedupHash_createdAt_idx" ON "Feedback" ("dedupHash", "createdAt");
CREATE INDEX "ActionRecord_dedupHash_createdAt_idx" ON "ActionRecord" ("dedupHash", "createdAt");
