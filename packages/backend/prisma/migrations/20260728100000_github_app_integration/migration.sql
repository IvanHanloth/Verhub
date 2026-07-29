-- Instance-level GitHub App configuration (singleton row) and per-project integration
CREATE TABLE "GithubAppConfig" (
  "id" TEXT NOT NULL DEFAULT 'default',
  "appId" TEXT,
  "privateKeyEncrypted" TEXT,
  "privateKeyFingerprint" TEXT,
  "privateKeyUpdatedAt" INTEGER,
  "webhookSecret" TEXT,
  "webhookSecretUpdatedAt" INTEGER,
  "enabledFeatures" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "feedbackIssueTitleTemplate" TEXT,
  "feedbackIssueBodyTemplate" TEXT,
  "updatedAt" INTEGER NOT NULL DEFAULT CAST(EXTRACT(EPOCH FROM now()) AS INTEGER),

  CONSTRAINT "GithubAppConfig_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProjectGithubIntegration" (
  "projectKey" TEXT NOT NULL,
  "repoFullName" TEXT,
  "feedbackIssueEnabled" BOOLEAN NOT NULL DEFAULT false,
  "feedbackIssueTitleTemplate" TEXT,
  "feedbackIssueBodyTemplate" TEXT,
  "feedbackIssueLabels" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "commentCommandsEnabled" BOOLEAN NOT NULL DEFAULT false,
  "commandAllowedAssociations" TEXT[] NOT NULL DEFAULT ARRAY['OWNER','MEMBER','COLLABORATOR']::TEXT[],
  "commandAllowedUsers" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "commands" JSONB,
  "updatedAt" INTEGER NOT NULL DEFAULT CAST(EXTRACT(EPOCH FROM now()) AS INTEGER),

  CONSTRAINT "ProjectGithubIntegration_pkey" PRIMARY KEY ("projectKey")
);

CREATE INDEX "ProjectGithubIntegration_repoFullName_idx"
  ON "ProjectGithubIntegration"("repoFullName");

ALTER TABLE "ProjectGithubIntegration"
  ADD CONSTRAINT "ProjectGithubIntegration_projectKey_fkey"
  FOREIGN KEY ("projectKey") REFERENCES "Project"("projectKey")
  ON DELETE CASCADE ON UPDATE CASCADE;
