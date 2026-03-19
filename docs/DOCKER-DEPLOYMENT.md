# Verhub Docker 部署指南

本文档说明两种生产部署方式：

- 方式 A：使用 `docker compose` 一键部署（推荐）
- 方式 B：使用原生 `docker` 命令分别部署（适合更细粒度控制）

## 1. 前置条件

- Docker 24+
- Docker Compose v2+

## 2. 环境变量模板

仓库根目录已提供模板：

- `.env.example`

复制后填写真实值：

```bash
cp .env.example .env
```

至少要修改：

- `POSTGRES_PASSWORD`
- `JWT_SECRET`
- `API_KEY_SALT`

## 3. 首次管理员引导逻辑

后端初始化规则如下：

1. 数据库中若无任何用户，自动创建 `admin` 账号。
2. 若 `ADMIN_PASSWORD` 为空，自动生成随机密码并写入数据库。
3. 同时把账号密码写入临时文件 `verhub.bootstrap-admin.txt`。
4. 文件默认写入容器内 `BOOTSTRAP_SECRET_DIR=/bootstrap`，并通过卷挂载持久化。
5. 后端容器日志会输出账号、密码和临时文件路径（仅首次自动生成密码场景）。
6. 首次登录成功后，后端会自动删除该临时文件。

查看后端日志示例：

```bash
docker compose logs -f backend
```

## 4. 方式 A：Docker Compose 部署（推荐）

在仓库根目录执行：

```bash
docker compose --env-file .env up -d --build
```

检查状态：

```bash
docker compose ps
```

查看引导凭据文件（首次启动后）：

```bash
docker volume inspect verhub_verhub-bootstrap-secrets
```

停止并保留数据：

```bash
docker compose down
```

停止并删除卷（会清空数据库与引导文件）：

```bash
docker compose down -v
```

## 5. 方式 B：原生 Docker 部署

### 5.1 创建网络与卷

```bash
docker network create verhub-net
docker volume create verhub-postgres-data
docker volume create verhub-bootstrap-secrets
```

### 5.2 启动 PostgreSQL

```bash
docker run -d \
  --name verhub-db \
  --network verhub-net \
  --restart unless-stopped \
  -e POSTGRES_DB=verhub \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=<your-db-password> \
  -v verhub-postgres-data:/var/lib/postgresql/data \
  postgres:16-alpine
```

### 5.3 构建镜像

```bash
docker build -f docker/backend.Dockerfile --target runtime -t verhub-backend:latest .
docker build -f docker/backend.Dockerfile --target migrator -t verhub-backend-migrator:latest .
docker build -f docker/web.Dockerfile --target runtime -t verhub-web:latest .
```

### 5.4 执行数据库同步

```bash
docker run --rm \
  --name verhub-migrate \
  --network verhub-net \
  -e DATABASE_URL='postgresql://postgres:<your-db-password>@verhub-db:5432/verhub?schema=public' \
  verhub-backend-migrator:latest \
  pnpm --filter @workspace/backend exec prisma db push
```

### 5.5 启动后端

```bash
docker run -d \
  --name verhub-backend \
  --network verhub-net \
  --restart unless-stopped \
  -e NODE_ENV=production \
  -e PORT=4000 \
  -e DATABASE_URL='postgresql://postgres:<your-db-password>@verhub-db:5432/verhub?schema=public' \
  -e JWT_SECRET='<your-jwt-secret>' \
  -e JWT_EXPIRES_IN='2h' \
  -e API_KEY_SALT='<your-api-key-salt>' \
  -e ADMIN_PASSWORD='' \
  -e BOOTSTRAP_SECRET_DIR='/bootstrap' \
  -e CORS_ORIGIN='http://localhost:3000' \
  -v verhub-bootstrap-secrets:/bootstrap \
  verhub-backend:latest
```

### 5.6 启动前端

```bash
docker run -d \
  --name verhub-web \
  --network verhub-net \
  --restart unless-stopped \
  -p 3000:3000 \
  -e NODE_ENV=production \
  -e HOSTNAME=0.0.0.0 \
  -e PORT=3000 \
  -e NEXT_PUBLIC_API_BASE_URL='http://localhost:4000/api/v1' \
  verhub-web:latest
```

## 6. 验证与排障

- 前端健康：访问 `http://localhost:3000`
- 后端健康（容器内）：`/health`
- 后端日志：`docker compose logs -f backend`
- 若首次登录后仍有引导文件，请检查是否确实发生“登录成功”而非登录失败。
