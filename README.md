# Verhub

<p align="center">
  <img src="doc/public/logo-500.png" alt="Verhub Logo" width="100" />
</p>

Verhub 是一个自部署的统一多项目版本、公告、反馈与行为日志管理系统，建立软件从发布到回收反馈的完整闭环，帮助团队高效运营与持续改进。

## 核心能力

- 项目管理：维护项目信息，快速生成项目落地页链接
- 版本管理：维护版本信息、下载链接、发布状态（latest / preview）与可比较版本号
- 公告管理：统一发布更新公告与通知内容
- 反馈管理：集中收集并追踪用户反馈处理进度
- 日志管理：记录关键行为事件，支持排障与审计

支持从Github快速同步项目与版本数据，提供多语言 SDK（TypeScript/Python/vanilla JS）方便集成。每个项目自带独立落地页展示项目信息、版本历史与公告内容，帮助用户快速了解项目动态。

新增公开更新检查能力：

- `GET /api/v1/public/{projectKey}/versions/by-version/{version}`：按语义化版本号查询指定版本。
- `GET /api/v1/public/{projectKey}/versions/latest-preview`：查询最新 preview 版本。
- `POST /api/v1/public/{projectKey}/versions/check-update`：提交当前版本并自动返回是否更新、是否强制、里程碑约束目标版本。

更新策略从“版本级 forced 开关”迁移到“项目级治理 + 版本元信息”：

- 项目级可选更新范围：`optional_update_min_comparable_version` ~ `optional_update_max_comparable_version`。
- 版本里程碑：`is_milestone`，用于标记里程碑节点版本。
- 版本废弃机制：`is_deprecated=true` 时该版本客户端必须更新。
- 版本号分层：语义化版本号 `version`（展示用）与可比较版本号 `comparable_version`（规则计算用）。

## 演示

Verhub 项目的版本发布是基于作者部署的Verhub实例的，访问 <https://verhub.hanloth.cn> 查看该站点。
由于已经投入实际使用，不提供后台账号。如有需要请自行部署。

## 技术栈

- 前端：Next.js + React + Tailwind CSS
- 后端：NestJS
- 数据库：PostgreSQL
- ORM：Prisma
- 工程质量：TypeScript + ESLint + Prettier + Husky + lint-staged

## 文档

- 开发文档: <https://ivanhanloth.github.io/Verhub/guide/introduction>
- API 文档: <https://verhub.hanloth.cn/doc> 或自部署后访问 `/doc`查看和调试。

## 仓库结构

```text
.
├─ web/                     # 前端应用（管理后台 + 对外页面）
├─ packages/backend/        # NestJS 后端服务
├─ packages/ui/             # 共享 UI 组件
├─ sdk/                     # 多语言 SDK（TypeScript/Python/vanilla JS）
├─ docs/                    # 现有工程文档（开发、Docker）
├─ doc/                     # VitePress 文档站点
└─ .github/workflows/       # CI/CD 工作流
```

## 快速开始

### Docker Compose 一键部署（推荐）

创建 `docker-compose.yml`：

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

创建`.env` 文件：

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

# 暴露端口
VERHUB_HTTP_PORT=80
VERHUB_HTTPS_PORT=443
```

首次启动：

```bash
docker compose --env-file .env -f docker-compose.yml pull
docker compose --env-file .env -f docker-compose.yml up -d
docker compose --env-file .env -f docker-compose.yml ps
```

### 代码部署

#### 1. 安装依赖

```bash
pnpm install
```

#### 2. 配置后端环境变量

```bash
cp packages/backend/.env.example packages/backend/.env
```

请根据本地环境修改数据库连接、JWT 密钥等配置。

#### 3. 启动开发环境

```bash
pnpm dev
```

默认访问地址：

- 前端：`http://localhost:3000`
- 后端：`http://localhost:4000`

### Docker 本地构建

在仓库根目录执行：

```bash
cp .env.example .env
docker compose -f docker-compose.dev.yml up -d --build
```

该命令会基于本地dockerfile本地构建镜像、启动数据库、后端和前端容器，适合开发使用。

## 实际应用

Verhub 已经在多个实际项目中投入使用，帮助团队高效管理版本发布与用户反馈，持续提升软件质量和用户满意度。

- [Bili23 Downloader](https://github.com/ScottSloan/Bili23-Downloader)
- [Boss Key](https://github.com/IvanHanloth/Boss-Key)
- [Verhub](https://github.com/IvanHanloth/Verhub)

## 贡献指南

请查看文档站中的贡献指南：

- <https://ivanhanloth.github.io/Verhub/guide/contributing>

仓库已启用 Husky + lint-staged，提交时会自动进行基础代码质量校验。

## 鸣谢

感谢 Github Copilot 提供的各类大语言模型的访问权限，本项目大量代码由AI辅助生成，极大提升了开发效率和代码质量。

## 许可证

Apache License 2.0
