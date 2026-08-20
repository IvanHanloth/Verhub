-- 公告的两项扩展：
-- 1) 可见版本范围（闭区间，两端可空）。范围过滤要能在 SQL 层做，所以除了原始值
--    再存一对定长排序键，生成规则与 Version.comparableVersionSort 完全相同
--    （见 src/versions/version-comparator.ts 的 toComparableVersionSortKey）。
-- 2) 多语言译文。默认内容仍在 Announcement 自身，译文只是覆盖层，
--    请求的语言没有对应行就回落默认内容。译文语言必须先在 ProjectLocale 注册。
--
-- 无回填：存量公告没有范围也没有译文，语义天然就是「不限 + 只有默认内容」。

ALTER TABLE "Announcement"
  ADD COLUMN "minComparableVersion"     TEXT,
  ADD COLUMN "maxComparableVersion"     TEXT,
  ADD COLUMN "minComparableVersionSort" TEXT,
  ADD COLUMN "maxComparableVersionSort" TEXT;

CREATE TABLE "ProjectLocale" (
    "projectKey" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "label" TEXT,
    "createdAt" INTEGER NOT NULL DEFAULT CAST(EXTRACT(EPOCH FROM now()) AS INTEGER),

    CONSTRAINT "ProjectLocale_pkey" PRIMARY KEY ("projectKey","locale")
);

CREATE TABLE "AnnouncementTranslation" (
    "announcementId" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" INTEGER NOT NULL DEFAULT CAST(EXTRACT(EPOCH FROM now()) AS INTEGER),
    "updatedAt" INTEGER NOT NULL DEFAULT CAST(EXTRACT(EPOCH FROM now()) AS INTEGER),

    CONSTRAINT "AnnouncementTranslation_pkey" PRIMARY KEY ("announcementId","locale")
);

CREATE INDEX "ProjectLocale_projectKey_idx" ON "ProjectLocale"("projectKey");

CREATE INDEX "AnnouncementTranslation_announcementId_idx" ON "AnnouncementTranslation"("announcementId");

ALTER TABLE "ProjectLocale" ADD CONSTRAINT "ProjectLocale_projectKey_fkey"
  FOREIGN KEY ("projectKey") REFERENCES "Project"("projectKey") ON DELETE CASCADE ON UPDATE CASCADE;

-- 删公告连带删它的译文；注销语言不删译文（那是应用层的策略，重新注册即恢复）。
ALTER TABLE "AnnouncementTranslation" ADD CONSTRAINT "AnnouncementTranslation_announcementId_fkey"
  FOREIGN KEY ("announcementId") REFERENCES "Announcement"("id") ON DELETE CASCADE ON UPDATE CASCADE;
