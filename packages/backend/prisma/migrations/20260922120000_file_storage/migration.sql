-- 文件存储与分发：存储后端、文件库，以及项目级的存储选择与 GitHub 附件镜像开关。
CREATE TYPE "StorageKind" AS ENUM ('LOCAL', 'WEBDAV');
CREATE TYPE "StoredFileStatus" AS ENUM ('PENDING', 'READY', 'FAILED');
CREATE TYPE "StoredFileSource" AS ENUM ('UPLOAD', 'GITHUB_RELEASE');

CREATE TABLE "StorageBackend" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "kind" "StorageKind" NOT NULL,
  "baseUrl" TEXT,
  "username" TEXT,
  "passwordEncrypted" TEXT,
  "passwordFingerprint" TEXT,
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" INTEGER NOT NULL DEFAULT CAST(EXTRACT(EPOCH FROM now()) AS INTEGER),
  "updatedAt" INTEGER NOT NULL DEFAULT CAST(EXTRACT(EPOCH FROM now()) AS INTEGER),

  CONSTRAINT "StorageBackend_pkey" PRIMARY KEY ("id")
);

-- 内置本机存储，初始即为默认存储。
INSERT INTO "StorageBackend" ("id", "name", "kind", "isDefault") VALUES ('local', '本机存储', 'LOCAL', true);

CREATE TABLE "StoredFile" (
  "id" TEXT NOT NULL,
  "projectKey" TEXT NOT NULL,
  "storageBackendId" TEXT NOT NULL,
  "objectKey" TEXT NOT NULL,
  "filename" TEXT NOT NULL,
  "size" BIGINT NOT NULL DEFAULT 0,
  "sha256" TEXT,
  "contentType" TEXT NOT NULL,
  "status" "StoredFileStatus" NOT NULL DEFAULT 'READY',
  "source" "StoredFileSource" NOT NULL DEFAULT 'UPLOAD',
  "sourceUrl" TEXT,
  "error" TEXT,
  "createdAt" INTEGER NOT NULL DEFAULT CAST(EXTRACT(EPOCH FROM now()) AS INTEGER),
  "updatedAt" INTEGER NOT NULL DEFAULT CAST(EXTRACT(EPOCH FROM now()) AS INTEGER),

  CONSTRAINT "StoredFile_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StoredFile_objectKey_key" ON "StoredFile" ("objectKey");
CREATE INDEX "StoredFile_projectKey_createdAt_idx" ON "StoredFile" ("projectKey", "createdAt");
CREATE INDEX "StoredFile_projectKey_sourceUrl_idx" ON "StoredFile" ("projectKey", "sourceUrl");
CREATE INDEX "StoredFile_status_idx" ON "StoredFile" ("status");

ALTER TABLE "StoredFile"
  ADD CONSTRAINT "StoredFile_projectKey_fkey"
  FOREIGN KEY ("projectKey") REFERENCES "Project" ("projectKey")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StoredFile"
  ADD CONSTRAINT "StoredFile_storageBackendId_fkey"
  FOREIGN KEY ("storageBackendId") REFERENCES "StorageBackend" ("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Project"
  ADD COLUMN "storageBackendId" TEXT,
  ADD COLUMN "mirrorGithubAssets" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Project"
  ADD CONSTRAINT "Project_storageBackendId_fkey"
  FOREIGN KEY ("storageBackendId") REFERENCES "StorageBackend" ("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
