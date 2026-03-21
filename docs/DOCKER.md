# Verhub Docker 生产部署指南

本文档描述当前仓库的 Docker 实际部署方式：

- 前后端分离：`backend` 与 `frontend` 两个镜像、两个容器
- 前端容器内置 `nginx`，统一暴露 `80/443`
- 所有后端接口统一走 `/api` 入口转发到 `backend`
- 后端容器不对宿主机暴露端口，只允许内网访问

## 1. 相关文件

- `docker/backend.Dockerfile`：后端镜像构建（NestJS + Prisma）
- `docker/frontend.Dockerfile`：前端镜像构建（Next.js runtime + nginx 网关）
- `docker/nginx/default.conf`：nginx 配置（`/api` 反代到 backend）
- `docker/frontend-entrypoint.sh`：前端容器入口（启动 Next.js + nginx）
- `docker/backend-entrypoint.sh`：后端容器入口（启动前执行 Prisma `migrate deploy`）
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

可选端口配置：

- `VERHUB_HTTP_PORT`（默认 `80`）
- `VERHUB_HTTPS_PORT`（默认 `443`）

### 2.2 启动

```bash
docker compose up -d --build
```

### 2.3 查看状态与日志

```bash
docker compose ps
docker compose logs -f frontend
docker compose logs -f backend
```

### 2.4 访问入口

- HTTP: `http://localhost`
- HTTPS: `https://localhost`（默认使用容器内自签名证书）
- 后端统一入口：`/api/v1/*`（例如 `http://localhost/api/v1/health`）

说明：后端服务不直接暴露到宿主机，无法通过 `localhost:4000` 直接访问。

### 2.5 首次管理员凭据文件

首次数据库初始化后，会在挂载卷 `bootstrap-secrets` 的 `/bootstrap/verhub.bootstrap-admin.txt` 写入临时凭据。

```bash
docker compose exec backend cat /bootstrap/verhub.bootstrap-admin.txt
```

示例内容：

```text
username=admin
password=<随机密码>
```

首次登录成功后该文件会自动删除，可检查：

```bash
docker compose exec backend ls -al /bootstrap
```

### 2.6 一键重置管理员账号密码

```bash
docker compose exec backend pnpm --filter @workspace/backend admin:reset
```

该命令会重置为 `admin` 并重新生成临时凭据文件，同时在控制台打印用户名、密码和文件路径。

### 2.7 停止与清理

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

### 3.2 HTTPS 证书告警

默认 HTTPS 使用前端容器自动生成的自签名证书，浏览器会提示不受信任。

生产环境请替换为受信任证书，并在容器中提供：

- `/etc/nginx/certs/tls.crt`
- `/etc/nginx/certs/tls.key`

## 4. 安全建议（生产）

- 不要在生产使用示例密码
- `JWT_SECRET` 与 `API_KEY_SALT` 必须使用高熵随机值
- 建议通过密钥管理系统注入 `.env`，避免硬编码
- 后端保持仅内网可达，不要额外暴露端口
- 首次登录并修改管理员密码后，确认临时凭据文件已删除
