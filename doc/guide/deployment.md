# 部署指南

本文提供 Verhub 的推荐部署方式与生产环境建议。

## 镜像策略说明（先看）

Verhub 当前只提供分离镜像：

- `docker.io/ivanhanloth/verhub-backend`
- `docker.io/ivanhanloth/verhub-frontend`
- `ghcr.io/ivanhanloth/verhub-backend`
- `ghcr.io/ivanhanloth/verhub-frontend`

推荐分离镜像的原因：

1. 前后端可以独立升级与回滚
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
    image: ${VERHUB_BACKEND_IMAGE:-docker.io/ivanhanloth/verhub-backend}:${VERHUB_TAG:-latest}
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
      CORS_ORIGIN: ${CORS_ORIGIN:-http://localhost}
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
    logging: *default-logging # 引用日志配置

  frontend:
    image: ${VERHUB_FRONTEND_IMAGE:-docker.io/ivanhanloth/verhub-frontend}:${VERHUB_TAG:-latest}
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
    logging: *default-logging # 引用日志配置

volumes:
  postgres-data:
  bootstrap-secrets:
```

### 2) 准备 .env 模板

在同目录创建 `.env`：

```dotenv
# 镜像版本（latest 或 v1.2.3）
VERHUB_TAG=latest

# 如果要切换到 GHCR，可改成：ghcr.io/ivanhanloth/verhub-backend / verhub-frontend
VERHUB_BACKEND_IMAGE=docker.io/ivanhanloth/verhub-backend
VERHUB_FRONTEND_IMAGE=docker.io/ivanhanloth/verhub-frontend

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
CORS_ORIGIN=http://localhost

# 暴露端口
VERHUB_HTTP_PORT=80
VERHUB_HTTPS_PORT=443
```

### 3) 启动与升级命令

首次启动：

```bash
docker compose --env-file .env -f docker-compose.release.yml pull
docker compose --env-file .env -f docker-compose.release.yml up -d
docker compose --env-file .env -f docker-compose.release.yml ps
```

升级到新版本（例如 `v1.3.0`）：

```bash
sed -i 's/^VERHUB_TAG=.*/VERHUB_TAG=v1.3.0/' .env
docker compose --env-file .env -f docker-compose.release.yml pull
docker compose --env-file .env -f docker-compose.release.yml up -d
```

查看日志：

```bash
docker compose --env-file .env -f docker-compose.release.yml logs -f backend frontend
```

### 关键说明

- 前端容器通过 Nginx 暴露服务入口
- 后端容器通常仅在内部网络暴露
- 数据持久化由 PostgreSQL 卷负责

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
  -e CORS_ORIGIN='http://localhost' \
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
2. 设置明确的 `CORS_ORIGIN`
3. 限制数据库公网访问
4. 对镜像与依赖定期进行漏洞扫描
5. 开启日志采集与错误告警

## 升级发布建议

1. 先在预发布环境验证迁移与接口兼容性
2. 再发布到生产环境
3. 发布后检查以下指标：

- 登录成功率
- API 错误率
- 关键页面加载时间
