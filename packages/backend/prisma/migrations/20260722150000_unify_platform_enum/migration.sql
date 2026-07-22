-- 平台维度统一：ClientPlatform + StatPlatform 合并为单一 Platform，新增 LINUX，
-- MAC 更名 MACOS，StatPlatform.UNKNOWN 归入 OTHERS；具体系统版本改由自由文本
-- platformVersion 承载（明细表加列 + 独立的小时汇总表）。
--
-- 全程用 ALTER COLUMN ... TYPE ... USING 就地转换，而非 Prisma 默认生成的
-- DROP COLUMN + ADD COLUMN：后者会把所有存量平台数据清空。就地转换会自动
-- 重建依赖的唯一索引，因此无需 DROP/CREATE INDEX。
--
-- 存量值映射 MAC -> MACOS、UNKNOWN -> OTHERS，其余同名平移。没有两个源值映射到
-- 同一目标，所以聚合表的唯一索引不会因合并而出现重复行。

-- CreateEnum
CREATE TYPE "Platform" AS ENUM ('WINDOWS', 'LINUX', 'MACOS', 'IOS', 'ANDROID', 'WEB', 'OTHERS');

-- 聚合表：默认值必须先摘掉，'UNKNOWN'::"StatPlatform" 无法转成新类型。
ALTER TABLE "ApiRequestStat" ALTER COLUMN "platform" DROP DEFAULT;
ALTER TABLE "ApiRequestStat"
  ALTER COLUMN "platform" TYPE "Platform" USING (
    CASE "platform"::text WHEN 'MAC' THEN 'MACOS' WHEN 'UNKNOWN' THEN 'OTHERS' ELSE "platform"::text END
  )::"Platform";
ALTER TABLE "ApiRequestStat" ALTER COLUMN "platform" SET DEFAULT 'OTHERS';

ALTER TABLE "ClientVersionStat" ALTER COLUMN "platform" DROP DEFAULT;
ALTER TABLE "ClientVersionStat"
  ALTER COLUMN "platform" TYPE "Platform" USING (
    CASE "platform"::text WHEN 'MAC' THEN 'MACOS' WHEN 'UNKNOWN' THEN 'OTHERS' ELSE "platform"::text END
  )::"Platform";
ALTER TABLE "ClientVersionStat" ALTER COLUMN "platform" SET DEFAULT 'OTHERS';

-- 明细表：可空，无默认值，NULL 保持 NULL（CASE 对 NULL 返回 NULL）。
ALTER TABLE "ActionRecord"
  ALTER COLUMN "platform" TYPE "Platform" USING (
    CASE "platform"::text WHEN 'MAC' THEN 'MACOS' ELSE "platform"::text END
  )::"Platform",
  ADD COLUMN "platformVersion" TEXT;

ALTER TABLE "Feedback"
  ALTER COLUMN "platform" TYPE "Platform" USING (
    CASE "platform"::text WHEN 'MAC' THEN 'MACOS' ELSE "platform"::text END
  )::"Platform",
  ADD COLUMN "platformVersion" TEXT;

ALTER TABLE "Log"
  ALTER COLUMN "platform" TYPE "Platform" USING (
    CASE "platform"::text WHEN 'MAC' THEN 'MACOS' ELSE "platform"::text END
  )::"Platform",
  ADD COLUMN "platformVersion" TEXT;

-- 发布目标：数组列同样先摘默认值。逐元素映射走 array_replace 而不是
-- ARRAY(SELECT ... FROM unnest(...))：USING 表达式里不允许出现子查询。
ALTER TABLE "Version" ALTER COLUMN "platforms" DROP DEFAULT;
ALTER TABLE "Version"
  ALTER COLUMN "platforms" TYPE "Platform"[]
    USING array_replace("platforms"::text[], 'MAC', 'MACOS')::"Platform"[],
  ALTER COLUMN "platform" TYPE "Platform" USING (
    CASE "platform"::text WHEN 'MAC' THEN 'MACOS' ELSE "platform"::text END
  )::"Platform";
ALTER TABLE "Version" ALTER COLUMN "platforms" SET DEFAULT ARRAY[]::"Platform"[];

ALTER TABLE "Announcement" ALTER COLUMN "platforms" DROP DEFAULT;
ALTER TABLE "Announcement"
  ALTER COLUMN "platforms" TYPE "Platform"[]
    USING array_replace("platforms"::text[], 'MAC', 'MACOS')::"Platform"[];
ALTER TABLE "Announcement" ALTER COLUMN "platforms" SET DEFAULT ARRAY[]::"Platform"[];

-- DropEnum
DROP TYPE "ClientPlatform";
DROP TYPE "StatPlatform";

-- CreateTable
CREATE TABLE "PlatformVersionStat" (
    "id" TEXT NOT NULL,
    "projectKey" TEXT NOT NULL,
    "hourBucket" INTEGER NOT NULL,
    "platform" "Platform" NOT NULL DEFAULT 'OTHERS',
    "platformVersion" TEXT NOT NULL DEFAULT '',
    "count" INTEGER NOT NULL DEFAULT 0,
    "createdAt" INTEGER NOT NULL DEFAULT CAST(EXTRACT(EPOCH FROM now()) AS INTEGER),
    "updatedAt" INTEGER NOT NULL DEFAULT CAST(EXTRACT(EPOCH FROM now()) AS INTEGER),

    CONSTRAINT "PlatformVersionStat_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PlatformVersionStat_projectKey_hourBucket_idx" ON "PlatformVersionStat"("projectKey", "hourBucket");

-- CreateIndex
CREATE INDEX "PlatformVersionStat_hourBucket_idx" ON "PlatformVersionStat"("hourBucket");

-- CreateIndex
CREATE UNIQUE INDEX "PlatformVersionStat_projectKey_hourBucket_platform_platform_key" ON "PlatformVersionStat"("projectKey", "hourBucket", "platform", "platformVersion");

-- AddForeignKey
ALTER TABLE "PlatformVersionStat" ADD CONSTRAINT "PlatformVersionStat_projectKey_fkey" FOREIGN KEY ("projectKey") REFERENCES "Project"("projectKey") ON DELETE CASCADE ON UPDATE CASCADE;
