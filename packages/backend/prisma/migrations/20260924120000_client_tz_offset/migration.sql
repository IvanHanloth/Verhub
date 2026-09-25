-- 客户端上报的 UTC 偏移（分钟）进入请求与事件的小时汇总，热力图据此按用户当地时间折叠。
-- 已有行统一落哨兵 -32768（未上报），热力图对它们照旧按国家码近似。
ALTER TABLE "ApiRequestStat" ADD COLUMN "tzOffset" INTEGER NOT NULL DEFAULT -32768;
ALTER TABLE "EventStat" ADD COLUMN "tzOffset" INTEGER NOT NULL DEFAULT -32768;

-- 唯一约束纳入新维度。索引名沿用 Prisma 截断后的名字（前 59 字符 + "_key"），
-- 加列不改变截断落点，手写全名会让 Postgres 截断出不同结果导致 schema 漂移。
DROP INDEX "ApiRequestStat_projectKey_endpoint_hourBucket_platform_regi_key";
CREATE UNIQUE INDEX "ApiRequestStat_projectKey_endpoint_hourBucket_platform_regi_key"
  ON "ApiRequestStat" ("projectKey", "endpoint", "hourBucket", "platform", "region", "regionCode", "cityCode", "tzOffset");

DROP INDEX "EventStat_projectKey_eventName_hourBucket_platform_region_r_key";
CREATE UNIQUE INDEX "EventStat_projectKey_eventName_hourBucket_platform_region_r_key"
  ON "EventStat" ("projectKey", "eventName", "hourBucket", "platform", "region", "regionCode", "cityCode", "tzOffset");
