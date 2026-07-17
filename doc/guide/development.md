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

请参考部署文档中的模板，保存为 `docker-compose.yml`，然后执行：

```bash
docker compose --env-file .env -f docker-compose.yml pull
docker compose --env-file .env -f docker-compose.yml up -d
docker compose --env-file .env -f docker-compose.yml ps
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
  -v verhub-bootstrap:/bootstrap \
  docker.io/ivanhanloth/verhub-backend:latest

docker run -d --name verhub-frontend --network verhub-net \
  -p 80:80 -p 443:443 \
  docker.io/ivanhanloth/verhub-frontend:latest
```

后端默认允许所有来源的跨域请求，不再需要通过环境变量配置来源白名单。

## 数据库与 Prisma

常见流程：

```bash
# 生成 Prisma Client
pnpm --filter @workspace/backend prisma:generate

# 执行迁移
pnpm --filter @workspace/backend prisma:migrate
```

建议：修改 Prisma schema 后先生成客户端，再进行类型检查，避免出现误判错误。

更新治理约束（必须执行）：

- 数据库结构演进使用 Prisma migration：

```bash
pnpm --filter @workspace/backend prisma migrate dev
pnpm --filter @workspace/backend prisma migrate deploy
```

- 禁止将 `prisma db push` 用于生产或共享环境结构演进。
- 提交数据库变更时必须包含可审查 SQL（`packages/backend/prisma/migrations/*/migration.sql`），并在变更说明标注影响与回滚策略。

版本更新策略约定：

- 语义化版本号：`version`（展示用，可保持历史格式）。
- 可比较版本号：`comparable_version`（规则计算用），格式为 `数字段(.数字段)*[-(alpha|beta|rc)(.数字段(.数字段)*)?]`。
- 公开更新检查接口：`POST /api/v1/public/{projectKey}/versions/check-update`。
- 最新 preview 接口：`GET /api/v1/public/{projectKey}/versions/latest-preview`。
- 指定版本查询接口：`GET /api/v1/public/{projectKey}/versions/by-version/{version}`（支持语义化版本号与可比较版本号）。
- `check-update` 入参中若同时提交 `current_version` 与 `current_comparable_version`，服务端优先使用后者。

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

## 管理接口认证方式

**所有 `/admin/*` 接口统一鉴权：管理员 JWT 和 API Key 完全等价，任一有效即放行。** 统一走同一个请求头：

```
Authorization: Bearer <管理员 JWT 或 API Key>
```

服务端按凭据本身的形态自动识别：API Key 是 `vh_` 前缀的字符串，JWT 是三段点分结构，两者不会混淆。调用方不需要关心脚本里拿的是哪一种。

| 凭据       | 获取方式                              | 有效期                                | 典型场景              |
| ---------- | ------------------------------------- | ------------------------------------- | --------------------- |
| 管理员 JWT | `POST /auth/login`（用户名 + 密码）   | 由 `JWT_EXPIRES_IN` 控制，默认 2 小时 | 前端管理后台会话      |
| API Key    | 管理后台或 `POST /auth/api-keys` 创建 | 创建时指定，可长期有效                | CI/CD、脚本、外部系统 |

`X-API-Key: <key>` 作为兼容别名保留，仍可用于传 API Key；新接入建议统一用 `Authorization: Bearer`。两个头都给出时以 `X-API-Key` 为准。

### 权限：API Key 按 scope 授权

JWT 是管理员身份，天然拥有全部权限。API Key 则按 scope 逐个接口校验，规则很简单：

- 读接口（GET）要求 `<资源>:read`，写接口（POST/PUT/PATCH/DELETE）要求 `<资源>:write`；
- **写权限不隐含读权限**——需要读就显式授予 `:read`；
- 资源即 `projects` / `versions` / `announcements` / `feedbacks` / `logs` / `actions`，另有 `stats:read` 用于请求统计接口。

Key 的项目范围（全部项目或指定项目）也会一并校验。scope 或项目范围不匹配时返回 `401`。

### 例外：凭据管理接口只接受 JWT

`/auth/*` 下的凭据管理接口（创建、轮换、撤销 API Key，以及 `admin-profile`、`me`）**只接受管理员 JWT**，用 API Key 调用一律 `401`。

这是有意为之：否则任何一个 Key 都能凭 `tokens:write` 铸造出全权限的新 Key，scope 体系就形同虚设。换句话说，**不能用凭据去管理凭据**——新建 Key 必须由管理员登录后操作。

## 写入版本：创建 vs. 幂等发布

管理端有两个写入版本的接口（与其余管理接口一样，JWT 与 API Key 均可，API Key 需要 `versions:write`）：

| 接口                                                             | 语义                                                         |
| ---------------------------------------------------------------- | ------------------------------------------------------------ |
| `POST /admin/projects/{projectKey}/versions`                     | 只创建。项目下已存在同名版本号时返回 `409`。                 |
| `PUT /admin/projects/{projectKey}/versions/by-version/{version}` | 幂等发布。不存在则创建（`201`），已存在则就地更新（`200`）。 |

CI 流水线应优先用 `PUT`：它按版本号寻址，不需要先查出版本的数据库 id，重跑同一个工作流也不会因为版本已存在而失败。

`PUT` 的请求体字段全部可选，采用部分更新语义：

- 省略的字段保持原值；
- 显式提交 `null` 的字段会被置空（例如 `{"download_url": null}` 清空下载地址）；
- 路径里的版本号即目标版本，`version` 可以省略；若提交则必须与路径一致，否则返回 `400`；
- 新建时 `comparable_version` 省略则由版本号推导（去掉前导 `v`）。

## CI/CD 集成示例：自动增加版本与公告

下面示例展示如何在 GitHub Actions 中，在发布后自动调用管理接口发布版本和公告。

前置条件：

- 已在仓库 Secret 中配置 `VERHUB_BASE_URL`（例如 `https://api.example.com/api/v1`）
- 已配置 `VERHUB_API_KEY`，scope 至少包含 `versions:write` 与 `announcements:write`
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
      - name: Publish version to Verhub
        env:
          VERHUB_BASE_URL: ${{ secrets.VERHUB_BASE_URL }}
          VERHUB_API_KEY: ${{ secrets.VERHUB_API_KEY }}
          RELEASE_VERSION: ${{ inputs.version }}
        run: |
          curl -sS --fail-with-body \
            -X PUT "${VERHUB_BASE_URL}/admin/projects/verhub/versions/by-version/${RELEASE_VERSION}" \
            -H "Authorization: Bearer ${VERHUB_API_KEY}" \
            -H "Content-Type: application/json" \
            -d "{\"comparable_version\":\"${RELEASE_VERSION#v}\",\"title\":\"Release ${RELEASE_VERSION}\",\"content\":\"Automated release by CI\",\"is_latest\":true,\"is_preview\":false}"

      - name: Create announcement in Verhub
        env:
          VERHUB_BASE_URL: ${{ secrets.VERHUB_BASE_URL }}
          VERHUB_API_KEY: ${{ secrets.VERHUB_API_KEY }}
          RELEASE_VERSION: ${{ inputs.version }}
        run: |
          curl -sS --fail-with-body \
            -X POST "${VERHUB_BASE_URL}/admin/projects/verhub/announcements" \
            -H "Authorization: Bearer ${VERHUB_API_KEY}" \
            -H "Content-Type: application/json" \
            -d "{\"title\":\"版本 ${RELEASE_VERSION} 已发布\",\"content\":\"本次发布由 CI 自动同步到 Verhub。\",\"is_pinned\":false,\"author\":\"github-actions\"}"
```

建议：

- 将项目键 `verhub` 抽为变量，适配多项目流水线
- 在调用前增加一次健康检查与权限校验
- 上面用 `--fail-with-body` 让 HTTP 错误直接中止流水线并打印响应体，避免“代码已发布但公告未同步”的不一致状态
- 只给 CI 的 Key 授予它真正用到的 scope（这里是 `versions:write` + `announcements:write`）与项目范围，不要图省事授予全部
