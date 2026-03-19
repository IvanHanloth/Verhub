# Verhub 开发指南

本指南用于统一本地开发流程、环境变量配置与提交规范。

## 1. 本地运行

### 1.1 前置依赖

- Node.js 22+
- pnpm 10+
- PostgreSQL 15+

### 1.2 安装依赖

在仓库根目录执行：

```bash
pnpm install
```

### 1.3 配置后端环境变量

```bash
cp packages/backend/.env.example packages/backend/.env
```

按需修改 `packages/backend/.env`。

### 1.4 初始化数据库

```bash
pnpm --filter @workspace/backend prisma:generate
pnpm --filter @workspace/backend prisma:migrate
```

### 1.5 启动开发模式

在根目录启动全部工作区：

```bash
pnpm dev
```

常用启动方式：

- 仅启动后端：`pnpm --filter @workspace/backend dev`
- 仅启动管理端：`pnpm --filter web dev`

## 2. 环境变量说明

后端变量（`packages/backend/.env`）：

- `NODE_ENV`：运行环境，开发阶段建议 `development`
- `PORT`：后端监听端口，默认 `4000`
- `DATABASE_URL`：PostgreSQL 连接串
- `JWT_SECRET`：管理员 JWT 签名密钥，必须使用高强度随机值
- `JWT_EXPIRES_IN`：JWT 过期时间，例如 `2h`
- `ADMIN_USERNAME`：初始管理员用户名
- `ADMIN_PASSWORD_HASH`：管理员密码哈希（bcrypt）
- `API_KEY_SALT`：API Key 校验盐值

前端变量（`web/.env.local`，按需新增）：

- `NEXT_PUBLIC_API_BASE_URL`：后端 API 地址，默认 `http://localhost:4000/api/v1`

## 3. 质量门禁与测试

在提交前建议至少执行：

```bash
pnpm lint
pnpm typecheck
pnpm --filter @workspace/backend test
pnpm --filter web test
```

按需执行端到端测试：

```bash
pnpm --filter @workspace/backend test:e2e
```

## 3.1 API 契约维护（OpenAPI）

- 契约文件位置：`verhub.openapi.yaml`
- 该文件必须与后端 `Controller + DTO + Service` 的真实输入输出保持一致
- 涉及以下变更时必须同步更新 OpenAPI：
  - 新增/删除接口路径
  - 路径参数、查询参数、请求体字段变化
  - 响应字段或错误码变化

建议在接口改动后至少执行一次后端测试，确保文档与实现同向演进：

```bash
pnpm --filter @workspace/backend test
pnpm --filter @workspace/backend test:e2e
```

## 4. 提交规范

仓库启用 Husky + lint-staged，提交时会自动执行 ESLint 与 Prettier。

建议提交信息遵循 Conventional Commits：

- `feat: ...` 新功能
- `fix: ...` 缺陷修复
- `docs: ...` 文档变更
- `refactor: ...` 重构
- `test: ...` 测试变更
- `chore: ...` 构建或工程化维护

推荐粒度：一次提交只解决一个目标，避免混合无关修改。

## 5. 常见问题

### 5.1 登录失败（401）

- 检查 `ADMIN_USERNAME` 是否正确
- 确认 `ADMIN_PASSWORD_HASH` 与输入密码匹配
- 检查请求是否使用最新 JWT

### 5.2 Prisma 迁移失败

- 确认 `DATABASE_URL` 指向可访问数据库
- 检查数据库用户是否有建表权限
- 先执行 `pnpm --filter @workspace/backend prisma:generate` 再迁移

### 5.3 前端无法请求后端

- 确认 `NEXT_PUBLIC_API_BASE_URL` 是否正确
- 检查后端是否在 `PORT` 指定端口正常启动
- 查看浏览器 Network 面板确认请求路径
