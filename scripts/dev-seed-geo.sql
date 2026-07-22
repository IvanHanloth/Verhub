-- 开发用：为统计大屏的地域热力图灌入模拟流量。
-- 幂等：重跑前先删掉本脚本生成的行（endpoint 固定为 VERSION_CHECK_UPDATE 的模拟批次）。
-- 生产禁用。projectKey 按需改。

\set project 'ivanhanloth-boss-key'

-- 先清掉上一批模拟数据，避免 count 叠加到无法预期的量级。
DELETE FROM "ApiRequestStat"
WHERE "projectKey" = :'project'
  AND region NOT IN ('LOCAL', 'UNKNOWN')
  AND "cityCode" = 'seed';

-- 国家级（region=ISO alpha-2，无省码）。base 拉开梯度，让 visualMap 的密度色带看得出层次。
INSERT INTO "ApiRequestStat" (id, "projectKey", endpoint, "hourBucket", platform, region, "regionCode", "cityCode", count)
SELECT
  gen_random_uuid()::text,
  :'project',
  'VERSION_CHECK_UPDATE'::"PublicEndpoint",
  (floor(extract(epoch FROM now()) / 3600)::int - d * 24) * 3600,
  r.platform::"Platform",
  r.region,
  '',
  'seed',
  greatest(1, round(r.base * (0.6 + random() * 0.8))::int)
FROM (VALUES
  ('US', 'WINDOWS', 380),
  ('IN', 'ANDROID', 300),
  ('JP', 'IOS',     210),
  ('DE', 'LINUX',   160),
  ('GB', 'WINDOWS', 140),
  ('KR', 'ANDROID', 130),
  ('BR', 'ANDROID', 120),
  ('FR', 'MACOS',   110),
  ('RU', 'WINDOWS', 100),
  ('ID', 'ANDROID',  95),
  ('CA', 'MACOS',    90),
  ('VN', 'ANDROID',  85),
  ('AU', 'WINDOWS',  80),
  ('PH', 'ANDROID',  75),
  ('SG', 'IOS',      70),
  ('MX', 'ANDROID',  70),
  ('TH', 'ANDROID',  65),
  ('NL', 'LINUX',    60),
  ('MY', 'ANDROID',  60),
  ('TR', 'WINDOWS',  60),
  ('ES', 'MACOS',    55),
  ('IT', 'WINDOWS',  50),
  ('SA', 'IOS',      45),
  ('PL', 'WINDOWS',  45),
  ('SE', 'LINUX',    40),
  ('AE', 'IOS',      40),
  ('EG', 'ANDROID',  40),
  ('NG', 'ANDROID',  35),
  ('UA', 'WINDOWS',  35),
  ('ZA', 'ANDROID',  30)
) AS r(region, platform, base)
CROSS JOIN generate_series(0, 6) AS d;

-- 中国省级（region=CN，regionCode 为 GB/T 2260 省码）。这些行同时汇入国家维度的 CN，
-- 使 CN 在全球图里自然成为最高档；省份分布图按省码单独着色。
INSERT INTO "ApiRequestStat" (id, "projectKey", endpoint, "hourBucket", platform, region, "regionCode", "cityCode", count)
SELECT
  gen_random_uuid()::text,
  :'project',
  'VERSION_CHECK_UPDATE'::"PublicEndpoint",
  (floor(extract(epoch FROM now()) / 3600)::int - d * 24) * 3600,
  p.platform::"Platform",
  'CN',
  p.code,
  'seed',
  greatest(1, round(p.base * (0.6 + random() * 0.8))::int)
FROM (VALUES
  ('440000', 'ANDROID', 480),  -- 广东
  ('110000', 'WINDOWS', 320),  -- 北京
  ('310000', 'MACOS',   300),  -- 上海
  ('330000', 'ANDROID', 260),  -- 浙江
  ('320000', 'WINDOWS', 240),  -- 江苏
  ('510000', 'ANDROID', 180),  -- 四川
  ('370000', 'WINDOWS', 160),  -- 山东
  ('420000', 'ANDROID', 140),  -- 湖北
  ('410000', 'ANDROID', 130),  -- 河南
  ('350000', 'IOS',     120),  -- 福建
  ('500000', 'ANDROID', 110),  -- 重庆
  ('430000', 'ANDROID', 100),  -- 湖南
  ('340000', 'WINDOWS',  95),  -- 安徽
  ('610000', 'LINUX',    90),  -- 陕西
  ('360000', 'ANDROID',  70),  -- 江西
  ('530000', 'ANDROID',  60),  -- 云南
  ('450000', 'ANDROID',  55),  -- 广西
  ('810000', 'IOS',      50),  -- 香港
  ('230000', 'WINDOWS',  45),  -- 黑龙江
  ('220000', 'WINDOWS',  40),  -- 吉林
  ('710000', 'IOS',      30)   -- 台湾
) AS p(code, platform, base)
CROSS JOIN generate_series(0, 6) AS d;
