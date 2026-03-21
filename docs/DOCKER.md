# Verhub Docker 生产部署指南

本文档描述当前仓库的 Docker 实际部署方式：

- 单应用镜像（一个容器同时运行 backend + web）
- 一键 `docker compose` 启动完整栈（PostgreSQL + Verhub 应用）
- 首次运行自动生成管理员临时凭据文件

## 1. 相关文件

- `docker/verhub.Dockerfile`：统一构建镜像（backend + web）
- `docker/app-entrypoint.sh`：应用入口，先拉起 backend 再启动 web
- `docker/backend-entrypoint.sh`：backend 启动前执行 Prisma `migrate deploy`
- `docker-compose.yml`：完整服务编排
- `.env.example`：Compose 环境变量示例

## 2. Docker Compose（推荐）

### 2.1 准备环境变量

```bash
cp .env.example .env
```

至少请修改以下变量：

- `VERHUB_POSTGRES_PASSWORD`
- `JWT_SECRET`
- `API_KEY_SALT`

### 2.2 启动

```bash
docker compose up -d --build
```

### 2.3 查看状态与日志

```bash
docker compose ps
docker compose logs -f verhub
```

### 2.4 首次管理员凭据文件

首次数据库初始化后，会在挂载卷 `bootstrap-secrets` 的 `/bootstrap/verhub.bootstrap-admin.txt` 写入临时凭据。

```bash
docker compose exec verhub cat /bootstrap/verhub.bootstrap-admin.txt
```

示例内容：

```text
username=admin
password=<随机密码>
```

首次登录成功后该文件会自动删除，可检查：

```bash
docker compose exec verhub ls -al /bootstrap
```

### 2.5 一键重置管理员账号密码

```bash
docker compose exec verhub pnpm --filter @workspace/backend admin:reset
```

该命令会重置为 `admin` 并重新生成临时凭据文件，同时在控制台打印用户名、密码和文件路径。

### 2.6 停止与清理

```bash
docker compose down
```

如需清理数据库与引导凭据卷：

```bash
docker compose down -v
```

## 3. 常见问题

### 3.1 `P1010 User was denied access`

通常是数据库卷已用旧账号初始化，而当前 `.env` 中账号/密码发生变化。

可执行：

```bash
docker compose down -v
docker compose up -d --build
```

如果要保留历史数据，请确保 `.env` 中以下变量与旧卷初始化时一致：

- `VERHUB_POSTGRES_DB`
- `VERHUB_POSTGRES_USER`
- `VERHUB_POSTGRES_PASSWORD`

## 4. 原生 Docker（不使用 Compose）

### 4.1 创建网络与卷

```bash
docker network create verhub-net
docker volume create verhub-postgres-data
docker volume create verhub-bootstrap-secrets
```

### 4.2 启动 PostgreSQL

```bash
docker run -d \
  --name verhub-postgres \
  --network verhub-net \
  -e POSTGRES_DB=verhub \
  -e POSTGRES_USER=verhub \
  -e POSTGRES_PASSWORD=change-this-strong-db-password \
  -v verhub-postgres-data:/var/lib/postgresql/data \
  -p 5432:5432 \
  postgres:16-alpine
```

### 4.3 构建并启动 Verhub 统一应用

```bash
docker build -f docker/verhub.Dockerfile -t verhub:latest .

docker run -d \
  --name verhub-app \
  --network verhub-net \
  -e NODE_ENV=production \
  -e DATABASE_URL="postgresql://verhub:change-this-strong-db-password@verhub-postgres:5432/verhub?schema=public" \
  -e JWT_SECRET="change-this-very-strong-jwt-secret" \
  -e JWT_EXPIRES_IN="2h" \
  -e API_KEY_SALT="change-this-unique-api-key-salt" \
  -e BOOTSTRAP_SECRET_DIR="/bootstrap" \
  -e CORS_ORIGIN="http://localhost:3000" \
  -v verhub-bootstrap-secrets:/bootstrap \
  -p 3000:3000 \
  verhub:latest
```

## 5. 安全建议（生产）

- 不要在生产使用示例密码
- `JWT_SECRET` 与 `API_KEY_SALT` 必须使用高熵随机值
- 建议通过密钥管理系统注入 `.env`，避免硬编码
- 建议只对外暴露 `3000` 端口
- 首次登录并修改管理员密码后，确认临时凭据文件已删除
