-- 版本列表默认按 (projectKey, comparableVersion desc) 分页，原先只有
-- (projectKey, createdAt) 索引，comparableVersion 排序退化为内存排序。
-- 补一条复合索引让排序走索引。

CREATE INDEX "Version_projectKey_comparableVersion_idx" ON "Version"("projectKey", "comparableVersion");
