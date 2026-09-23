-- 实例级 CDN 缓存刷新配置，单行表，id 恒为 'default'。
CREATE TABLE "CdnConfig" (
  "id" TEXT NOT NULL DEFAULT 'default',
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "provider" TEXT NOT NULL DEFAULT 'aliyun',
  "accessKeyId" TEXT,
  "accessKeySecretEncrypted" TEXT,
  "accessKeySecretFingerprint" TEXT,
  "updatedAt" INTEGER NOT NULL DEFAULT CAST(EXTRACT(EPOCH FROM now()) AS INTEGER),

  CONSTRAINT "CdnConfig_pkey" PRIMARY KEY ("id")
);
