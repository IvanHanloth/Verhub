# 快速开始

本章节帮助你在本地快速启动 Verhub。

## 先决条件

- Node.js 22+
- pnpm 10+
- Docker（可选，用于容器化启动）
- PostgreSQL（本地开发模式下需要）

## 安装依赖

在仓库根目录执行：

```bash
pnpm install
```

## 配置环境变量

1. 复制后端环境变量模板：

```bash
cp packages/backend/.env.example packages/backend/.env
```

2. 根据本地数据库配置修改 `packages/backend/.env`，重点关注：

- `DATABASE_URL`
- `JWT_SECRET`
- `CORS_ORIGIN`

## 启动开发环境

```bash
pnpm dev
```

默认情况下：

- 前端运行在 `http://localhost:3000`
- 后端运行在 `http://localhost:4000`

## 常用命令

```bash
# 仅启动前端
pnpm --filter web dev

# 仅启动后端
pnpm --filter @workspace/backend dev

# 运行全仓 lint
pnpm lint

# 运行全仓类型检查
pnpm typecheck
```

## 首次登录说明

在空数据库首次启动时，系统会初始化管理员账号并输出一次性凭据文件。登录后建议立刻修改默认密码并删除临时凭据。
