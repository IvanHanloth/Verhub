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
- `events`：用户行为事件的采集与分析。**schema-on-write**——客户端直接报事件名，服务端第一次收到就自动登记 `EventDefinition`，上报不需要任何前置的后台操作（旧的 `actions` 模块要求先建定义、把 cuid 硬编码进客户端，从未被任何接入方集成，已整体移除）。写入分三层：明细 `EventRecord`（漏斗/留存/路径的唯一数据源，带 `distinctId`）、小时汇总 `EventStat`（照抄 `ApiRequestStat` 的原子自增与哨兵值约定）、日活去重 `EventActiveUser`。查询分两路：`stats/*` 走汇总，`analysis/*` 走明细。指标 DSL 在 `dsl/` 下，`compile.ts` 只产出参数化 SQL、`formula.ts` 用递归下降解析器求值（**不用 eval，也不把公式下推到 SQL**）
- `webhooks`：GitHub Release 推送接收（`GithubWebhookService`）与项目级 webhook secret 管理（`GithubWebhookSecretService`）
- `github-app`：GitHub App 集成。实例级凭据与功能开关（`GithubAppConfigService`，私钥经 `secret-box` AES-256-GCM 加密落库）、出站 API 客户端（`GithubAppClientService`，App JWT → installation token）、项目级功能配置（`ProjectGithubIntegrationService`）、反馈转发 Issue（`FeedbackIssueService`，模板来源与内置模板见 `feedback-issue-template.ts`，单 IP 转发限流见 `FeedbackForwardThrottler`）与评论命令触发工作流（`CommentCommandsService`，走 `POST /webhooks/github-app`）。功能采用三级判定：实例级 enabledFeatures 是总闸，项目级开关只能在总闸开启后打开且只表示「允许」，最终是否转发由提交者在 `forward_to_github` 里逐条选择。转发是提交事务的一部分而非旁路：Issue 建成功才保留反馈行（并记下 `forwardedToGithub` 与 Issue 编号/链接），失败则连带删除刚落库的行并把 503 返回给客户端——不能让用户以为问题已经报到仓库里
- `terms`：实例级条款文档（`TermsService`）。登记表见 `terms-documents.ts`，目前两份：《隐私政策》与《SDK 合规性文档》，内置正文在 `builtin/` 下、不入库。与反馈 Issue 模板同一套「开关 + 自定义正文」结构：关掉开关或草稿为空一律回落到内置正文，所以 `GET /public/terms/{slug}` 对已登记的文档任何时候都有正文可读。《隐私政策》面向最终用户，《SDK 合规性文档》面向接入方开发者（供其在自己的隐私政策里披露）、同时对最终用户公开；两份都逐项对应实际实现（各端点 DTO、事件采集在设备上写入的匿名标识与队列、四张统计表、去重指纹与事件幂等键、事件 IP 匿名化、归属地缓存与两套保留期），改动采集行为时必须同步修订，否则公示即失实。内置正文是模板：运营主体、联系方式等只有运营者知道的内容留成 `{{占位符}}`，键登记在 `placeholders.ts`（正文出现未登记的键会在模块加载时抛错），管理端据 `TermsDocumentConfigView.placeholders` 渲染填空表单、替换后把成品提交保存 —— 替换只发生在管理端，库里与前台都只有成品
- `geo`：调用方来源解析。`GeoLocationService` 做 IP → 国家/地区解析与缓存，`ClientOriginService` 把请求拼装成各上报表要写入的来源字段。模块声明为 `@Global`，因为四个采集点都要用，且服务持有进程级缓存，不能被重复实例化
- `database`：PrismaService 与数据库连接能力
- `health`：服务健康检查
- `common`：跨模块共享工具函数（`nowSeconds`、`normalizeProjectKey`、`isUniqueViolation`）、请求上下文提取（`client-context`）、上报去重指纹（`dedup`）与列表查询参数（`query-filters`：关键字归一化、`searchContains`、三态布尔）

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
- `comparableVersionSort`：`comparableVersion` 的定长排序键，由 `toComparableVersionSortKey` 生成并随写入落库。存在的理由是 `comparableVersion` 按 TEXT 排序会把 `3.1.0-rc.2` 排到 `3.1.0` 之上，与语义相反；有了它，版本列表分页与「最新版」判定都能直接走数据库索引。纯内部列，不出现在任何响应里。
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
- 完整 secret 仅在设置/重新生成时返回一次，此后管理接口只返回末 6 位提示，避免 `projects:read` 凭据能够伪造推送。
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

项目改名与别名（Project / ProjectAlias）：

- `projectKey` 既是主键也是对外访问标识。改名即变更 `projectKey`：子表与统计表的外键 `ON UPDATE CASCADE` 使内容整体迁到新键。
- 改名在一个事务里把**旧键登记为别名**（`ProjectAlias`，别名做主键、外键指向当前项目且 `ON UPDATE CASCADE`，故二次改名时别名链自动扁平地跟到最新键）。别名与项目键共享同一命名空间：新键不得撞上任何已有项目或别名。
- 所有按项目键定位的入口（公开详情/版本/公告、四个写接口、check-update、API Key 项目授权、统计拦截器、GitHub webhook 投递）统一经 `ProjectResolverService` 把外部键解析成当前规范键——旧键因此**透明**命中当前项目，客户端与 SDK 无需感知改名。
- 别名由改名自动产生，管理端可查看并删除；删除后旧键失效并重新变为可用键。`GET/DELETE /admin/projects/{projectKey}/aliases[/{alias}]`。

调用方来源采集（Geo）：

- IP 按「越难伪造越先信」取：CDN 自写的客户端地址头（`CF-Connecting-IP` / `True-Client-IP` / `EO-Client-IP` / `Ali-CDN-Real-IP` / `Fastly-Client-IP`，边缘节点会无条件覆盖，客户端伪造不进来）→ `X-Forwarded-For` → `X-Real-IP` → 连接地址。`VERHUB_CLIENT_IP_HEADER` 可覆盖整份清单（自家 CDN 用别的头名时）。
- `X-Forwarded-For` **不取最左项**，取右起第 `VERHUB_TRUSTED_PROXY_COUNT` 项（默认 1，即自带 nginx；套 CDN 应设 2）。链是逐跳追加的：每层可信反代追加它的直连对端，因此右起第 N 项才是访客，最左项由客户端自己写入——套 CDN 后信它就等于让任何人把自己报成任意地址。按跳数取到私网地址说明实际层数更多，继续向左找第一个公网地址兜底。层数设为 0 表示后端直接对外，转发头一概不信，只用连接地址。
- 仍不是鉴权级别的可信，取不准的代价只是一条统计记错地区；但换成 socket 地址会把所有请求都记成网关/边缘节点。写库前统一归一化（去端口、解包 `::ffff:` 形式的 IPv4）。
- 自带 nginx 配套：`X-Forwarded-For` 用 `$proxy_add_x_forwarded_for` 追加，`X-Real-IP` 经 `map` 保留上游已给出的值——直接写 `$remote_addr` 会在 CDN 后面把边缘节点地址盖上去。
- 地区解析走公开免费接口，默认按 `pconline.com.cn（太平洋科技）→ cz88.net（纯真网络）→ ipwho.is → freeipapi.com → ipapi.co → ip-api.com` 顺序回退。前两家是国内接口，返回本土化中文省市名、对国内 IP 命中率更高，排在最前；它们只覆盖国内线路，境外 IP 解析不出来会自动落到后面的国际供应商。国际部分 HTTPS 优先，`ip-api.com` 免费档只有明文 HTTP 所以排最后。pconline 返回 GBK，须按 `charset` 解码否则中文乱码。自托管场景不应要求运维去注册任何账号，代价是每家都有限流、都可能消失，所以没有任何一家是必需的。
- 解析结果持久化在 `IpGeoCache`（按 IP 主键），命中顺序为：私网短路 → 进程内 Map → `IpGeoCache` 表 → 供应商链。失败同样入缓存（`source = "NONE"`，TTL 15 分钟），否则每个请求都会重放整条链。进程内缓存有条数上限：它以客户端 IP 为键，而这个键由不可信调用方控制。
- `VERHUB_GEO_TIMEOUT_MS` 是**整条链**的预算而非单家的超时。上报接口会等待解析完成（写入的那一行需要带上地区），若按单家计时，四家都慢就会在客户端的一次日志上报上叠成十秒。超预算即记为 UNKNOWN——缺个地区远比请求挂住轻。
- 其余环境变量：`VERHUB_GEO_ENABLED`（`false` 关闭出网解析）、`VERHUB_GEO_PROVIDERS`（逗号分隔，覆盖顺序）、`VERHUB_GEO_TTL_DAYS`。
- 国家码写入 `ApiRequestStat.region`（聚合表不存 IP），并作为独立列写入 `Log` / `Feedback` / `EventRecord`。这些列刻意不塞进 `deviceInfo` / `http` 这类客户端自报的 JSON：一个可伪造、一个是服务端观测，混在一起排障时就分不清了。
- 国内来源精确到省市：`ApiRequestStat` 除国家码外还存省/市级行政区划码（`regionCode`/`cityCode`，GB/T 2260），聚合按**码**分组而非中文名——太平洋科技返回「辽宁省/大连市」、纯真网络返回「辽宁/大连」，按名分组会把同一省劈成两桶，而两家的码一致（`210000`/`210200`）。境外与未定位无国标码，落空串 sentinel（NULL 会被 Postgres unique 视为互异，破坏 upsert-increment）。省份分布只取 `region=CN` 且省码非空的行，中文省名由后端静态表 `province-names.ts`（`Intl.DisplayNames` 不含中国省级）给出，随 overview 的 `by_province` 返回，前端据此渲染中国省级热力地图。市级码已入库，暂不在 UI 展开。
- 热力图（星期 × 小时）按**来源当地时区**折叠，而非查询者时区：回答的是「用户在其当地几点活跃」。聚合表只到国家码，故用 `region-timezone.ts` 的国家→代表时区静态表平移（中国全境 UTC+8 精确，美/俄等跨时区国家取代表时区近似），无法定位（UNKNOWN/LOCAL/表外）回退到查询者时区兜底。趋势图 timeseries 仍按查询者时区——那是给管理员看的绝对时间轴，两者口径不同是有意为之。

公开上报限流：

- 四个公开写接口（`/public/{projectKey}/logs`、`/feedbacks`、`/events`、`/versions/check-update`）挂 `ClientIpThrottlerGuard`，单 IP 每分钟默认 300 次（`VERHUB_PUBLIC_RATE_LIMIT` 可调），超限返回 429。
- 数据主体权利的两个自助端点（`GET` / `DELETE /public/{projectKey}/events/me`）限流严得多：单 IP 每小时 10 次。正常用户一小时行使不了十次权利，而一个能无限次调用的导出接口本身就是个数据外泄面。
- 去重只挡重复载荷的存储，构造不同载荷的洪泛仍会无上限写库并触发 geo 解析，限流是这层的硬上限。
- 计数按 `extractClientIp` 解析出的真实客户端 IP，而非连接对端——否则 CDN/nginx 后面全体访客共用一个桶。只挂公开写接口：管理端与被 Next SSR 代理拉取的公开只读接口（版本列表、项目详情等）不限流，免得误伤 SSR 出口 IP。

上报去重：

- `Log` / `Feedback` 各有 `dedupHash` 列，指纹取「项目 + 载荷 + 调用方」。窗口内命中则直接返回已存在的那条记录，不新建行。
- **`EventRecord` 没有 `dedupHash`**，走的是另一套：客户端为每条事件生成 `eventId`，配合 `(projectKey, eventId)` 唯一索引与 `createMany({ skipDuplicates: true })` 精确去重。幂等键比模糊指纹严格更好——后者会把「用户连点三次」折叠成一次，而那恰恰是行为分析要采集的信号。这也是「提交类请求一律不重试」这条规则对事件采集网开一面的前提。

隐藏语义（`Log.isHidden` / `Feedback.isHidden` / `Announcement.isHidden`）：

- 日志与反馈：隐藏只影响后台列表的默认返回，需显式 `include_hidden=true` 才带出来。记录仍在，统计接口（日志等级分布、反馈评分均值）照常全量计算——隐藏是不展示，不是撤回数据。
- 日志的可修改面刻意只有 `is_hidden`（`PATCH /admin/projects/{projectKey}/logs/{logId}`）：正文、级别与来源是排障凭证，改了就不再是当时发生的事。
- 公告：隐藏是发布流程的一部分（先建后放），所以后台默认就列出隐藏的公告，`is_hidden` 在那里是筛选维度而非「要不要带出来」的开关；公开端永远只返回未隐藏的公告。

公告的可见版本范围与多语言：

- **可见版本范围**（`Announcement.minComparableVersion` / `maxComparableVersion`，闭区间、两端各自可空）。过滤发生在 SQL 层：范围两端各存一个定长排序键（`min/maxComparableVersionSort`，与 `Version.comparableVersionSort` 同一个生成函数），定长纯数字串的字典序即版本序，`lte` / `gte` 直接可用——不必把公告全量拉进内存过滤，分页也不会因此错位。公开端的 `version` 参数先当可比较版本号解析，解析不了再按 `version` 去版本表换算一次。**客户端没报版本号（或两条路都换算不出）时，带范围的公告一律不返回**：判断不了范围就不展示，把「仅限 2.x」推给不知道自己版本的客户端只会造成困惑。
- **多语言**（`AnnouncementTranslation` + `ProjectTranslation` + `ProjectLocale`）。默认内容始终在公告/项目自身，译文只是覆盖层，所以永远有兜底可返回。译文行是「某个语言下的覆盖设置」，各维度**逐字段独立**：公告的 `title` / `content` 与项目的 `name` / `description` 各自留空即回落默认值，公告另有 `isHidden` 表示该语言下整条不返回（与全局 `isHidden` 是两层，后者对所有人生效）。三项全空的译文行会被拒——存下来只会让人以为配过什么。回落链路只有一级，不做 `zh-CN → zh` 这类父语言回退。
- **语言注册**（`ProjectLocale`）。译文语言与客户端的语言偏好都必须命中这张白名单——没有它，客户端传什么语言都会命中库里的任意脏数据。`aliases` 提供多对一：主标签 `en` 列出 `en-US` / `en-GB` 后三种写法取到同一份译文，但返回体的 `locale` 始终是**主标签**（译文按主标签存，报出变体会让调用方以为存在一份独立译文）。只认显式列出的同义标签，不做 `en-*` 前缀自动回退：那样无法单独给某个地区变体做不同处理，出问题时也说不清为什么命中了这个语言。注册与匹配大小写不敏感，但保留录入时的原样写法——语言由项目自己定，服务端不替它猜 BCP 47 标准写法。注销语言**不删译文**，译文只是暂时不可达，重新注册即恢复。
- 响应里的 `locale` 字段标出这次返回的内容实际来自哪个语言（`null` = 默认内容），让客户端一眼看出有没有发生回落；只设了隐藏、没覆盖任何内容的译文不算「返回了译文」，`locale` 仍为 `null`。全量 `translations` 只在管理接口返回。

列表搜索：`search` 参数在各列表接口上语义一致——不区分大小写的子串匹配，命中字段由各 service 指定（见 OpenAPI 中每个端点的说明）。JSON 列（`custom_data` / `device_info` / `http`）一律不参与匹配：既慢又无从解释命中在哪。

- 窗口由 `VERHUB_DEDUP_WINDOW_SECONDS` 控制，默认 60 秒，设为 0 或非法值即关闭。
- 语义刻意粗糙，不是精确一次投递：超过窗口的重试会被保留，因为真正在反复发生的事件本身就值得看见。事件采集不适用这段语义，理由见上。

### 事件采集的两条额外规则

- **时钟钳制**：客户端声明的 `occurred_at` 落在 `[now - VERHUB_EVENT_CLOCK_SKEW_SECONDS, now + 5min]` 之外时回退到服务端接收时间。离线补发要求信任客户端时间（否则补上来的事件全堆在恢复联网那一刻），但不能让一台时钟错乱的设备把趋势图的横轴拉到没法看。
- **IP 匿名化**：`EventRecord.ip` 默认只存匿名化后的值（`VERHUB_EVENT_IP_STORAGE`，IPv4 截末段 / IPv6 截末 80 位）。**归属地解析在匿名化之前用完整地址完成**，所以地区统计精度不受影响。与 `Log` / `Feedback` 存完整 IP 的做法有意不同：事件量大一个数量级，且用途是聚合分析而非逐条排障。

## 4. 前端架构

前端管理端基于 Next.js App Router：

- 页面路由在 `web/app/*`
- 业务看板组件在 `web/components/*`
- API 客户端在 `web/lib/*-api.ts`
- 接口文档数据在 `web/lib/api-docs/*`（由 OpenAPI 契约生成，见第 5 节）
- 通用请求封装在 `web/lib/api-client.ts`
- 共享错误处理在 `web/lib/error-utils.ts`（`getErrorMessage`）
- 共享分页逻辑在 `web/hooks/use-pagination.ts`（`usePagination` hook）
- 后台列表统一用 `web/components/common/data-table.tsx`（`DataTable`），底座是 TanStack Table v9：一字段一列、列显隐（按 `storageKey` 持久化到 localStorage）、列宽拖拽、固定列、搜索框与筛选控件插槽、加载/空/错误态、行详情抽屉。只注册 `columnVisibilityFeature` / `columnSizingFeature` / `columnResizingFeature` / `columnPinningFeature` 四个特性——**不注册排序与过滤**：组件本身不做任何过滤，列表是服务端分页的，只在当前页里过滤或排序会让人把「不在这一页」误读成「没搜到」，所以搜索与筛选一律由页面带进请求；契约里也没有列表排序参数
- 列定义用 TanStack 原生 `ColumnDef`，由 `createDataTableColumns<T>()` 拿到绑好特性集的 helper，一律是 `helper.display`。列的展示元数据放 `meta`：`label`（列显隐菜单与抽屉字段名）、`defaultHidden`、`hideInDetail`、`pin`、`className` / `headerClassName`；能否隐藏走原生 `enableHiding`。列显隐存的是「隐藏列 id 数组」这个换底座之前就在用的格式，换格式会把用户已调好的偏好清空
- 行详情抽屉在 `web/components/common/data-table-detail.tsx`（基于 `@workspace/ui/components/sheet`）：字段由 `row.getAllCells()` 自动生成，**含默认隐藏的列**，另可用 `renderDetail` 补列覆盖不到的内容。抽屉是列表里唯一能读全长文本的地方——单元格一律截成一行，反馈/日志正文上限 4096 字，塞进行内没有任何读法
- `TruncatedCell` / `JsonCell` / `MarkdownCell` 靠 `data-table-cell-context.tsx` 分辨自己渲染在表格里还是抽屉里：表格里截断成一行，抽屉里分别展开成保留换行的全文、可折叠 JSON 树、渲染后的 Markdown。列定义因此只写一遍
- 列宽是首帧按内容自然排版实测出来后钉住的，之后才切 `table-layout: fixed`：既不用为七十来个列手写宽度魔数，翻页时也不会因为这页内容更长而整体跳一次；只有用户手工拖过的列宽才写进 localStorage
- 列表查询参数的拼装在 `web/lib/api-client.ts`（`buildListQuery`）：空串与 undefined 一律不落进 URL，否则后端会收到 `platform=` 这类空值参数并按非法取值拒绝
- 跨页面项目选择同步在 `web/hooks/use-shared-project-selection.ts`
- 路由切换过渡在 `web/components/route-transition.tsx`（`RouteTransition`）：由后台布局、文档布局与各独立页面分别包裹内容区，不放在根布局，避免整页淡入影响常驻侧栏
- 统一弹窗模式基于 `@workspace/ui/components/dialog`：`DialogContent` 负责最大高度与自适应布局，`DialogBody` 负责内容滚动，`DialogFooter` 固定底部操作区

版本管理组件拆分：

- `web/components/versions/version-form-utils.ts`：表单类型、常量、纯函数（平台选项、日期转换、JSON 解析、输入构建）
- `web/components/versions/version-edit-dialog.tsx`：独立编辑弹窗组件

当前核心页面：

- 项目管理、版本管理、公告管理、反馈管理、日志审计、Token 管理，均基于同一套 `DataTable`；行为分析（`/admin/events`，七个子页）复用统计大屏的图表组件，不另起一套

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
