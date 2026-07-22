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
    logging: *default-logging

  frontend:
    image: ${VERHUB_FRONTEND_IMAGE:-ivanhanloth/verhub-frontend}:${VERHUB_TAG:-latest}
    container_name: verhub-frontend
    restart: unless-stopped
    networks:
      - verhub-net
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
    logging: *default-logging

volumes:
  postgres-data:
  bootstrap-secrets:
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

# 上报去重窗口（秒）。窗口内同一调用方提交完全相同的日志/反馈/行为记录
# 只保留第一条，用于挡住崩溃重试循环与重复点击。设为 0 关闭。
VERHUB_DEDUP_WINDOW_SECONDS=60

# 暴露端口
VERHUB_HTTP_PORT=80
VERHUB_HTTPS_PORT=443
```

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
  -v verhub-bootstrap:/bootstrap \
  docker.io/ivanhanloth/verhub-backend:latest

docker run -d --name verhub-frontend --network verhub-net \
  -p 80:80 -p 443:443 \
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
