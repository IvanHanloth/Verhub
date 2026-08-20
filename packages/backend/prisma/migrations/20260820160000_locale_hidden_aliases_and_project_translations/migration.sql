-- 三件事：
-- 1) 公告译文行升级成「某个语言下的覆盖设置」：title / content 改可空（留空即回落
--    默认内容），新增 isHidden（该语言下整条不返回）。三个维度彼此独立，因此
--    「只想对英文用户藏起来、又不想写英文译文」是可表达的——只留 isHidden 即可。
-- 2) ProjectLocale 加同义标签：命中其中任何一个都等价于命中主标签（多对一）。
--    只认显式列出的，不做 en-* 前缀自动回退。
-- 3) 新增 ProjectTranslation：项目名称与描述的译文，与公告译文同一套语义。
--
-- 无回填：存量译文行的 title / content 本来就非空，语义不变；aliases 缺省为空数组。

ALTER TABLE "AnnouncementTranslation"
  ADD COLUMN "isHidden" BOOLEAN NOT NULL DEFAULT false,
  ALTER COLUMN "title" DROP NOT NULL,
  ALTER COLUMN "content" DROP NOT NULL;

ALTER TABLE "ProjectLocale"
  ADD COLUMN "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[];

CREATE TABLE "ProjectTranslation" (
    "projectKey" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "name" TEXT,
    "description" TEXT,
    "createdAt" INTEGER NOT NULL DEFAULT CAST(EXTRACT(EPOCH FROM now()) AS INTEGER),
    "updatedAt" INTEGER NOT NULL DEFAULT CAST(EXTRACT(EPOCH FROM now()) AS INTEGER),

    CONSTRAINT "ProjectTranslation_pkey" PRIMARY KEY ("projectKey","locale")
);

CREATE INDEX "ProjectTranslation_projectKey_idx" ON "ProjectTranslation"("projectKey");

ALTER TABLE "ProjectTranslation" ADD CONSTRAINT "ProjectTranslation_projectKey_fkey"
  FOREIGN KEY ("projectKey") REFERENCES "Project"("projectKey") ON DELETE CASCADE ON UPDATE CASCADE;
