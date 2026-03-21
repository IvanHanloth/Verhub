# Verhub

Verhub 是一个面向团队协作的版本与发布管理平台，帮助你统一管理项目版本、公告、反馈与行为日志，建立从发布到回收反馈的完整闭环。

## 核心能力

- 版本管理：维护版本信息、下载链接、发布状态（latest / preview）
- 公告管理：统一发布更新公告与通知内容
- 反馈管理：集中收集并追踪用户反馈处理进度
- 日志管理：记录关键行为事件，支持排障与审计
- 后台管理：支持多项目视角下的运营管理

## 技术栈

- Monorepo：pnpm + turbo
- 前端：Next.js + React + Tailwind CSS
- 后端：NestJS
- 数据库：PostgreSQL
- ORM：Prisma
- 工程质量：TypeScript + ESLint + Prettier + Husky + lint-staged

## 仓库结构

```text
.
├─ web/                     # 前端应用（管理后台 + 对外页面）
├─ packages/backend/        # NestJS 后端服务
├─ packages/ui/             # 共享 UI 组件
├─ docs/                    # 现有工程文档（开发、Docker）
├─ doc/                     # VitePress 文档站点
└─ .github/workflows/       # CI/CD 工作流
```

## 快速开始

### 1. 安装依赖

```bash
pnpm install
```

### 2. 配置后端环境变量

```bash
cp packages/backend/.env.example packages/backend/.env
```

请根据本地环境修改数据库连接、JWT 密钥等配置。

### 3. 启动开发环境

```bash
pnpm dev
```

默认访问地址：

- 前端：`http://localhost:3000`
- 后端：`http://localhost:4000`

## Docker 部署

在仓库根目录执行：

```bash
cp .env.example .env
docker compose up -d --build
```

该命令会启动数据库、后端和前端容器，适合本地生产态验证与自建部署场景。

更多细节请查看：

- `docs/DOCKER.md`

## 文档站点（VitePress）

项目已在 `doc/` 目录集成 VitePress 文档站点。

常用命令：

```bash
# 本地开发
pnpm docs:dev

# 构建文档
pnpm docs:build

# 预览构建结果
pnpm docs:preview
```

文档内容包含：

- 项目介绍
- 快速开始
- 部署指南
- 开发指南
- 用户指南
- 运维建议与常见问题

## GitHub Actions

- `CI`：执行基础质量检查（lint、typecheck、后端单测）
- `Docs Deploy`：当 `doc/**` 内容变更时自动构建并部署文档到 GitHub Pages

如果你首次启用文档部署，请在仓库设置中确认：

1. 已启用 GitHub Pages
2. Source 设置为 GitHub Actions

## 开发命令速查

```bash
# 全仓质量检查
pnpm lint
pnpm typecheck

# 后端
pnpm --filter @workspace/backend dev
pnpm --filter @workspace/backend test
pnpm --filter @workspace/backend prisma:generate

# 前端
pnpm --filter web dev
pnpm --filter web test
```

## 贡献指南

1. 创建功能分支并保持单次改动聚焦
2. 提交前执行 lint / typecheck / 必要测试
3. 提交 PR 时说明变更目的、影响范围与验证步骤

仓库已启用 Husky + lint-staged，提交时会自动进行基础代码质量校验。

## 许可证

建议使用 MIT License（如与你的组织策略不同，请按需调整）。
