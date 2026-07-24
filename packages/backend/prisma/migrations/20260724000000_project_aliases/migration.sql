-- 项目改名后保留的旧 Project Key。旧 key 作为别名指回当前项目，
-- 使旧 key 仍能透明访问到项目内容（见 ProjectResolverService）。
CREATE TABLE "ProjectAlias" (
  "alias" TEXT NOT NULL,
  "projectKey" TEXT NOT NULL,
  "createdAt" INTEGER NOT NULL DEFAULT CAST(EXTRACT(EPOCH FROM now()) AS INTEGER),

  CONSTRAINT "ProjectAlias_pkey" PRIMARY KEY ("alias")
);

-- 反查某项目的全部别名（后台展示、改名时把旧别名迁到新 key）。
CREATE INDEX "ProjectAlias_projectKey_idx" ON "ProjectAlias" ("projectKey");

-- onUpdate CASCADE：项目再次改名（projectKey 变更）时，别名自动跟到新 key，
-- 别名链始终扁平指向当前项目。onDelete CASCADE：删项目一并清掉其别名。
ALTER TABLE "ProjectAlias"
  ADD CONSTRAINT "ProjectAlias_projectKey_fkey"
  FOREIGN KEY ("projectKey") REFERENCES "Project" ("projectKey")
  ON DELETE CASCADE ON UPDATE CASCADE;
