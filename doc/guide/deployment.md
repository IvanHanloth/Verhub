# 部署指南

本文提供 Verhub 的推荐部署方式与生产环境建议。

## 镜像策略说明

Verhub 当前通过两个渠道提供镜像：

- Docker hub
  - `docker.io/ivanhanloth/verhub-backend`
  - `docker.io/ivanhanloth/verhub-frontend`
- GitHub Container Registry
  - `ghcr.io/ivanhanloth/verhub-backend`
  - `ghcr.io/ivanhanloth/verhub-frontend`

我们没有提供统一镜像的原因：

1. 前后端可以独立扩展与回滚
2. 资源配额与扩缩容策略可独立设置
3. 生产问题定位更直接

## 方案一：Docker Compose（推荐）

适用于大多数中小团队与自建部署场景。

### 1) 准备 docker-compose 模板

建议在部署目录创建 `docker-compose.yml`：

```yaml
name: verhub

networks:
  verhub-net:
    driver: bridge

services:
  postgres:
    image: postgres:16-alpine
    container_name: verhub-postgres
    restart: unless-stopped
    networks:
      - verhub-net
    environment:
      POSTGRES_DB: ${VERHUB_POSTGRES_DB:-verhub}
      POSTGRES_USER: ${VERHUB_POSTGRES_USER:-verhub}
      POSTGRES_PASSWORD: ${VERHUB_POSTGRES_PASSWORD}
    healthcheck:
      test:
        - CMD-SHELL
        - pg_isready -U ${VERHUB_POSTGRES_USER:-verhub} -d ${VERHUB_POSTGRES_DB:-verhub}
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 10s
    volumes:
      - postgres-data:/var/lib/postgresql/data
    logging: &default-logging
      driver: "json-file"
      options:
        max-size: "20m" # 单个日志文件最大 20MB
        max-file: "3" # 最多保留 3 个旧文件

  backend:
    image: ${VERHUB_BACKEND_IMAGE:-ivanhanloth/verhub-backend}:${VERHUB_TAG:-latest}
    container_name: verhub-backend
    restart: unless-stopped
    networks:
      - verhub-net
    environment:
      NODE_ENV: production
      PORT: 4000
      DATABASE_URL: postgresql://${VERHUB_POSTGRES_USER:-verhub}:${VERHUB_POSTGRES_PASSWORD}@postgres:5432/${VERHUB_POSTGRES_DB:-verhub}?schema=public
      JWT_SECRET: ${JWT_SECRET}
      JWT_EXPIRES_IN: ${JWT_EXPIRES_IN:-2h}
      ADMIN_PASSWORD: ${ADMIN_PASSWORD:-}
      BOOTSTRAP_SECRET_DIR: /bootstrap
      API_KEY_SALT: ${API_KEY_SALT}
      VERHUB_DIST_BASE_URL: ${VERHUB_DIST_BASE_URL:-}
      VERHUB_UPLOAD_MAX_MB: ${VERHUB_UPLOAD_MAX_MB:-4096}
    depends_on:
      postgres:
        condition: service_healthy
    healthcheck:
      test:
        - CMD-SHELL
        - node -e "fetch('http://127.0.0.1:4000/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 15s
    volumes:
      - bootstrap-secrets:/bootstrap
      - storage-data:/var/lib/verhub/storage
    logging: *default-logging

  frontend:
    image: ${VERHUB_FRONTEND_IMAGE:-ivanhanloth/verhub-frontend}:${VERHUB_TAG:-latest}
    container_name: verhub-frontend
    restart: unless-stopped
    networks:
      - verhub-net
    environment:
      NEXT_PUBLIC_SITE_URL: ${NEXT_PUBLIC_SITE_URL:-}
      VERHUB_DIST_BASE_URL: ${VERHUB_DIST_BASE_URL:-}
      VERHUB_DIST_CACHE_MAX_SIZE: ${VERHUB_DIST_CACHE_MAX_SIZE:-10g}
    depends_on:
      backend:
        condition: service_healthy
    healthcheck:
      test:
        - CMD-SHELL
        - wget --no-verbose --tries=1 --spider http://127.0.0.1/healthz || exit 1
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 15s
    ports:
      - "${VERHUB_HTTP_PORT:-80}:80"
      - "${VERHUB_HTTPS_PORT:-443}:443"
    volumes:
      - dist-cache:/var/cache/nginx/verhub-dist
    logging: *default-logging

volumes:
  postgres-data:
  bootstrap-secrets:
  storage-data:
  dist-cache:
```

### 2) 准备 .env 模板

在同目录创建 `.env`：

```dotenv
# 镜像版本（latest 或 v1.0.0）
VERHUB_TAG=latest

# 如果要切换到 GHCR，可改成：ghcr.io/ivanhanloth/verhub-backend / verhub-frontend
VERHUB_BACKEND_IMAGE=ivanhanloth/verhub-backend
VERHUB_FRONTEND_IMAGE=ivanhanloth/verhub-frontend

# PostgreSQL
VERHUB_POSTGRES_DB=verhub
VERHUB_POSTGRES_USER=verhub
VERHUB_POSTGRES_PASSWORD=change-this-strong-db-password

# Backend 必填安全项
JWT_SECRET=please-change-this-jwt-secret
API_KEY_SALT=please-change-this-api-key-salt

# Backend 可选
JWT_EXPIRES_IN=2h
ADMIN_PASSWORD=

# 源站前面的可信反代层数。默认 1（自带的 nginx 网关）；套 CDN 上线时改成 2，
# 否则统计与日志里会记成 CDN 边缘节点的地址。详见下方「套 CDN 上线」。
VERHUB_TRUSTED_PROXY_COUNT=1
# 只认这些头里的客户端地址（逗号分隔）。留空即用内置清单：
# cf-connecting-ip / true-client-ip / eo-client-ip / ali-cdn-real-ip /
# fastly-client-ip → x-forwarded-for → x-real-ip
VERHUB_CLIENT_IP_HEADER=

# 来源地区解析（统计大屏的「来源地区」）。解析走公开免费接口，默认按
# pconline.com.cn（太平洋科技）→ cz88.net（纯真网络）→ ipwho.is
# → freeipapi.com → ipapi.co → ip-api.com 顺序回退（国内两家优先，
# 境外 IP 自动落到后面的国际供应商）。结果持久缓存在数据库，同一 IP 只解析一次。
# 内网部署或不允许后端出网时设为 false，届时地区一律记为 UNKNOWN。
VERHUB_GEO_ENABLED=true
# 逗号分隔，覆盖默认顺序；留空即用全部
VERHUB_GEO_PROVIDERS=
VERHUB_GEO_TTL_DAYS=30
# 整条回退链的总超时（不是每家的超时），超预算即记为 UNKNOWN
VERHUB_GEO_TIMEOUT_MS=2500

# 上报去重窗口（秒）。窗口内同一调用方提交完全相同的日志/反馈只保留第一条，
# 用于挡住崩溃重试循环与重复点击。设为 0 关闭。
# 行为事件不走这套模糊抑制：它靠客户端幂等键精确去重，因为「用户连点了三次」
# 在行为分析里是有意义的信号，折叠掉会失真。
VERHUB_DEDUP_WINDOW_SECONDS=60

# 公开上报接口（日志/反馈/事件/检查更新）单 IP 每分钟限流次数。按上面解析出的
# 真实客户端 IP 计数；调大可放宽，过大则失去防洪泛意义。
VERHUB_PUBLIC_RATE_LIMIT=300

# 单次事件上报的条数上限。SDK 默认攒 20 条一批，这里给的是服务端的硬上限。
VERHUB_EVENT_BATCH_MAX=50

# 客户端声明的事件发生时间的可信窗口（秒，往前）。离线补发要求信任客户端时间，
# 但不能让时钟错乱的设备把数据写进远古的桶里；超出即回退到服务端接收时间。
# 往未来的容忍固定为 5 分钟。
VERHUB_EVENT_CLOCK_SKEW_SECONDS=604800

# 事件明细里怎么保存 IP：full（完整）/ anonymized（默认，IPv4 截末段、IPv6 截末 80 位）
# / none（不保存）。归属地推断在匿名化之前用完整地址完成，因此地区统计精度不受影响。
# 事件量比日志大一个数量级且用途是聚合分析，默认匿名化是有意的收敛。
VERHUB_EVENT_IP_STORAGE=anonymized

# 反馈转发到 GitHub Issue 的额外限流：单 IP 在 TTL 秒内最多转发多少条。
# 比上面那道严得多，因为每次转发都会往仓库里真建一条 Issue。
VERHUB_GITHUB_FORWARD_RATE_LIMIT=3
VERHUB_GITHUB_FORWARD_RATE_TTL=3600

# 文件分发域名（origin，不带路径），如 https://cdn.verhub.example.com。
# 前后端容器都读取它：后端用它生成直链，前端网关据此把该域名限定为只提供 /f/ 直链。
# 留空则直链挂在任意访问域名下，且 GitHub 附件镜像不可用。详见下方「文件分发与 CDN」。
VERHUB_DIST_BASE_URL=
# 单个文件大小上限（MB），上传与 GitHub 附件镜像共用
VERHUB_UPLOAD_MAX_MB=4096
# 网关对 WebDAV 文件的分片缓存上限（nginx 容量写法，如 10g、500m）
VERHUB_DIST_CACHE_MAX_SIZE=10g

# 暴露端口
VERHUB_HTTP_PORT=80
VERHUB_HTTPS_PORT=443

# 站点对外地址（如 https://verhub.example.com），用于 canonical、Open Graph 与
# 服务端取数。留空回落到 https://verhub.app，届时分享出去的链接会指错站点。
NEXT_PUBLIC_SITE_URL=
# 关于页「文档」按钮的兜底地址，仅在上游未给出时使用
NEXT_PUBLIC_ABOUT_DOCS_URL=

# 关于页更新检查的上游源。留空即固定走官方 https://verhub.hanloth.cn；
# 仅在需要把更新检查指向自有 Verhub 实例时覆盖（填站点 origin，接口前缀固定 /api/v1）。
VERHUB_ABOUT_UPSTREAM_URL=
```

> `NEXT_PUBLIC_API_BASE_URL` 是**构建期**变量（默认 `/api/v1`），写进 `.env` 对预构建镜像无效；确实要改必须自行重新构建前端镜像。

### 3) 启动与升级命令

首次启动：

```bash
docker compose --env-file .env -f docker-compose.yml pull
docker compose --env-file .env -f docker-compose.yml up -d
docker compose --env-file .env -f docker-compose.yml ps
```

升级到新版本（例如 `v1.3.0`）：

```bash
sed -i 's/^VERHUB_TAG=.*/VERHUB_TAG=v1.3.0/' .env
docker compose --env-file .env -f docker-compose.yml pull
docker compose --env-file .env -f docker-compose.yml up -d
```

查看日志：

```bash
docker compose --env-file .env -f docker-compose.yml logs -f backend frontend
```

### 关键说明

- 前端容器通过 Nginx 暴露服务入口
- 后端容器端口仅在内部网络暴露
- 数据持久化由 PostgreSQL 卷负责，首次启动会自动创建数据库与表结构，可以尝试复用已有数据库，但需自行确保兼容性
- 公告正文与版本更新说明不限字数，请求体上限由后端统一兜底（1mb）。自带的 nginx
  网关已把 `/api/` 的 `client_max_body_size` 放到 2m，留在后端上限之上，超长内容
  由后端给出可读的错误。**自建反代请对齐这一条**，否则长正文会先在反代那里撞上
  一个默认 1m 的 413
- 文件分发用到两个卷：`storage-data`（后端，本机存储的文件与上传暂存）与 `dist-cache`
  （前端网关，WebDAV 文件的分片缓存）。**`storage-data` 必须持久化**，丢了它本机存储的
  文件就没了；`dist-cache` 丢了只会让缓存重新预热

### 套 CDN 上线

统计大屏的「来源地区」、日志与反馈明细里的 IP，都取自请求头。套了 CDN 之后，
直连源站的是边缘节点，配置不对就会把所有访客记成同一批 CDN 机房地址。

按 CDN 是否下发「真实客户端 IP 头」分两种情况：

1. **CDN 会下发专用头**（Cloudflare 的 `CF-Connecting-IP`、腾讯云 EdgeOne 的
   `EO-Client-IP`、阿里云 CDN 的 `Ali-CDN-Real-IP`、Akamai 的 `True-Client-IP`
   等）：内置清单已覆盖，**无需任何配置**。这类头由边缘节点无条件覆盖，客户端
   伪造不进来，是最可靠的来源。若你的 CDN 用的是清单外的头名，用
   `VERHUB_CLIENT_IP_HEADER=x-your-cdn-header` 指定，配置后只认它。
2. **CDN 只追加 `X-Forwarded-For`**：把 `VERHUB_TRUSTED_PROXY_COUNT` 设为 **2**
   （CDN 一层 + 自带 nginx 一层）。后端按这个层数从链尾往左数定位访客，而不是
   取最左项——最左项是客户端自己写的，谁都能伪造成任意地址。若源站前面还叠了
   自建的负载均衡 / Ingress，层数相应加一。

验证方式：换台设备访问一次公开接口，到管理端「日志」或「反馈」明细里看记录的
IP 是不是你的出口 IP（可用 `curl ifconfig.me` 对照）。若记成了机房地址，多半是
层数少配了一层。

反过来，若后端**直接对外**（没有任何反代），设 `VERHUB_TRUSTED_PROXY_COUNT=0`，
转发头会被一概忽略，只用 TCP 连接地址。

> 自带的 nginx 网关已做好配套：`X-Forwarded-For` 用追加而非覆盖，`X-Real-IP`
> 在上游已给出时不再用边缘节点地址盖掉。自建反代请对齐这两条。

### 文件分发与 CDN

后台「文件分发」上传的文件（以及镜像下来的 GitHub Release 附件）会得到一条固定直链：

```
{VERHUB_DIST_BASE_URL}/f/{projectKey}/{fileId}/{文件名}
```

- **不跳转**：直链直接返回文件内容（200 / 206），不会 302 到存储地址，满足 Microsoft Store
  等要求「安装包 URL 必须直链」的场景。
- **内容不可变**：同一个 URL 永远是同一份内容，响应带 `Cache-Control: public, max-age=31536000, immutable`
  与以 SHA-256 为值的强 ETag。要换包只能上传新文件，得到新 URL——这正好也是应用商店对
  「版本化 URL」的要求。
- **与存储方式无关**：URL 里看不出文件在本机还是 WebDAV，不同存储共用同一个分发域名。
- 支持 `HEAD`、`Range`（断点续传、多线程下载）、`If-None-Match`；查询串被忽略。

#### 推荐拓扑

主站与分发域名分开，只有分发域名套 CDN，两者都回源到同一台服务器的网关：

```
verhub.example.com      ───────────────────────────►  网关 :443（后台、页面、接口）
cdn.verhub.example.com  ──►  CDN  ──回源（Host 保持 cdn.verhub.example.com）──►  网关 :443（只提供 /f/）
```

`.env` 中设置 `VERHUB_DIST_BASE_URL=https://cdn.verhub.example.com`，并把
`NEXT_PUBLIC_SITE_URL` 设为主站地址。网关按请求的 `Host` 分流：分发域名只提供 `/f/`
（其余一律 404，后台与接口不会被 CDN 缓存），主站域名不再提供 `/f/`（避免绕过 CDN
直接消耗源站带宽）。若分发域名与 `NEXT_PUBLIC_SITE_URL` 相同，则不分流。

CDN 侧配置要点：

1. **回源 Host** 保持为分发域名（多数 CDN 默认如此），源站证书需覆盖该域名；也可回源 HTTP。
2. **缓存规则**：`/f/` 遵循源站缓存头，或手动设置较长的缓存时间；**忽略查询参数**，
   避免带随机参数的请求穿透缓存。
3. 开启**回源中间层 / 分层缓存**（阿里云「回源中间层」、腾讯云 EdgeOne「中间节点缓存」、
   Cloudflare「Tiered Cache」）与 **Range 回源 / 分片回源**，大文件每个分片只回源一次。
4. 分发域名**不要开启**人机验证、Bot 防护、UA / Referer 防盗链——应用商店的抓取程序与
   自动更新程序没有浏览器环境，会被拦下。
5. 删除文件后源站立即 404，但 CDN 已缓存的副本在过期前仍可访问。使用**阿里云 CDN** 时，可在
   后台「设置 → 存储设置 → CDN 缓存刷新」填入 AccessKey 并启用：删除文件会自动提交该直链的
   URL 刷新任务，文件列表里也能手动刷新。建议为 RAM 用户单独创建 AccessKey，只授予
   `cdn:RefreshObjectCaches` 与 `cdn:DescribeRefreshQuota` 两个权限；AccessKey Secret 以
   AES-256-GCM 加密落库。其他 CDN 目前需要到控制台手动刷新。

#### 源站带宽

| 存储                 | 文件字节的来路                     | 本机出站流量                                                    |
| -------------------- | ---------------------------------- | --------------------------------------------------------------- |
| 本机                 | 磁盘 → 网关 → CDN                  | 每个文件被 CDN 回源几次就出几次                                 |
| WebDAV（默认）       | WebDAV → 后端 → 网关分片缓存 → CDN | 同上；从 WebDAV 拉取的流量由网关缓存兜住，每个 4MB 分片只拉一次 |
| WebDAV（零带宽模式） | WebDAV → CDN                       | 0                                                               |

默认模式下源站只在 CDN 缓存未命中时出流量，配合第 3 条的分层缓存，一个文件通常只回源一次。
网关分片缓存（`dist-cache` 卷，上限 `VERHUB_DIST_CACHE_MAX_SIZE`）只缓存 WebDAV 的文件，
本机存储的文件直接读盘、不重复占用缓存空间。

**零带宽模式**：让 CDN 对 `/f/` 直接回源 WebDAV，字节完全不经过本服务器。WebDAV 上的存放
路径就是直链路径（`{WebDAV 地址}/f/...`），所以只需在 CDN 上把回源地址指向 WebDAV 主机、
按需改写路径前缀，并添加回源请求头 `Authorization: Basic base64(用户名:密码)`。后台
「设置 → 存储设置」中每个 WebDAV 存储都给出了现成的回源地址、路径改写与请求头（请求头在浏览器
本地计算，密码不经过服务器）。注意直链里不含存储信息，这条回源规则覆盖的路径下的文件必须都
存放在该 WebDAV 上——把它设为默认存储并不再使用其他存储，或只匹配部分项目的 `/f/{项目}/` 路径。

#### WebDAV 要求

- 支持 `MKCOL`、`PUT`、`DELETE` 与带 `Range` 的 `GET`（后台「测试」会逐项验证，并提示是否支持 Range）。
- **单次请求体受限的服务**（例如前面挂了宝塔 WAF：超过缓冲区的请求体会被拦截，并以 HTTP 200 返回一个
  「Nginx缓冲区溢出」的 HTML 页面，文件实际没有写入）：在存储设置里为该 WebDAV 填写「分片大小」
  （如 512 KB）。大于分片大小的文件会拆成 `{文件目录}/parts/000000…` 多个分片写入，每次请求都在上限以内，
  下载时由后端按需读取分片拼接，直链与 Range 行为不变，网关分片缓存照常生效。代价是分片存放的文件
  不能使用零带宽模式（CDN 无法自行拼接）。后台「测试」会额外写入一个 2MB 的文件，发现单次写入失败时
  会提示设置分片大小。
- 每次写入后都会校验：PUT 返回 HTML 拦截页、写入后读不到文件或长度不符，都判定为失败，不会把文件标成可分发。
- 服务端开启 gzip 不影响使用：读取时固定请求原始字节（`Accept-Encoding: identity`），写入校验以 PROPFIND 的 `getcontentlength` 为准。
- 读取时返回 302 的服务（如部分网盘挂载工具）也可用：跳转由后端跟随，不会暴露给下载者；
  但零带宽模式要求 CDN 能直接拿到内容，这类服务不适用。
- 网盘类服务请使用应用专用密码。密码以 AES-256-GCM 加密落库，密钥派生自 `JWT_SECRET`，
  **更换 `JWT_SECRET` 后需要重新填写 WebDAV 密码**。

#### 自建反代

不使用自带网关时，请把 `/f/` 转发到后端 `/api/v1/dist/f/`（保留原始编码的路径、去掉查询串），
并对 `/api/v1/admin/projects/*/files/uploads/` 放开请求体上限（单个分片 8MB）与超时（合并大文件
需要数十秒）。直接暴露后端也能正常分发，只是没有 WebDAV 分片缓存。

## 方案二：docker run（不使用 compose）

```bash
docker network create verhub-net

docker run -d --name verhub-postgres --network verhub-net \
  -e POSTGRES_DB=verhub \
  -e POSTGRES_USER=verhub \
  -e POSTGRES_PASSWORD=change-this-strong-db-password \
  -v verhub-postgres-data:/var/lib/postgresql/data \
  postgres:16-alpine

docker run -d --name verhub-backend --network verhub-net \
  -e NODE_ENV=production \
  -e PORT=4000 \
  -e DATABASE_URL='postgresql://verhub:change-this-strong-db-password@verhub-postgres:5432/verhub?schema=public' \
  -e JWT_SECRET='please-change-this-jwt-secret' \
  -e API_KEY_SALT='please-change-this-api-key-salt' \
  -e VERHUB_DIST_BASE_URL='https://cdn.verhub.example.com' \
  -v verhub-bootstrap:/bootstrap \
  -v verhub-storage:/var/lib/verhub/storage \
  docker.io/ivanhanloth/verhub-backend:latest

docker run -d --name verhub-frontend --network verhub-net \
  -p 80:80 -p 443:443 \
  -e NEXT_PUBLIC_SITE_URL='https://verhub.example.com' \
  -e VERHUB_DIST_BASE_URL='https://cdn.verhub.example.com' \
  -v verhub-dist-cache:/var/cache/nginx/verhub-dist \
  docker.io/ivanhanloth/verhub-frontend:latest
```

## 方案三：分服务部署

适用于已有容器平台或云原生平台：

- `packages/backend` 单独部署为 API 服务
- `web` 单独部署为前端服务
- PostgreSQL 使用托管数据库

## 生产环境配置建议

1. 强制使用高强度 `JWT_SECRET`
2. 限制数据库公网访问，避免暴露默认端口
3. 对镜像与依赖定期进行漏洞扫描
4. 开启日志采集与错误告警

## 升级发布建议

1. 先在预发布环境验证迁移与接口兼容性
2. 再发布到生产环境
3. 发布后检查以下指标：

- 登录成功率
- API 错误率
- 关键页面加载时间
