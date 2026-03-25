# Verhub 技术架构说明

本文档描述当前仓库的实际架构、模块边界、扩展策略与部署说明。

## 1. 总体架构

Verhub 采用 Monorepo + 模块化单体架构：

- Monorepo：`pnpm workspace` + `turbo`
- 后端：NestJS + Prisma + PostgreSQL
- 前端：Next.js App Router + React + Tailwind + shadcn/ui
- 工程化：ESLint + Prettier + Husky + lint-staged

目录分层：

- `packages/backend`：API 服务与领域逻辑
- `web`：管理端前端
- `packages/ui`：共享 UI 组件
- `packages/eslint-config`：共享 ESLint 配置
- `packages/typescript-config`：共享 TS 配置

## 2. 后端模块边界

后端以业务能力划分模块，边界如下：

- `auth`：管理员登录、JWT 鉴权、API Key 校验
- `projects`：项目元数据与项目 CRUD
- `versions`：版本发布与版本列表
- `announcements`：公告发布与管理
- `feedbacks`：用户反馈上报/管理
- `logs`：日志上报与日志查询
- `database`：PrismaService 与数据库连接能力
- `health`：服务健康检查

边界约束：

- Controller 只负责参数接收和响应输出
- Service 负责业务规则、聚合与仓储调用
- DTO 负责输入校验，不承载业务逻辑
- 模块之间通过 Service 接口协作，避免跨模块直接访问底层细节

## 3. 数据与接口约定

数据库策略：

- 统一使用 PostgreSQL
- ORM 为 Prisma，Schema 位于 `packages/backend/prisma/schema.prisma`

接口约定：

- HTTP 前缀：`/api/v1`
- 管理端接口：`/admin/...`
- 客户端公开接口：`/public/...`
- 响应字段采用 snake_case，与前端 API Client 保持一致

Token 范围模型（ApiKey）：

- `scopes`：权限白名单，后端按枚举校验
- `allProjects` + `projectIds`：项目范围控制，支持“全项目”或“项目白名单”
- `expiresAt`：过期时间，允许 `null`（永不过期）
- `previousKeyHash` + `previousKeyExpiresAt`：轮转后的旧 key 宽限期校验
- 过期策略为“拒绝访问但不自动删除记录”

版本发布策略（Version）：

- `isLatest`：标记当前项目最新稳定版本（同项目应至多一个）。
- `isPreview`：标记预发布版本（如 beta/rc）。
- `version`：语义化版本号（展示用，可保留历史命名习惯）。
- `comparableVersion`：可比较版本号（规则计算用），格式支持 `1.2.3`、`1.2.3-alpha`、`1.2.3-rc.2`。
- `isMilestone`：里程碑标记；用于标记关键升级节点版本。
- `isDeprecated`：版本废弃标记；命中后更新检查接口会返回必更。
- `publishedAt`：版本发布时间（Unix 秒级时间戳）。
- `downloadLinks`：结构化下载链接数组，支持多资源与可选元数据（name/platform）。
- 创建新稳定版本时默认自动提升为 latest；手动调整 latest 时后端负责同项目互斥维护。
- 支持从项目 `repoUrl` 对应的 GitHub Release 拉取版本草稿，用于减少重复录入。
- 支持在后台按项目从 GitHub Release 批量导入历史版本；若数据库已有同版本号，则跳过导入并保留数据库记录。

项目级更新治理（Project）：

- `optionalUpdateMinComparableVersion` 与 `optionalUpdateMaxComparableVersion` 定义“可选更新范围”。
- 当前版本落在范围内：有新版本时可选更新。
- 当前版本超出范围：有新版本时强制更新。
- 公开接口 `POST /public/{projectKey}/versions/check-update` 统一返回更新判定、原因码、目标版本与里程碑上下文。

项目展示元数据（Project）：

- 新增可选字段：`author`、`authorHomepageUrl`、`iconUrl`、`websiteUrl`、`publishedAt`。
- 用于公共项目展示页与客户端启动信息补全；GitHub 仓库预览可自动回填上述信息。

## 4. 前端架构

前端管理端基于 Next.js App Router：

- 页面路由在 `web/app/*`
- 业务看板组件在 `web/components/*`
- API 客户端在 `web/lib/*-api.ts`
- 通用请求封装在 `web/lib/api-client.ts`

当前核心页面：

- 项目管理、版本管理、公告管理、反馈管理、日志审计

状态设计：

- 统一处理加载态、空态、错误态
- 管理员会话通过 localStorage + cookie 双写（便于前端请求与路由守卫）
- 需要项目上下文的页面统一使用 `useSharedProjectSelection`，通过 localStorage 与窗口事件跨页面同步默认项目

## 5. 扩展策略

可演进方向：

- 鉴权扩展：加入刷新令牌、细粒度角色权限（RBAC）
- 数据扩展：日志/反馈按冷热分层，必要时拆分时序或分析型存储
- 性能扩展：引入缓存与异步任务队列，降低高峰读写压力
- API 扩展：基于 OpenAPI 生成前端类型与 SDK，减少手写契约漂移

模块扩展原则：

- 新增业务能力优先新增独立模块
- 不在 Controller 中堆叠复杂逻辑
- 在 Service 层明确输入输出与异常语义

## 6. 部署说明

本地开发：

- 根目录 `pnpm dev` 启动多包开发
- 后端默认端口 `4000`

生产部署建议：

- 前端与后端分离部署
- 后端通过环境变量注入 `DATABASE_URL`、`JWT_SECRET` 等关键配置
- 部署前执行 `lint + typecheck + test` 作为门禁

CI 基线：

- 仓库已提供 GitHub Actions 工作流，执行 lint、typecheck、backend test
