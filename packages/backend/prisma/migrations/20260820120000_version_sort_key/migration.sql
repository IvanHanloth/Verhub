-- comparableVersion 是 TEXT，字符串序把 "3.1.0-rc.2" 排在 "3.1.0" 之上，与 semver 语义相反
-- （版本列表分页、客户端更新检查的"最新版"判定都受影响）。补一列定长排序键，让数据库的
-- 字符串排序等价于语义排序。
--
-- 键的形状与 src/versions/version-comparator.ts 的 toComparableVersionSortKey 同构，
-- 改一边必须改另一边：core 4 段 + 预发布权重 1 位 + 预发布号 3 段，每段 10 位左补零，
-- 缺段补 0、超宽封顶为 9；正式版权重 9，恒大于 alpha(1) / beta(2) / rc(3)。

ALTER TABLE "Version" ADD COLUMN "comparableVersionSort" TEXT;

-- 回填。正则与 COMPARABLE_VERSION_PATTERN 一致，匹配不上的旧数据留 NULL：
-- 排序时靠 nulls last / IS NOT NULL 把它们挡在最新版判定之外。
WITH parsed AS (
  SELECT id, matched[1] AS core, matched[2] AS tag, matched[3] AS tail
  FROM (
    SELECT
      id,
      regexp_match(
        "comparableVersion",
        '^(\d+(?:\.\d+)*)(?:-(alpha|beta|rc)(?:\.(\d+(?:\.\d+)*))?)?$'
      ) AS matched
    FROM "Version"
    WHERE "comparableVersion" IS NOT NULL
  ) AS raw
  WHERE matched IS NOT NULL
), segments AS (
  SELECT
    id,
    tag,
    split_part(core, '.', 1) AS c1,
    split_part(core, '.', 2) AS c2,
    split_part(core, '.', 3) AS c3,
    split_part(core, '.', 4) AS c4,
    split_part(coalesce(tail, ''), '.', 1) AS p1,
    split_part(coalesce(tail, ''), '.', 2) AS p2,
    split_part(coalesce(tail, ''), '.', 3) AS p3
  FROM parsed
)
UPDATE "Version" AS v
SET "comparableVersionSort" =
     CASE WHEN s.c1 = '' THEN '0000000000' WHEN length(s.c1) > 10 THEN '9999999999' ELSE lpad(s.c1, 10, '0') END
  || CASE WHEN s.c2 = '' THEN '0000000000' WHEN length(s.c2) > 10 THEN '9999999999' ELSE lpad(s.c2, 10, '0') END
  || CASE WHEN s.c3 = '' THEN '0000000000' WHEN length(s.c3) > 10 THEN '9999999999' ELSE lpad(s.c3, 10, '0') END
  || CASE WHEN s.c4 = '' THEN '0000000000' WHEN length(s.c4) > 10 THEN '9999999999' ELSE lpad(s.c4, 10, '0') END
  || CASE s.tag WHEN 'alpha' THEN '1' WHEN 'beta' THEN '2' WHEN 'rc' THEN '3' ELSE '9' END
  || CASE WHEN s.p1 = '' THEN '0000000000' WHEN length(s.p1) > 10 THEN '9999999999' ELSE lpad(s.p1, 10, '0') END
  || CASE WHEN s.p2 = '' THEN '0000000000' WHEN length(s.p2) > 10 THEN '9999999999' ELSE lpad(s.p2, 10, '0') END
  || CASE WHEN s.p3 = '' THEN '0000000000' WHEN length(s.p3) > 10 THEN '9999999999' ELSE lpad(s.p3, 10, '0') END
FROM segments AS s
WHERE v.id = s.id;

CREATE INDEX "Version_projectKey_comparableVersionSort_idx"
  ON "Version"("projectKey", "comparableVersionSort");
