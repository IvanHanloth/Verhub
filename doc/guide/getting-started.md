# 快速开始

本章节使用 Docker Compose 在本地快速部署 Verhub。

## 先决条件

- Docker 24+
- Docker Compose v2+

## 1. 准备环境变量

在仓库根目录复制环境变量模板：

```bash
cp .env.example .env
```

然后至少确认以下变量已设置：

- `VERHUB_POSTGRES_PASSWORD`
- `JWT_SECRET`
- `API_KEY_SALT`

## 2. 一键启动

```bash
docker compose --env-file .env up -d
docker compose --env-file .env ps
```

默认访问地址：

- 前台与后台入口：`http://localhost`（或你在 `.env` 里配置的 `VERHUB_HTTP_PORT`）
- 后端健康检查：`http://localhost/api/v1/health`

## 3. 查看日志与停止

```bash
docker compose --env-file .env logs -f backend frontend
docker compose --env-file .env down
```

## 4. 首次登录说明

首次启动且数据库为空时，系统会初始化管理员账号并从控制台输出一次性凭据文件。请在宿主机 `bootstrap` 挂载目录（Volume `Verhub-bootstrap-secrets`）查找凭据，登录后立即修改默认密码。一次性凭据文件将在首次登录后自动删除

## 5. 升级版本

```bash
docker compose --env-file .env pull
docker compose --env-file .env up -d
```
