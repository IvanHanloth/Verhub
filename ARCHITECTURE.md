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

- `auth`：管理员登录（`AuthService`）、API Key 全生命周期管理（`ApiKeyManagementService`）、首次启动引导（`AdminBootstrapService`）
- `projects`：项目元数据与项目 CRUD
- `versions`：版本 CRUD（`VersionsService`）、GitHub Release 集成（`GithubReleaseService`）、更新检查（`VersionUpdateCheckService`）
- `announcements`：公告发布与管理
- `feedbacks`：用户反馈上报/管理
- `logs`：日志上报与日志查询
- `actions`：行为定义管理与行为记录上报
- `webhooks`：GitHub Release 推送接收（`GithubWebhookService`）与项目级 webhook secret 管理（`GithubWebhookSecretService`）
- `geo`：调用方来源解析。`GeoLocationService` 做 IP → 国家/地区解析与缓存，`ClientOriginService` 把请求拼装成各上报表要写入的来源字段。模块声明为 `@Global`，因为四个采集点都要用，且服务持有进程级缓存，不能被重复实例化
- `database`：PrismaService 与数据库连接能力
- `health`：服务健康检查
- `common`：跨模块共享工具函数（`nowSeconds`、`normalizeProjectKey`、`isUniqueViolation`）、请求上下文提取（`client-context`）与上报去重指纹（`dedup`）

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
- 第三方回调接口：`/webhooks/...`，既不走管理凭据也不属于客户端接口，不计入请求统计
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

GitHub Release Webhook 同步（Webhooks）：

- 接收端点 `POST /webhooks/github/{projectKey}`，只处理 `release` 事件的 `published` / `released` / `prereleased` / `created` / `edited`。
- **直接采用推送 payload 中的 release 数据，不回查 GitHub REST API**：`release` 事件内嵌的 release 资源与 REST 返回结构一致，回查只会增加延迟、消耗匿名调用 60 次/小时的限额，并让私有仓库额外需要 token。代价是「先建 Release 再传附件」的 CI 流程首个 payload 可能没有 assets，由后续 `edited` 推送补齐。
- 写入走 `VersionsService.upsertByVersion`：版本号不存在则创建，存在则按 GitHub 内容覆盖，与「以 GitHub 为准」的语义一致（与批量导入的“跳过已存在”策略刻意不同）。
- `deleted` / `unpublished` 不删除已有版本，避免客户端已解析到的下载地址凭第三方事件消失。
- `is_latest` 不由事件类型直接决定：预览版永不占用 latest，正式版只有在可比较版本号不低于当前 latest 时才接管，避免编辑旧 Release 把 latest 拉回旧版本。
- 无法解析为可比较版本号的 tag、草稿 Release 一律跳过并返回 `ignored` + 原因码，而不是报错——这些在 GitHub 的 Recent Deliveries 里比一条红色 500 更有信息量。

Webhook 鉴权（Project）：

- `githubWebhookSecret` 明文存储：HMAC-SHA256 需要用原始密钥重算签名，单向哈希（ApiKey 的做法）在这里不可用。
- 该端点不接受管理员 JWT 或 API Key，secret 为空即拒绝所有推送。
- 完整 secret 仅在设置/重新生成时返回一次，此后管理接口只返回末 4 位提示，避免 `projects:read` 凭据能够伪造推送。
- `main.ts` 以 `rawBody: true` 启动：签名覆盖请求体原始字节，重新序列化解析后的对象会改变键序与空白，签名必然对不上。反向代理同样不得改写请求体。

项目级更新治理（Project）：

- `optionalUpdateMinComparableVersion` 与 `optionalUpdateMaxComparableVersion` 定义“可选更新范围”。
- 当前版本落在范围内：有新版本时可选更新。
- 当前版本超出范围：有新版本时强制更新。
- 公开接口 `POST /public/{projectKey}/versions/check-update` 统一返回更新判定、原因码、目标版本与里程碑上下文。

项目展示元数据（Project）：

- 新增可选字段：`author`、`authorHomepageUrl`、`iconUrl`、`websiteUrl`、`docsUrl`、`publishedAt`。
- 用于公共项目展示页与客户端启动信息补全；GitHub 仓库预览可自动回填上述信息（`docsUrl` 除外，仓库接口无对应字段，需手动填写）。
- 展示页的项目描述、版本更新内容与公告正文按 Markdown（GFM）渲染，渲染前经白名单清洗；管理端对应表单提供编写/预览切换。

调用方来源采集（Geo）：

- IP 取 `X-Forwarded-For` 最左项，其次 `CF-Connecting-IP` / `True-Client-IP` / `X-Real-IP`，最后回退到连接地址。左值可被客户端伪造，这里可以接受：它是遥测而非鉴权；换成 socket 地址反而会把所有请求都记成反向代理的地址。写库前统一归一化（去端口、解包 `::ffff:` 形式的 IPv4）。
- 地区解析走公开免费接口，默认按 `pconline.com.cn（太平洋科技）→ cz88.net（纯真网络）→ ipwho.is → freeipapi.com → ipapi.co → ip-api.com` 顺序回退。前两家是国内接口，返回本土化中文省市名、对国内 IP 命中率更高，排在最前；它们只覆盖国内线路，境外 IP 解析不出来会自动落到后面的国际供应商。国际部分 HTTPS 优先，`ip-api.com` 免费档只有明文 HTTP 所以排最后。pconline 返回 GBK，须按 `charset` 解码否则中文乱码。自托管场景不应要求运维去注册任何账号，代价是每家都有限流、都可能消失，所以没有任何一家是必需的。
- 解析结果持久化在 `IpGeoCache`（按 IP 主键），命中顺序为：私网短路 → 进程内 Map → `IpGeoCache` 表 → 供应商链。失败同样入缓存（`source = "NONE"`，TTL 15 分钟），否则每个请求都会重放整条链。进程内缓存有条数上限：它以客户端 IP 为键，而这个键由不可信调用方控制。
- `VERHUB_GEO_TIMEOUT_MS` 是**整条链**的预算而非单家的超时。上报接口会等待解析完成（写入的那一行需要带上地区），若按单家计时，四家都慢就会在客户端的一次日志上报上叠成十秒。超预算即记为 UNKNOWN——缺个地区远比请求挂住轻。
- 其余环境变量：`VERHUB_GEO_ENABLED`（`false` 关闭出网解析）、`VERHUB_GEO_PROVIDERS`（逗号分隔，覆盖顺序）、`VERHUB_GEO_TTL_DAYS`。
- 国家码写入 `ApiRequestStat.region`（聚合表不存 IP），并作为独立列写入 `Log` / `Feedback` / `ActionRecord`。这些列刻意不塞进 `deviceInfo` / `http` 这类客户端自报的 JSON：一个可伪造、一个是服务端观测，混在一起排障时就分不清了。
- 国内来源精确到省市：`ApiRequestStat` 除国家码外还存省/市级行政区划码（`regionCode`/`cityCode`，GB/T 2260），聚合按**码**分组而非中文名——太平洋科技返回「辽宁省/大连市」、纯真网络返回「辽宁/大连」，按名分组会把同一省劈成两桶，而两家的码一致（`210000`/`210200`）。境外与未定位无国标码，落空串 sentinel（NULL 会被 Postgres unique 视为互异，破坏 upsert-increment）。省份分布只取 `region=CN` 且省码非空的行，中文省名由后端静态表 `province-names.ts`（`Intl.DisplayNames` 不含中国省级）给出，随 overview 的 `by_province` 返回，前端据此渲染中国省级热力地图。市级码已入库，暂不在 UI 展开。
- 热力图（星期 × 小时）按**来源当地时区**折叠，而非查询者时区：回答的是「用户在其当地几点活跃」。聚合表只到国家码，故用 `region-timezone.ts` 的国家→代表时区静态表平移（中国全境 UTC+8 精确，美/俄等跨时区国家取代表时区近似），无法定位（UNKNOWN/LOCAL/表外）回退到查询者时区兜底。趋势图 timeseries 仍按查询者时区——那是给管理员看的绝对时间轴，两者口径不同是有意为之。

上报去重：

- `Log` / `Feedback` / `ActionRecord` 各有 `dedupHash` 列，指纹取「项目 + 载荷 + 调用方」。窗口内命中则直接返回已存在的那条记录，不新建行。
- 窗口由 `VERHUB_DEDUP_WINDOW_SECONDS` 控制，默认 60 秒，设为 0 或非法值即关闭。
- 语义刻意粗糙，不是精确一次投递：超过窗口的重试会被保留，因为真正在反复发生的事件本身就值得看见。行为记录的指纹不含 `http`——它带整套请求头，任何轮换字段（trace id、cookie）都会让每次重试看起来都不一样，整个检查就失效了。

## 4. 前端架构

前端管理端基于 Next.js App Router：

- 页面路由在 `web/app/*`
- 业务看板组件在 `web/components/*`
- API 客户端在 `web/lib/*-api.ts`
- 接口文档数据在 `web/lib/api-docs/*`（由 OpenAPI 契约生成，见第 5 节）
- 通用请求封装在 `web/lib/api-client.ts`
- 共享错误处理在 `web/lib/error-utils.ts`（`getErrorMessage`）
- 共享分页逻辑在 `web/hooks/use-pagination.ts`（`usePagination` hook）
- 跨页面项目选择同步在 `web/hooks/use-shared-project-selection.ts`
- 路由切换过渡在 `web/components/route-transition.tsx`（`RouteTransition`）：由后台布局、文档布局与各独立页面分别包裹内容区，不放在根布局，避免整页淡入影响常驻侧栏
- 统一弹窗模式基于 `@workspace/ui/components/dialog`：`DialogContent` 负责最大高度与自适应布局，`DialogBody` 负责内容滚动，`DialogFooter` 固定底部操作区

版本管理组件拆分：

- `web/components/versions/version-form-utils.ts`：表单类型、常量、纯函数（平台选项、日期转换、JSON 解析、输入构建）
- `web/components/versions/version-edit-dialog.tsx`：独立编辑弹窗组件

当前核心页面：

- 项目管理、版本管理、公告管理、反馈管理、日志审计

状态设计：

- 统一处理加载态、空态、错误态
- 管理员会话通过 localStorage + cookie 双写（便于前端请求与路由守卫）
- 需要项目上下文的页面统一使用 `useSharedProjectSelection`，通过 localStorage 与窗口事件跨页面同步默认项目

## 5. 接口文档单一数据源

`verhub.openapi.yaml` 是接口契约的唯一数据源，应用内文档站与管理端接口弹窗都由它生成，不再手写接口清单。

生成链路：

```
verhub.openapi.yaml
  └─ scripts/generate-api-docs.mjs  (pnpm api:sync)
       └─ web/lib/api-docs/openapi.generated.ts   # 生成物，勿手改
            └─ openapi-to-docs.ts → ApiEndpointDoc[]
                 ├─ /doc 文档站（web/app/doc/*）
                 └─ 管理端接口弹窗（ApiReferenceDrawer）
```

契约约定：

- `x-verhub-doc: true` 标记进入应用内文档站与管理端弹窗的接口；未标记的接口仍在契约中，但不进文档。
- `x-verhub-module` 可覆盖文档分组名；缺省时公开接口归 `Public`，管理接口按 `tags[0]` 分组。
- 文档展示的示例值全部取自契约里的 `example`（schema 级或参数级）；组合型 schema（列表响应等）由生成器按 properties 自动拼装。
- 鉴权信息由 `security` 推导：无声明即公开接口，`BearerAuth` 推导为管理员 JWT / API Key，`GithubSignatureAuth` 推导为 webhook 签名接口（单列一档可见性，不混进公开接口），`/auth/*` 下的凭据管理接口只接受 JWT。
- `Authorization` 请求头在 OpenAPI 里由 `security` 表达，文档的 Header 参数表由生成器按鉴权模式补出。

生成物 `openapi.generated.ts` 随仓库提交，因此 `pnpm dev` / `pnpm build` / Docker 构建都不需要额外步骤（Docker 前端构建上下文不含根目录的 yaml 与 `scripts/`，刻意没有把生成挂进构建）。**只有修改 `verhub.openapi.yaml` 后需要重新生成**，且有两道自动兜底：

- 提交时：lint-staged 检测到暂存了 `verhub.openapi.yaml`，自动跑生成器并把生成物一并 `git add`。
- CI：`.github/workflows/test.yml` 的 `web` job 跑前端单测，生成物过期即失败。

生成器输出会先过 prettier，保证与仓库格式一致，避免 lint-staged 的 prettier 与生成器反复互相改写。

一致性门禁：

- `packages/backend/src/openapi-contract.spec.ts`：断言 NestJS 注册路由与契约的 path+method 集合完全一致，任一侧漏写即失败。
- `web/lib/api-docs/openapi-generated.test.ts`：断言生成物与 yaml 同步，过期时提示执行 `pnpm api:sync`。
- `web/lib/api-docs/registry.test.ts`：断言已发布的 `/doc/<slug>` 地址全部可达，避免改契约时打断外链。

## 6. 扩展策略

可演进方向：

- 鉴权扩展：加入刷新令牌、细粒度角色权限（RBAC）
- 数据扩展：日志/反馈按冷热分层，必要时拆分时序或分析型存储
- 性能扩展：引入缓存与异步任务队列，降低高峰读写压力
- API 扩展：基于 OpenAPI 生成前端类型与 SDK，减少手写契约漂移

模块扩展原则：

- 新增业务能力优先新增独立模块
- 不在 Controller 中堆叠复杂逻辑
- 在 Service 层明确输入输出与异常语义

## 7. 部署说明

本地开发：

- 根目录 `pnpm dev` 启动多包开发
- 后端默认端口 `4000`

生产部署建议：

- 前端与后端分离部署
- 后端通过环境变量注入 `DATABASE_URL`、`JWT_SECRET` 等关键配置
- 部署前执行 `lint + typecheck + test` 作为门禁

CI 基线（`.github/workflows/test.yml`，两个 job 并行）：

- `web`：`@workspace/ui` 与 `web` 的 lint、typecheck，以及 web 单测（含接口契约的生成物同步与 `/doc` 链接守卫）
- `test`：Prisma client 生成后跑 backend 的 lint、typecheck、单测（带覆盖率）与 e2e
