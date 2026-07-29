-- 反馈的 GitHub Issue 转发结果：是否已转发，以及生成的 Issue 编号与链接。
-- 存量行一律视为未转发：这个能力上线前不存在被转发的反馈。
ALTER TABLE "Feedback"
  ADD COLUMN "forwardedToGithub" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "githubIssueNumber" INTEGER,
  ADD COLUMN "githubIssueUrl" TEXT;
