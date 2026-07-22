-- 国内来源精确到省市：给 IP 缓存与请求聚合表加省/市级行政区划码（GB/T 2260）。
-- 聚合按码分组而非中文名，规避各家 provider 命名不一致（「辽宁省」vs「辽宁」）导致的分桶碎片。

-- 缓存表：可空，仅国内 provider 命中时有值。
ALTER TABLE "IpGeoCache"
  ADD COLUMN "regionCode" TEXT,
  ADD COLUMN "cityCode" TEXT;

-- 聚合表：空串 sentinel 而非 NULL —— Postgres unique 视 NULL 互异，NULL 会让
-- upsert-increment 每次插新行而非累加（与既有 region/platform 同理）。
ALTER TABLE "ApiRequestStat"
  ADD COLUMN "regionCode" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "cityCode" TEXT NOT NULL DEFAULT '';

-- 唯一约束纳入两个新维度。索引名沿用截断后的 "regi_key"：新列虽更长，Prisma 截断到
-- 63 字符上限时落点不变（前 59 字符 + "_key"），手写全名会让 Postgres 截断出不同结果导致 schema 漂移。
DROP INDEX "ApiRequestStat_projectKey_endpoint_hourBucket_platform_regi_key";

CREATE UNIQUE INDEX "ApiRequestStat_projectKey_endpoint_hourBucket_platform_regi_key"
  ON "ApiRequestStat" ("projectKey", "endpoint", "hourBucket", "platform", "region", "regionCode", "cityCode");
