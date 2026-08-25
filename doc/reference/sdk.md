# SDK 参考

Verhub 提供四个官方 SDK。它们共享同一套接口设计，只是命名按各语言习惯改写，
契约以仓库根目录的 [`verhub.openapi.yaml`](https://github.com/IvanHanloth/verhub/blob/main/verhub.openapi.yaml)
为准。同一个操作在四个 SDK 里对应同一个方法，只是大小写风格不同。

## 四个 SDK 一览

| 语言            | 包名                      | 安装                     | 引入                                        |
| --------------- | ------------------------- | ------------------------ | ------------------------------------------- |
| Python          | `verhub-sdk`（PyPI）      | `pip install verhub-sdk` | `from verhub_sdk import VerhubClient`       |
| TypeScript / JS | `verhub-sdk`（npm）       | `npm install verhub-sdk` | `import { VerhubClient } from "verhub-sdk"` |
| Rust            | `verhub-sdk`（crates.io） | `cargo add verhub-sdk`   | `use verhub_sdk::VerhubClient;`             |
| 纯 JS           | 随仓库分发                | 复制 `sdk/vanilla-js/`   | `<script>` 或 `import`                      |

前三者发布到各自的包管理平台，随主仓库版本一起发版。纯 JS 版是给不走打包器的
网页场景准备的零依赖、零构建替代品，代码在 `sdk/vanilla-js/` 目录里直接取用。

四个 SDK 的版本号始终与后端主版本一致（当前 `0.2.0`）。

## 统一设计约定

无论哪个语言，这几点都成立：

- **两个命名空间**：`public` 覆盖不需要凭据的公开接口（客户端 App 直接调用），
  `admin` 覆盖需要凭据的管理接口。两者共用同一份连接与凭据。
- **客户端绑定项目**：构造时传入 `project_key`，项目作用域的方法（几乎所有
  `public` 与大半 `admin` 方法）就不再逐次收项目参数；跨项目的方法（列出全部
  项目、各类统计、按 id 操作事件定义与看板卡片）不受影响。绑定可事后用 `set_project_key`
  更换；没绑定就调项目作用域方法会直接抛错。
- **`base_url` 带 `/api/v1` 前缀**：也就是浏览器里能直接打开 `/health` 的地址。
- **凭据即 JWT 或 API Key**：`POST /auth/login` 拿到的管理员 JWT（默认 2 小时
  过期）与后台签发的长期 API Key（`vh_` 前缀）在 `admin` 接口上等价。API Key
  另受 scope 与项目范围限制：读接口要 `<资源>:read`，写接口要 `<资源>:write`。
- **省略 ≠ 置空**：不传某字段表示「保持原值」，显式传 `null` 表示「提交 JSON
  null，把字段置空」。更新类接口靠这个区分意图，各语言的表达方式见下。
- **来源自动声明**：SDK 默认按运行环境探测平台**与系统版本**，通过
  `x-verhub-platform` / `x-verhub-platform-version` 两个请求头声明，仅用于服务端
  请求统计，**不影响任何接口的返回内容**。可在构造时覆盖，也可用
  `set_platform` / `set_platform_version` 事后更新。
- **三类错误**：缺凭据等**本地前置校验失败**（请求没发出去）抛 `VerhubAuthError`
  （Rust 为 `Error::MissingToken`），服务端返回非 2xx 抛 `VerhubApiError`（带
  `status` / `message` / `body`），请求没到服务端抛 `VerhubConnectionError`，都继承自
  `VerhubError`。
- **默认重试**：GET / HEAD 在连接失败与 502/503/504 时默认自动重试 2 次并指数退避；
  其余方法（含 check-update 这类 POST）一律不重放。各语言均可用 `retries` 调整或关闭。

::: warning 不要把管理凭据放进浏览器
`admin` 命名空间在纯 JS / TS 版里同样可用，但任何访客都能从前端代码里读到写死的
token。网页里请只用 `public`，`admin` 留给服务端脚本环境。
:::

## 构造客户端

::: code-group

```python [Python]
from verhub_sdk import VerhubClient

# 绑定项目；平台与系统版本默认自动探测
client = VerhubClient("https://verhub.example.com/api/v1", "verhub")

# 带凭据，并覆盖平台探测
client = VerhubClient(
    "https://verhub.example.com/api/v1",
    "verhub",
    token="vh_xxx",
    platform="linux",
    platform_version="ubuntu 24.04",
    timeout=10,
)
client.set_project_key("other")  # 事后更换绑定项目
client.set_token("vh_yyy")
```

```ts [TypeScript / JS]
import { VerhubClient } from "verhub-sdk"

const client = new VerhubClient({
  baseUrl: "https://verhub.example.com/api/v1",
  projectKey: "verhub",
})

const admin = new VerhubClient({
  baseUrl: "https://verhub.example.com/api/v1",
  projectKey: "verhub",
  token: "vh_xxx",
  platform: "linux",
  platformVersion: "ubuntu 24.04",
  timeoutMs: 10000,
})
admin.setProjectKey("other")
admin.setToken("vh_yyy")
```

```rust [Rust]
use std::time::Duration;
use verhub_sdk::{Platform, VerhubClient};

let client = VerhubClient::builder("https://verhub.example.com/api/v1")
    .project_key("verhub")
    .build()?;

let admin = VerhubClient::builder("https://verhub.example.com/api/v1")
    .project_key("verhub")
    .token("vh_xxx")
    .platform(Platform::Linux)
    .platform_version("ubuntu 24.04")
    .timeout(Duration::from_secs(10))
    .build()?;
admin.set_project_key("other");
admin.set_token("vh_yyy");
```

```js [纯 JS]
import { VerhubClient } from "./verhub-sdk.js"
// 或 <script src="./verhub-sdk.global.js"></script> 后用全局 VerhubClient

const client = new VerhubClient({
  baseUrl: "https://verhub.example.com/api/v1",
  projectKey: "verhub",
})
```

:::

Rust 的命名空间是方法：`client.public()` / `client.admin()`；其余语言是属性：
`client.public` / `client.admin`。

## 省略与置空的写法

| 语言       | 不提交（保持原值）     | 提交 null（置空）             |
| ---------- | ---------------------- | ----------------------------- |
| Python     | 不传该参数             | 显式传 `None`                 |
| TS / 纯 JS | 字段不写或 `undefined` | 字段设为 `null`               |
| Rust       | 字段留 `None`          | 允许置空的字段设 `Some(None)` |

::: code-group

```python [Python]
client.admin.update_version("ver-001", title="改个标题")     # 只动标题
client.admin.update_version("ver-001", download_url=None)    # 清空下载地址
```

```ts [TypeScript / JS]
await client.admin.updateVersion("ver-001", { title: "改个标题" })
await client.admin.updateVersion("ver-001", { download_url: null })
```

```rust [Rust]
use verhub_sdk::models::UpdateVersionInput;

client.admin().update_version("ver-001", &UpdateVersionInput {
    download_url: Some(None),          // 清空
    title: Some("改个标题".into()),     // 只动标题
    ..Default::default()
}).await?;
```

:::

## 方法对照表

下表左列是 Python 与 Rust 用的 snake_case 名字，右列是 TypeScript 与纯 JS 用的
camelCase 名字——同一行是同一个操作。参数含义详见各方法的行内注释与 OpenAPI 契约。
HTTP 列里的 `{k}` 是项目 key，由客户端绑定自动填入，方法本身不收该参数。

### 顶层

| 操作     | Python / Rust | TS / 纯 JS   | HTTP          |
| -------- | ------------- | ------------ | ------------- |
| 健康检查 | `health`      | `health`     | `GET /health` |
| 设置凭据 | `set_token`   | `setToken`   | —             |
| 清除凭据 | `clear_token` | `clearToken` | —             |

### `public` 命名空间

| 操作           | Python / Rust                | TS / 纯 JS                | HTTP                                      |
| -------------- | ---------------------------- | ------------------------- | ----------------------------------------- |
| 项目公开信息   | `get_project`                | `getProject`              | `GET /public/{k}`                         |
| 版本列表       | `list_versions`              | `listVersions`            | `GET /public/{k}/versions`                |
| 最新正式版本   | `get_latest_version`         | `getLatestVersion`        | `GET /public/{k}/versions/latest`         |
| 最新预览版本   | `get_latest_preview_version` | `getLatestPreviewVersion` | `GET /public/{k}/versions/latest-preview` |
| 按版本号取版本 | `get_version`                | `getVersion`              | `GET /public/{k}/versions/by-version/{v}` |
| 检查更新       | `check_update`               | `checkUpdate`             | `POST /public/{k}/versions/check-update`  |
| 公告列表       | `list_announcements`         | `listAnnouncements`       | `GET /public/{k}/announcements`           |
| 最新公告       | `get_latest_announcement`    | `getLatestAnnouncement`   | `GET /public/{k}/announcements/latest`    |
| 反馈提交选项   | `get_feedback_options`       | `getFeedbackOptions`      | `GET /public/{k}/feedbacks/options`       |
| 提交反馈       | `create_feedback`            | `createFeedback`          | `POST /public/{k}/feedbacks`              |
| 上报日志       | `upload_log`                 | `uploadLog`               | `POST /public/{k}/logs`                   |
| 记录事件       | `track`                      | `track`                   | 入队，攒批后发 `POST /public/{k}/events`  |
| 立即发送       | `flush`                      | `flush`                   | `POST /public/{k}/events`                 |
| 导出我的数据   | `export_my_data`             | `exportMyData`            | `GET /public/{k}/events/me`               |
| 删除我的数据   | `delete_my_data`             | `deleteMyData`            | `DELETE /public/{k}/events/me`            |
| 条款文档列表   | `list_terms`                 | `listTerms`               | `GET /public/terms`                       |
| 条款文档正文   | `get_terms`                  | `getTerms`                | `GET /public/terms/{slug}`                |

> 条款文档是**实例级**的，不作用于绑定项目，因此不需要 `projectKey` 也能调用。
> `slug` 目前有 `privacy-policy`（隐私政策）与 `sdk-compliance`（SDK 合规性文档）；
> 实例未自定义时返回内置正文，所以已登记的文档任何时候都有正文可读。

> 反馈能否转发到 GitHub Issue 由项目配置决定，先用 `get_feedback_options` 查
> `github_forward_available` 再决定是否给用户显示「同时提交到 GitHub Issue」的选项。
> 勾选后在 `create_feedback` 里传 `forward_to_github: true`，此时：
>
> - `contact` 必填。这条 SDK 在本地就拒绝（Python/TS/纯 JS 抛 `VerhubError`，Rust 返回
>   `Error::MissingContact`），请求不会发出，省掉一次注定失败的往返。
> - 项目是否开放转发只有服务端知道（客户端可能拿着缓存的旧选项）。未开放时提交返回
>   400，超出单 IP 转发限流返回 429，两者的原因文案都可直接展示给用户。
> - **只有 Issue 建成功，这条反馈才会被记录**。GitHub 侧失败时返回 503 且服务端不留任何
>   记录，客户端应提示用户稍后重试、或去掉转发再提交——不要当成「已提交」。
> - 成功返回的 `FeedbackItem` 带 `forwarded_to_github`、`github_issue_number` 与
>   `github_issue_url`，可直接把 Issue 链接展示给用户。
>
> 服务端拒绝一律以 `VerhubApiError`（Rust `Error::Api`）原样抛给调用方，由客户端决定
> 如何提示用户。

### `admin` 命名空间

| 操作                | Python / Rust                          | TS / 纯 JS                         | HTTP                                                       |
| ------------------- | -------------------------------------- | ---------------------------------- | ---------------------------------------------------------- |
| 项目列表            | `list_projects`                        | `listProjects`                     | `GET /admin/projects`                                      |
| 创建项目            | `create_project`                       | `createProject`                    | `POST /admin/projects`                                     |
| 项目详情            | `get_project`                          | `getProject`                       | `GET /admin/projects/{k}`                                  |
| 更新项目            | `update_project`                       | `updateProject`                    | `PATCH /admin/projects/{k}`                                |
| 删除项目            | `delete_project`                       | `deleteProject`                    | `DELETE /admin/projects/{k}`                               |
| 项目统计            | `get_project_statistics`               | `getProjectStatistics`             | `GET /admin/projects/statistics`                           |
| 预览 GitHub 仓库    | `preview_github_repo`                  | `previewGithubRepo`                | `GET /admin/projects/github-repo-preview`                  |
| 版本列表            | `list_versions`                        | `listVersions`                     | `GET /admin/projects/{k}/versions`                         |
| 创建版本            | `create_version`                       | `createVersion`                    | `POST /admin/projects/{k}/versions`                        |
| 版本详情            | `get_version`                          | `getVersion`                       | `GET /admin/projects/{k}/versions/{id}`                    |
| 更新版本            | `update_version`                       | `updateVersion`                    | `PATCH /admin/projects/{k}/versions/{id}`                  |
| 按版本号建/改       | `upsert_version`                       | `upsertVersion`                    | `PUT /admin/projects/{k}/versions/by-version/{v}`          |
| 删除版本            | `delete_version`                       | `deleteVersion`                    | `DELETE /admin/projects/{k}/versions/{id}`                 |
| 版本统计            | `get_version_statistics`               | `getVersionStatistics`             | `GET /admin/versions/statistics`                           |
| 预览 GitHub Release | `preview_github_release`               | `previewGithubRelease`             | `GET /admin/projects/{k}/versions/github-release-preview`  |
| 导入 GitHub Release | `import_github_releases`               | `importGithubReleases`             | `POST /admin/projects/{k}/versions/github-release-import`  |
| 公告列表            | `list_announcements`                   | `listAnnouncements`                | `GET /admin/projects/{k}/announcements`                    |
| 创建公告            | `create_announcement`                  | `createAnnouncement`               | `POST /admin/projects/{k}/announcements`                   |
| 公告详情            | `get_announcement`                     | `getAnnouncement`                  | `GET /admin/projects/{k}/announcements/{id}`               |
| 更新公告            | `update_announcement`                  | `updateAnnouncement`               | `PATCH /admin/projects/{k}/announcements/{id}`             |
| 删除公告            | `delete_announcement`                  | `deleteAnnouncement`               | `DELETE /admin/projects/{k}/announcements/{id}`            |
| 公告统计            | `get_announcement_statistics`          | `getAnnouncementStatistics`        | `GET /admin/announcements/statistics`                      |
| 反馈列表            | `list_feedbacks`                       | `listFeedbacks`                    | `GET /admin/projects/{k}/feedbacks`                        |
| 补录反馈            | `create_feedback`                      | `createFeedback`                   | `POST /admin/projects/{k}/feedbacks`                       |
| 反馈详情            | `get_feedback`                         | `getFeedback`                      | `GET /admin/projects/{k}/feedbacks/{id}`                   |
| 更新反馈            | `update_feedback`                      | `updateFeedback`                   | `PATCH /admin/projects/{k}/feedbacks/{id}`                 |
| 删除反馈            | `delete_feedback`                      | `deleteFeedback`                   | `DELETE /admin/projects/{k}/feedbacks/{id}`                |
| 反馈统计            | `get_feedback_statistics`              | `getFeedbackStatistics`            | `GET /admin/feedbacks/statistics`                          |
| 日志列表            | `list_logs`                            | `listLogs`                         | `GET /admin/projects/{k}/logs`                             |
| 补录日志            | `create_log`                           | `createLog`                        | `POST /admin/projects/{k}/logs`                            |
| 日志统计            | `get_log_statistics`                   | `getLogStatistics`                 | `GET /admin/logs/statistics`                               |
| 事件定义列表        | `list_event_definitions`               | `listEventDefinitions`             | `GET /admin/projects/{k}/events/definitions`               |
| 更新事件定义        | `update_event_definition`              | `updateEventDefinition`            | `PATCH /admin/projects/{k}/events/definitions/{id}`        |
| 删除事件定义        | `delete_event_definition`              | `deleteEventDefinition`            | `DELETE /admin/projects/{k}/events/definitions/{id}`       |
| 事件概览            | `get_event_overview`                   | `getEventOverview`                 | `GET /admin/projects/{k}/events/stats/overview`            |
| 事件趋势            | `get_event_timeseries`                 | `getEventTimeseries`               | `GET /admin/projects/{k}/events/stats/timeseries`          |
| 事件分布            | `get_event_breakdown`                  | `getEventBreakdown`                | `GET /admin/projects/{k}/events/stats/breakdown`           |
| 事件热力图          | `get_event_heatmap`                    | `getEventHeatmap`                  | `GET /admin/projects/{k}/events/stats/heatmap`             |
| 漏斗分析            | `get_funnel`                           | `getFunnel`                        | `POST /admin/projects/{k}/events/analysis/funnel`          |
| 留存分析            | `get_retention`                        | `getRetention`                     | `POST /admin/projects/{k}/events/analysis/retention`       |
| 路径分析            | `get_paths`                            | `getPaths`                         | `POST /admin/projects/{k}/events/analysis/paths`           |
| 指标 DSL 求值       | `run_event_query`                      | `runEventQuery`                    | `POST /admin/projects/{k}/events/analysis/query`           |
| 看板卡片列表        | `list_dashboard_cards`                 | `listDashboardCards`               | `GET /admin/projects/{k}/events/dashboards/cards`          |
| 创建看板卡片        | `create_dashboard_card`                | `createDashboardCard`              | `POST /admin/projects/{k}/events/dashboards/cards`         |
| 更新看板卡片        | `update_dashboard_card`                | `updateDashboardCard`              | `PATCH /admin/projects/{k}/events/dashboards/cards/{id}`   |
| 删除看板卡片        | `delete_dashboard_card`                | `deleteDashboardCard`              | `DELETE /admin/projects/{k}/events/dashboards/cards/{id}`  |
| 删除某标识的事件    | `delete_event_subject`                 | `deleteEventSubject`               | `DELETE /admin/projects/{k}/events/subjects/{distinct_id}` |
| 查 Webhook 配置     | `get_github_webhook`                   | `getGithubWebhook`                 | `GET /admin/projects/{k}/github-webhook`                   |
| 设置 Webhook secret | `set_github_webhook_secret`            | `setGithubWebhookSecret`           | `PUT /admin/projects/{k}/github-webhook`                   |
| 重置 Webhook secret | `regenerate_github_webhook_secret`     | `regenerateGithubWebhookSecret`    | `POST /admin/projects/{k}/github-webhook/regenerate`       |
| 清除 Webhook secret | `clear_github_webhook_secret`          | `clearGithubWebhookSecret`         | `DELETE /admin/projects/{k}/github-webhook`                |
| 查 GitHub App 配置  | `get_github_app_config`                | `getGithubAppConfig`               | `GET /admin/github-app`                                    |
| 改 GitHub App 配置  | `update_github_app_config`             | `updateGithubAppConfig`            | `PUT /admin/github-app`                                    |
| 清 GitHub App 配置  | `clear_github_app_config`              | `clearGithubAppConfig`             | `DELETE /admin/github-app`                                 |
| 查 GitHub 集成      | `get_github_integration`               | `getGithubIntegration`             | `GET /admin/projects/{k}/github-integration`               |
| 改 GitHub 集成      | `update_github_integration`            | `updateGithubIntegration`          | `PUT /admin/projects/{k}/github-integration`               |
| 预览仓库 Issue 模板 | `get_github_integration_repo_template` | `getGithubIntegrationRepoTemplate` | `GET /admin/projects/{k}/github-integration/repo-template` |
| 条款文档设置列表    | `list_terms_documents`                 | `listTermsDocuments`               | `GET /admin/terms/documents`                               |
| 查单份条款文档      | `get_terms_document`                   | `getTermsDocument`                 | `GET /admin/terms/documents/{slug}`                        |
| 改条款文档          | `update_terms_document`                | `updateTermsDocument`              | `PUT /admin/terms/documents/{slug}`                        |
| 恢复内置条款正文    | `reset_terms_document`                 | `resetTermsDocument`               | `DELETE /admin/terms/documents/{slug}`                     |

> GitHub App 实例配置（`/admin/github-app`）只接受管理员 JWT；用 API key 调用会得到 401。
> 仓库模板预览拉取失败不抛异常，原因放在返回值的 `error` 字段里。
>
> 条款文档同样只接受管理员 JWT，且是实例级的，不作用于绑定项目。`update_terms_document`
> 是部分更新：`custom` 关掉时 `content` 仍会作为草稿留在库里，重新打开即可继续编辑；
> `content` 传空串表示清除草稿。`reset_terms_document` 关掉自定义开关并丢弃草稿，
> 前台随即回到内置正文。

## 常见流程：检查更新

客户端最常用的就是「报告当前版本，问要不要更新」。`current_version` 与
`current_comparable_version` 至少给一个：只给前者时服务端按版本号查库取其登记的
可比较版本号（该版本未登记会返回 400），两者都给时以后者为准。

::: code-group

```python [Python]
result = client.public.check_update(current_version="1.1.0")
if result["should_update"]:
    target = result["target_version"]
    print(target["version"], "强制" if result["required"] else "可选")
```

```ts [TypeScript / JS]
const result = await client.public.checkUpdate({ current_version: "1.1.0" })
if (result.should_update) {
  console.log(result.target_version?.version, result.required ? "强制" : "可选")
}
```

```rust [Rust]
use verhub_sdk::models::CheckUpdateInput;

let result = client.public().check_update(&CheckUpdateInput {
    current_version: Some("1.1.0".into()),
    ..Default::default()
}).await?;
if result.should_update {
    println!("{}", result.latest_version.version);
}
```

:::

## 错误处理

::: code-group

```python [Python]
from verhub_sdk import VerhubApiError, VerhubAuthError, VerhubConnectionError

try:
    client.admin.list_projects()
except VerhubAuthError as exc:
    print(exc)                       # 缺凭据，本地拦下，请求没发出去
except VerhubApiError as exc:
    print(exc.status, exc.message)   # 非 2xx
except VerhubConnectionError as exc:
    print(exc.cause)                 # 没到服务端
```

```ts [TypeScript / JS]
import { VerhubApiError, VerhubAuthError, VerhubConnectionError } from "verhub-sdk"

try {
  await client.admin.listProjects()
} catch (error) {
  if (error instanceof VerhubAuthError) console.error("缺凭据，请求没发出去")
  else if (error instanceof VerhubApiError) console.error(error.status, error.message)
  else if (error instanceof VerhubConnectionError) console.error(error.cause)
}
```

```rust [Rust]
use verhub_sdk::Error;

match client.admin().list_projects().await {
    Ok(page) => println!("{}", page.total),
    Err(Error::MissingToken) => eprintln!("缺凭据，请求没发出去"),
    Err(Error::Api { status, message, .. }) => eprintln!("{status}: {message}"),
    Err(Error::Connection(err)) => eprintln!("{err}"),
    Err(err) => eprintln!("{err}"),
}
```

:::

::: warning 缺凭据是本地前置校验，不是 401
调用 `admin` 接口却没设 token 时，SDK 在**请求发出前**就抛
`VerhubAuthError`（Rust 为 `Error::MissingToken`），而非伪造一个服务端 401。
早期版本抛的是 status 为 401 的 `VerhubApiError`，属破坏性变更——原先靠
`VerhubApiError` 捕获此情形的代码需补上 `VerhubAuthError`。
:::

## 重试、超时与异步

- **重试**：GET / HEAD 在连接失败与 502/503/504 时默认自动重试 2 次并指数退避，
  其余方法一律不重放；读超时也不重试（请求可能已在服务端生效）。四个语言的幂等方法
  集合相同。各语言用 `retries`（Python/TS/JS 为构造参数，Rust 为 `.retries(n)`）调整，
  `0` 关闭。
- **超时**：Python 的 `timeout` 支持 `(connect, read)` 元组（也可直接传
  `httpx.Timeout`）、Rust 另有 `.connect_timeout(...)`，可让连接阶段快速失败、读取
  宽松些；TS/JS 基于 `fetch` 只有整体 `timeoutMs`。
- **User-Agent**：`app_identifier`（TS/JS 为 `appIdentifier`，Rust 为
  `.app_identifier(...)`）会追加到默认 UA 之后，保留 SDK 版本又便于统计；浏览器
  禁止脚本改写 UA，此项仅在服务端运行时生效。
- **异步**：Rust 与 TS/JS 原生异步；Python 额外提供 `AsyncVerhubClient`，接口面与
  同步版一致（方法要 `await`），底层是原生 `httpx.AsyncClient`，真正的非阻塞 I/O。
- **GUI（PySide6 等）**：Qt/tkinter 跑的是自己的事件循环，用不上 `await`。Python 同步
  客户端的 `client.background` 把调用丢到后台线程池，回调排队等主线程调用
  `drain()` 时才执行——接到框架自带的定时器上即可，SDK 不引入任何 GUI 依赖。

## 行为事件采集

### 埋一个点

事件名**无需预先在服务端登记**——服务端第一次收到就自动建立定义，随后出现在
后台的「行为分析 → 事件清单」里。

::: code-group

```ts [TS / JS / 浏览器]
client.public.track("checkout_clicked", { plan: "pro" })
```

```python [Python]
client.public.track("checkout_clicked", {"plan": "pro"})
```

```rust [Rust]
client.public().track("checkout_clicked", None).await?;
```

:::

`track` **入队即返回，不发起网络请求，也不阻塞调用方**——埋点写在 UI 事件处理里，
任何一次网络等待都会被用户感知成卡顿。队列满 20 条或每 5 秒发送一次；发送失败按
指数退避重试。每条事件带一个随机生成的幂等键，因此重发不会在服务端产生重复，这也
是**事件采集成为「提交类请求一律不重试」这条规则的唯一例外**的前提。

进程退出前调一次 `flush()`，把攒着还没发的最后一批送出去。

**浏览器不需要你操心这件事**：SDK 监听 `visibilitychange` 与 `pagehide`，在标签页被
关闭、切到后台或者跳转离开时用 `navigator.sendBeacon()` 把队列送出去。定时器在这里
救不了场——页面一关 `setTimeout` 就不会再触发了；而 `sendBeacon` 正是为此设计的，
浏览器会在页面消失之后继续完成投递，`fetch` 则会被直接中止。

浏览器拒收（载荷过大或投递队列已满）时事件留在 `localStorage`，下次打开页面补发。
beacon 设不了请求头，所以平台声明改走请求体——不这么做的话服务端会从 User-Agent
推断出宿主系统，与同一客户端经 `fetch` 上报的 `web` 对不上，平台分布就废了。

::: warning Rust 的差异
Rust 版不起后台定时任务（那会要求调用方必须在 tokio 运行时里，且任务生命周期不受
控），改为在下一次 `track` 时顺带检查是否已过发送间隔。因此 Rust 侧**必须**在退出前
调 `flush()`，否则最后一批会丢。
:::

| 环境              | 定时发送                | 退出时兜底                                           |
| ----------------- | ----------------------- | ---------------------------------------------------- |
| 浏览器            | 后台定时器              | `visibilitychange` / `pagehide` + `sendBeacon`，自动 |
| Node / Bun / Deno | 后台定时器              | 退出前自行调 `flush()`                               |
| Python            | 守护线程定时器          | `client.close()` 会自动 flush                        |
| Rust              | 无，随 `track` 检查间隔 | 退出前自行调 `flush()`                               |

### 它在设备上写什么

这是整个 SDK 里**唯一**会在设备上写入数据的能力，其余能力仍然一个字节都不落盘。
启用时会保存三样东西：

| 内容       | 说明                                                                           |
| ---------- | ------------------------------------------------------------------------------ |
| 匿名标识   | 首次调用 `track` 时生成的随机 UUID。**不读取任何设备特征**，与设备指纹是两回事 |
| 待发送队列 | 尚未上传的事件，进程重启后补发                                                 |
| 退出标记   | 用户退出后写入；不写的话退出在重启后就失效了                                   |

位置：浏览器为 `localStorage`；桌面端为用户状态目录下的 `verhub-sdk/<命名空间>.json`——
Windows 在 `%LOCALAPPDATA%`，macOS 在 `~/Library/Application Support`，Linux 在
`$XDG_STATE_HOME`（默认 `~/.local/state`）。

#### 命名空间：按自部署实例隔离

命名空间是 `<origin 哈希>-<小写 project_key>`，origin 只看协议+主机+端口，路径忽略。
带上实例地址是必须的：同一个 `project_key` 在两套自部署实例上是两批毫不相干的用户，
共用匿名标识会让统计串味，共用待发队列更会**把事件投递到错误的实例**。

| 场景                         | 结果                                      |
| ---------------------------- | ----------------------------------------- |
| 同实例、同项目、不同挂载路径 | 同一命名空间（粒度是 origin）             |
| 同实例、不同项目             | 各自独立                                  |
| 不同实例、同项目             | 各自独立                                  |
| 同实例、同项目、两个应用     | 默认共用；要独立就显式给 `namespace` 选项 |

哈希是 FNV-1a 32 位、按 UTF-8 字节计算，四个语言逐位一致——同一实例在任何语言下都落到
同一个命名空间。桌面端每个命名空间一个文件，写入「先写临时文件再原子替换」，进程中途
退出不会留下损坏的状态文件；同一命名空间下两个进程并发写仍是后写者赢，事件带幂等键，
最坏结果是重发而非重复入库。

换绑项目（`set_project_key` / `setProjectKey`）后队列按新命名空间重建，旧项目攒下的
事件留在它自己的文件里等下次补发，不会被错发进新项目。

**在应用调用 `track` 之前，一个字节都不会写入。**

需要一个稳定标识的唯一原因是：单条行为记录没有分析价值，漏斗与留存必须能把同一个
人的事件串起来才算得出来。

### 退出与同意

| 方法                                   | 效果                                                       |
| -------------------------------------- | ---------------------------------------------------------- |
| `opt_out()` / `optOut()`               | 停止采集、清空队列、**删除本地匿名标识**，并持久化退出标记 |
| `opt_in()` / `optIn()`                 | 撤销退出。生成**全新的**标识，不复用退出前的那个           |
| `has_opted_out()` / `hasOptedOut()`    | 查询当前状态                                               |
| `reset_identity()` / `resetIdentity()` | 保持采集但换标识，切断与既往序列的关联                     |
| `export_my_data()` / `exportMyData()`  | 导出该标识下的全部事件明细（GDPR Art.15 / Art.20）         |
| `delete_my_data()` / `deleteMyData()`  | 删除该标识下的全部事件明细（GDPR Art.17）                  |

浏览器环境下默认还会尊重 `navigator.globalPrivacyControl`（GPC）与
`navigator.doNotTrack`，命中任一即等同于用户已退出。

**用户退出后 SDK 根本不发请求**，而不是发一个会被服务端丢弃的请求。直接对接 HTTP
接口的接入方可以改用请求头 `x-verhub-do-not-track: 1`。

::: danger 面向欧盟用户必须开启事前同意
GDPR 要求行为分析类处理具备合法性基础（实践中即用户同意）；《电子隐私指令》第 5 条
第 3 款进一步要求**在设备上写入或读取信息之前**取得同意，分析用途不适用其中的
「严格必要」例外。

因此面向欧盟用户时，初始化必须传 `requireConsent`（Python 为 `require_consent`），
并在取得用户明确同意后才调用 `grant_consent()`。此前 SDK 不生成标识、不写盘、不采集，
期间产生的事件直接丢弃而非暂存。撤回同意用 `revoke_consent()`。

**同意的取得方式、范围与举证责任在接入方一侧**——SDK 与服务端都无从判断某一次调用
是否已经取得同意。
:::

### 配置

| 目标                   | 配置方式                                                                                                        |
| ---------------------- | --------------------------------------------------------------------------------------------------------------- |
| 完全关闭               | TS / 浏览器 `analytics: { enabled: false }`；Python `analytics={"enabled": False}`；Rust `.without_analytics()` |
| 只在同意后采集         | `requireConsent` / `require_consent`                                                                            |
| 不在设备上保存任何内容 | `persistence: "none"`（事件仍可上报，但无法做按人的分析）                                                       |
| 标识只在本次运行内有效 | `persistence: "session"`（漏斗仍可用，跨天留存无法计算）                                                        |
| 调整发送节奏           | `flushIntervalMs` / `batchSize` / `maxQueueSize`                                                                |
| 隔离本地状态           | `namespace`（默认由实例地址与项目算出，通常不用给）                                                             |

完整的字段清单、存储位置与合规义务见实例内的《SDK 合规性文档》与《隐私政策》。

## 平台声明与请求统计

服务端按 `x-verhub-platform` 请求头（SDK 自动带上）、query、请求体、User-Agent
的优先级推断调用方平台，用于后台的来源统计。SDK 默认探测结果：Windows / macOS /
Linux / iOS / Android 各归其位，浏览器与 Worker 记作 `web`，认不出的记作 `others`。

系统版本明细（如 `11`、`ubuntu 24.04`、`14.5.0`）也会**自动从系统信息提取**并经
`x-verhub-platform-version` 声明：Windows 按内核构建号还原市场版本号，macOS 取产品
版本号，Linux 读 `/etc/os-release` 拼成「发行版 版本号」；浏览器里取不到就留空，交给
服务端从 User-Agent 兜底。Rust 用 `os_info`，Python 用标准库，Node 用
`process.getBuiltinModule`——都不引入额外运行时依赖（Rust 除外的一个 crate）。

覆盖或关闭：

- 构造时传 `platform` / `platform_version`（TS 的 `platformVersion`）显式指定。
- 事后更新：`set_platform(...)` / `set_platform_version(...)`。
- 完全不声明平台：Python / TS 传 `platform=None` / `platform: null`，Rust 用
  `.without_platform()`。

两个维度**各管各的**：某一项显式给了就用给的，没给就自己探测。显式指定 `platform`
不会连带禁掉版本探测——绝大多数客户端都会声明自己的平台，若因此彻底报不上系统版本，
这个维度就形同虚设。唯一的例外是**显式关闭平台**（`platform=None` / `platform: null`
/ `.without_platform()`）：那是明确的退出声明，版本随之也不再自动探测；此时仍想报版本
的话，单独显式给 `platform_version` 即可。

::: warning 编码
`x-verhub-platform-version` 是 HTTP 头，只能承载 ASCII。SDK 在**存入时**就把这个值
（无论自动探测还是你显式给的）清洗一遍：非可打印 ASCII 的字符按空白处理、折叠连续
空白、按 32 字符截断，洗完为空则干脆不发这个头。
:::

## 发布说明

Python、TypeScript、Rust 三个 SDK 由仓库的 Release 工作流在打 `v*` tag 时自动
构建并发布到 PyPI / npm / crates.io，版本号由 `scripts/version.mjs` 统一写入，
始终与后端一致。纯 JS 版随仓库分发，其 `verhub-sdk.global.js` 由
`node sdk/vanilla-js/build.mjs` 从 ESM 源生成，CI 会校验二者同步。
