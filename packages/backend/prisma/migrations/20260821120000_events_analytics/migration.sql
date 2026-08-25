-- 行为采集从「预先登记的 Action + 明细记录」换成「自动发现的事件 + 汇总 + 明细」。
-- 旧模型零集成（无任何接入方使用过），因此直接替换，不做数据迁移。

-- 端点枚举随之改名。用 RENAME VALUE 而非新增+删除：枚举序数不变，
-- ApiRequestStat 里既有的行不必重写，也不会在 Prisma 侧产生漂移。
ALTER TYPE "PublicEndpoint" RENAME VALUE 'ACTION_RECORD' TO 'EVENT_INGEST';

DROP TABLE "ActionRecord";
DROP TABLE "Action";

-- 事件采集的运营者总开关，以及独立于统计的更短明细保留期。
ALTER TABLE "Project"
  ADD COLUMN "eventCollectionEnabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "eventRetentionDays" INTEGER NOT NULL DEFAULT 90;

-- 事件定义：采集端第一次见到某个事件名时自动建行，不是上报的前置条件。
CREATE TABLE "EventDefinition" (
    "id" TEXT NOT NULL,
    "projectKey" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "displayName" TEXT,
    "description" TEXT,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "firstSeenAt" INTEGER NOT NULL DEFAULT CAST(EXTRACT(EPOCH FROM now()) AS INTEGER),
    "lastSeenAt" INTEGER NOT NULL DEFAULT CAST(EXTRACT(EPOCH FROM now()) AS INTEGER),
    "createdAt" INTEGER NOT NULL DEFAULT CAST(EXTRACT(EPOCH FROM now()) AS INTEGER),
    "updatedAt" INTEGER NOT NULL DEFAULT CAST(EXTRACT(EPOCH FROM now()) AS INTEGER),

    CONSTRAINT "EventDefinition_pkey" PRIMARY KEY ("id")
);

-- 事件明细：漏斗/留存/路径的唯一数据源，汇总表丢了 distinctId 维度。
-- 没有 dedupHash：eventId 幂等键精确解决重试补发的重复，模糊的内容指纹会把
-- 「用户连点三次」折叠成一次，而那正是行为分析要看的信号。
CREATE TABLE "EventRecord" (
    "id" TEXT NOT NULL,
    "projectKey" TEXT NOT NULL,
    "eventName" TEXT NOT NULL,
    "distinctId" TEXT NOT NULL,
    "sessionId" TEXT,
    "eventId" TEXT NOT NULL,
    "occurredAt" INTEGER NOT NULL,
    "receivedAt" INTEGER NOT NULL DEFAULT CAST(EXTRACT(EPOCH FROM now()) AS INTEGER),
    "properties" JSONB,
    "ip" TEXT,
    "userAgent" TEXT,
    "countryCode" TEXT,
    "countryName" TEXT,
    "regionName" TEXT,
    "city" TEXT,
    "platform" "Platform",
    "platformVersion" TEXT,

    CONSTRAINT "EventRecord_pkey" PRIMARY KEY ("id")
);

-- 事件量的小时汇总。维度列 NOT NULL + 显式哨兵，理由同 ApiRequestStat：
-- Postgres 的 unique 索引视 NULL 互异，用 NULL 会静默破坏 upsert-increment。
CREATE TABLE "EventStat" (
    "id" TEXT NOT NULL,
    "projectKey" TEXT NOT NULL,
    "eventName" TEXT NOT NULL,
    "hourBucket" INTEGER NOT NULL,
    "platform" "Platform" NOT NULL DEFAULT 'OTHERS',
    "region" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "regionCode" TEXT NOT NULL DEFAULT '',
    "cityCode" TEXT NOT NULL DEFAULT '',
    "count" INTEGER NOT NULL DEFAULT 0,
    "createdAt" INTEGER NOT NULL DEFAULT CAST(EXTRACT(EPOCH FROM now()) AS INTEGER),
    "updatedAt" INTEGER NOT NULL DEFAULT CAST(EXTRACT(EPOCH FROM now()) AS INTEGER),

    CONSTRAINT "EventStat_pkey" PRIMARY KEY ("id")
);

-- 按自然日去重的活跃标识，留存矩阵靠它算人群交集。
CREATE TABLE "EventActiveUser" (
    "id" TEXT NOT NULL,
    "projectKey" TEXT NOT NULL,
    "dayBucket" INTEGER NOT NULL,
    "distinctId" TEXT NOT NULL,

    CONSTRAINT "EventActiveUser_pkey" PRIMARY KEY ("id")
);

-- 看板卡片，只存查询定义不存结果。
CREATE TABLE "EventDashboardCard" (
    "id" TEXT NOT NULL,
    "projectKey" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "query" JSONB NOT NULL,
    "layout" JSONB,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" INTEGER NOT NULL DEFAULT CAST(EXTRACT(EPOCH FROM now()) AS INTEGER),
    "updatedAt" INTEGER NOT NULL DEFAULT CAST(EXTRACT(EPOCH FROM now()) AS INTEGER),

    CONSTRAINT "EventDashboardCard_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "EventDefinition_projectKey_archived_lastSeenAt_idx" ON "EventDefinition"("projectKey", "archived", "lastSeenAt");
CREATE UNIQUE INDEX "EventDefinition_projectKey_name_key" ON "EventDefinition"("projectKey", "name");

CREATE INDEX "EventRecord_projectKey_eventName_occurredAt_idx" ON "EventRecord"("projectKey", "eventName", "occurredAt");

-- 漏斗/留存/路径的主力索引：这三种分析都是「按人取时间序列」。
CREATE INDEX "EventRecord_projectKey_distinctId_occurredAt_idx" ON "EventRecord"("projectKey", "distinctId", "occurredAt");

CREATE INDEX "EventRecord_projectKey_sessionId_occurredAt_idx" ON "EventRecord"("projectKey", "sessionId", "occurredAt");
CREATE INDEX "EventRecord_projectKey_occurredAt_idx" ON "EventRecord"("projectKey", "occurredAt");

-- 客户端幂等键。离线队列重试补发时靠它去重，配合 createMany 的 skipDuplicates。
CREATE UNIQUE INDEX "EventRecord_projectKey_eventId_key" ON "EventRecord"("projectKey", "eventId");

-- 属性筛选与分组统计走 JSONB 包含查询。jsonb_path_ops 比默认算子类小得多，
-- 代价是只支持 @> —— 而按属性等值筛选正是这里唯一需要的形状。
CREATE INDEX "EventRecord_properties_idx" ON "EventRecord" USING GIN ("properties" jsonb_path_ops);

CREATE INDEX "EventStat_projectKey_hourBucket_idx" ON "EventStat"("projectKey", "hourBucket");
CREATE INDEX "EventStat_hourBucket_idx" ON "EventStat"("hourBucket");

-- 名字是 Prisma 对 @@unique 的截断结果（63 字符上限，注意结尾是 "_region_r_key"）。
-- 写全名会让 Postgres 用不同方式截断，schema 从此永久漂移。同 ApiRequestStat。
CREATE UNIQUE INDEX "EventStat_projectKey_eventName_hourBucket_platform_region_r_key" ON "EventStat"("projectKey", "eventName", "hourBucket", "platform", "region", "regionCode", "cityCode");

CREATE INDEX "EventActiveUser_projectKey_dayBucket_idx" ON "EventActiveUser"("projectKey", "dayBucket");
CREATE INDEX "EventActiveUser_projectKey_distinctId_idx" ON "EventActiveUser"("projectKey", "distinctId");
CREATE UNIQUE INDEX "EventActiveUser_projectKey_dayBucket_distinctId_key" ON "EventActiveUser"("projectKey", "dayBucket", "distinctId");

CREATE INDEX "EventDashboardCard_projectKey_sortOrder_idx" ON "EventDashboardCard"("projectKey", "sortOrder");

ALTER TABLE "EventDefinition" ADD CONSTRAINT "EventDefinition_projectKey_fkey" FOREIGN KEY ("projectKey") REFERENCES "Project"("projectKey") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EventRecord" ADD CONSTRAINT "EventRecord_projectKey_fkey" FOREIGN KEY ("projectKey") REFERENCES "Project"("projectKey") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EventStat" ADD CONSTRAINT "EventStat_projectKey_fkey" FOREIGN KEY ("projectKey") REFERENCES "Project"("projectKey") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EventActiveUser" ADD CONSTRAINT "EventActiveUser_projectKey_fkey" FOREIGN KEY ("projectKey") REFERENCES "Project"("projectKey") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EventDashboardCard" ADD CONSTRAINT "EventDashboardCard_projectKey_fkey" FOREIGN KEY ("projectKey") REFERENCES "Project"("projectKey") ON DELETE CASCADE ON UPDATE CASCADE;
