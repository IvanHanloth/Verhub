# 开发指南

## 开发原则

- 优先保证 API 字段与前端契约一致
- 通过类型系统降低回归风险
- 每个变更都应具备可验证方式（测试、日志或手工用例）

## Monorepo 协作方式

- 根目录统一安装依赖与执行任务
- 通过 `--filter` 精确定位子包命令
- 通用配置集中在 `packages/eslint-config` 与 `packages/typescript-config`

## 常用开发命令

```bash
# 全仓开发模式
pnpm dev

# 后端测试
pnpm --filter @workspace/backend test

# 前端测试
pnpm --filter web test

# 代码格式化
pnpm format
```

## 容器化联调（优先使用已发布镜像）

从现在开始，Verhub 推荐优先使用已经发布的镜像进行联调，而不是本地重新构建镜像。

- 分离镜像（推荐）：`ghcr.io/ivanhanloth/verhub-backend` + `ghcr.io/ivanhanloth/verhub-frontend`
- 分离镜像（推荐）：`docker.io/ivanhanloth/verhub-backend` + `docker.io/ivanhanloth/verhub-frontend`

推荐原因：

- 前后端独立升级与回滚更灵活
- 更容易在不同平台（K8s、Compose、云平台）做服务拆分
- CI 发布粒度更清晰（backend/frontend 可单独追踪）

### 使用 docker compose 联调

请参考部署文档中的模板，保存为 `docker-compose.release.yml`，然后执行：

```bash
docker compose --env-file .env -f docker-compose.release.yml pull
docker compose --env-file .env -f docker-compose.release.yml up -d
docker compose --env-file .env -f docker-compose.release.yml ps
```

### 使用 docker run 联调

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
  -e JWT_SECRET='please-change-me' \
  -e API_KEY_SALT='please-change-me-too' \
  -e CORS_ORIGIN='http://localhost' \
  -v verhub-bootstrap:/bootstrap \
  docker.io/ivanhanloth/verhub-backend:latest

docker run -d --name verhub-frontend --network verhub-net \
  -p 80:80 -p 443:443 \
  docker.io/ivanhanloth/verhub-frontend:latest
```

## 数据库与 Prisma

常见流程：

```bash
# 生成 Prisma Client
pnpm --filter @workspace/backend prisma:generate

# 执行迁移
pnpm --filter @workspace/backend prisma:migrate
```

建议：修改 Prisma schema 后先生成客户端，再进行类型检查，避免出现误判错误。

## 代码质量门禁

仓库启用了 Husky + lint-staged。提交前会自动执行 lint 和格式化。

请在提交前主动执行：

```bash
pnpm lint
pnpm typecheck
```

## 分支与提交建议

1. 使用短生命周期功能分支
2. 单次提交聚焦一个目标
3. PR 描述中附带验证步骤与影响范围

## 多语言 SDK（进行中）

仓库新增了统一命名空间的 SDK 初版，目录如下：

- `sdk/typescript`：TypeScript SDK（public + admin）
- `sdk/python`：Python SDK（public + admin）
- `sdk/vanilla-js`：vanilla JS SDK（仅 public）

统一约定：

- 命名空间统一为 `VerhubSDK`
- TypeScript: `sdk.publicApi` / `sdk.adminApi`
- Python: `sdk.public_api` / `sdk.admin_api`（同时提供 `publicApi` / `adminApi` 兼容别名）
- vanilla JS: 仅 `sdk.publicApi`

接口覆盖范围以 Web 文档中心展示接口为准（`web/lib/api-docs/registry.ts`），避免封装文档外的私有接口。

## CI/CD 集成示例：自动增加版本与公告

下面示例展示如何在 GitHub Actions 中，在发布后自动调用管理接口创建版本和公告。

前置条件：

- 已在仓库 Secret 中配置 `VERHUB_BASE_URL`（例如 `https://api.example.com/api/v1`）
- 已配置 `VERHUB_ADMIN_TOKEN`（Bearer Token）
- 工作流触发时可拿到版本号（如 `v1.2.3`）

```yaml
name: Verhub Publish Notify

on:
  workflow_dispatch:
    inputs:
      version:
        description: "发布版本号，例如 1.2.3"
        required: true

jobs:
  notify-verhub:
    runs-on: ubuntu-latest
    steps:
      - name: Create version in Verhub
        env:
          VERHUB_BASE_URL: ${{ secrets.VERHUB_BASE_URL }}
          VERHUB_ADMIN_TOKEN: ${{ secrets.VERHUB_ADMIN_TOKEN }}
          RELEASE_VERSION: ${{ inputs.version }}
        run: |
          curl -sS -X POST "${VERHUB_BASE_URL}/admin/projects/verhub/versions" \
            -H "Authorization: Bearer ${VERHUB_ADMIN_TOKEN}" \
            -H "Content-Type: application/json" \
            -d "{\"version\":\"${RELEASE_VERSION}\",\"title\":\"Release ${RELEASE_VERSION}\",\"content\":\"Automated release by CI\",\"is_latest\":true,\"is_preview\":false}"

      - name: Create announcement in Verhub
        env:
          VERHUB_BASE_URL: ${{ secrets.VERHUB_BASE_URL }}
          VERHUB_ADMIN_TOKEN: ${{ secrets.VERHUB_ADMIN_TOKEN }}
          RELEASE_VERSION: ${{ inputs.version }}
        run: |
          curl -sS -X POST "${VERHUB_BASE_URL}/admin/projects/verhub/announcements" \
            -H "Authorization: Bearer ${VERHUB_ADMIN_TOKEN}" \
            -H "Content-Type: application/json" \
            -d "{\"title\":\"版本 ${RELEASE_VERSION} 已发布\",\"content\":\"本次发布由 CI 自动同步到 Verhub。\",\"is_pinned\":false,\"author\":\"github-actions\"}"
```

建议：

- 将项目键 `verhub` 抽为变量，适配多项目流水线
- 在调用前增加一次健康检查与权限校验
- 失败时输出响应体并中止流水线，避免“代码已发布但公告未同步”的不一致状态
