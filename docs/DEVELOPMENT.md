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

## 1.6 Docker 生产封装与运行

- Docker 相关文件：`docker/verhub.Dockerfile`、`docker/app-entrypoint.sh`、`docker/backend-entrypoint.sh`、`docker-compose.yml`
- 示例环境变量：`.env.example`
- 使用与排障文档：`docs/DOCKER.md`

快速启动：

```bash
cp .env.example .env
docker compose up -d --build
```

首次登录引导文件位置：

- 容器内：`/bootstrap/verhub.bootstrap-admin.txt`
- 挂载卷：`bootstrap-secrets`

首次登录成功后该文件会自动删除。

## 2. 环境变量说明

后端变量（`packages/backend/.env`）：

- `NODE_ENV`：运行环境，开发阶段建议 `development`
- `PORT`：后端监听端口，默认 `4000`
- `DATABASE_URL`：PostgreSQL 连接串
- `JWT_SECRET`：管理员 JWT 签名密钥，必须使用高强度随机值
- `JWT_EXPIRES_IN`：JWT 过期时间，例如 `2h`
- `ADMIN_PASSWORD`：首次引导管理员密码（可选；不填则自动生成随机密码）
- `BOOTSTRAP_SECRET_DIR`：首次管理员临时凭据文件输出目录（Docker 建议挂载卷）
- `API_KEY_SALT`：API Key 校验盐值
- `CORS_ORIGIN`：允许跨域来源，多个值用逗号分隔

前端变量（`web/.env.local`，按需新增）：

- `NEXT_PUBLIC_API_BASE_URL`：后端 API 地址，默认 `/api/v1`（通过 Next.js 代理转发）

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

## 3.2 管理后台表单规范

- 管理后台页面统一使用 `admin-unified` 视觉层，表单建议采用 `label > span + input/textarea/select` 结构
- 必填字段必须使用原生 `required` 属性，红色 `*` 由全局样式自动渲染
- 新增或重构表单时，避免把字段名只放在 placeholder 中，必须保留可见 label

## 3.4 版本发布规范

- 版本创建/编辑支持字段：`is_latest`、`is_preview`、`published_at`。
- `published_at` 使用 Unix 秒级时间戳。
- 当项目配置 `repo_url`（`https://github.com/{owner}/{repo}`）后，可调用管理端 GitHub 预览接口自动填充版本草稿。
- API 契约与前后端类型必须与 `verhub.openapi.yaml` 同步更新。

## 3.3 跨页面项目上下文规范

- 后台项目上下文由 `web/hooks/use-shared-project-selection.ts` 管理
- 持久化键：`verhub.admin.selectedProjectKey`
- 事件广播：`verhub.admin.project.changed`
- 需要项目维度的页面（versions/announcements/feedbacks/logs/actions）应复用该 hook，避免各页面独立维护默认项目

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

- 首次启动后请先查看 `verhub.bootstrap-admin.txt` 中引导密码
- 确认管理员账号是否已在后台设置页面被修改
- 检查请求是否使用最新 JWT

### 5.1.1 首次管理员引导文件

- 默认写入仓库根目录：`verhub.bootstrap-admin.txt`
- 在 Docker 下建议设置 `BOOTSTRAP_SECRET_DIR=/bootstrap` 并挂载卷
- 首次登录成功后，后端会自动删除该文件

### 5.2 前端无法请求后端

- 确认 `NEXT_PUBLIC_API_BASE_URL` 是否正确
- 检查后端是否在 `PORT` 指定端口正常启动
- 查看浏览器 Network 面板确认请求路径
