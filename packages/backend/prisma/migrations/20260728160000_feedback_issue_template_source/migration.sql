-- 反馈 Issue 模板：实例级「是否自定义」开关，项目级模板来源（跟随实例 / 自定义 / 仓库文件）
ALTER TABLE "GithubAppConfig"
  ADD COLUMN "feedbackIssueCustomTemplate" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "ProjectGithubIntegration"
  ADD COLUMN "feedbackIssueTemplateSource" TEXT NOT NULL DEFAULT 'inherit',
  ADD COLUMN "feedbackIssueTemplateRepoPath" TEXT,
  ADD COLUMN "feedbackIssueTemplateRepoRef" TEXT;

-- 已经写过项目级模板的行保持原行为：迁移前项目模板一律优先于实例模板。
UPDATE "ProjectGithubIntegration"
SET "feedbackIssueTemplateSource" = 'custom'
WHERE "feedbackIssueTitleTemplate" IS NOT NULL
   OR "feedbackIssueBodyTemplate" IS NOT NULL;
