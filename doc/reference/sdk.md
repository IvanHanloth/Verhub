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
  项目、各类统计、按 id 操作行为）不受影响。绑定可事后用 `set_project_key`
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
- **两类错误**：服务端返回非 2xx 抛 `VerhubApiError`（带 `status` / `message` /
  `body`），请求没到服务端抛 `VerhubConnectionError`，都继承自 `VerhubError`。

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
| 提交反馈       | `create_feedback`            | `createFeedback`          | `POST /public/{k}/feedbacks`              |
| 上报日志       | `upload_log`                 | `uploadLog`               | `POST /public/{k}/logs`                   |
| 上报行为       | `create_action_record`       | `createActionRecord`      | `POST /public/{k}/actions`                |

### `admin` 命名空间

| 操作                | Python / Rust                      | TS / 纯 JS                      | HTTP                                                      |
| ------------------- | ---------------------------------- | ------------------------------- | --------------------------------------------------------- |
| 项目列表            | `list_projects`                    | `listProjects`                  | `GET /admin/projects`                                     |
| 创建项目            | `create_project`                   | `createProject`                 | `POST /admin/projects`                                    |
| 项目详情            | `get_project`                      | `getProject`                    | `GET /admin/projects/{k}`                                 |
| 更新项目            | `update_project`                   | `updateProject`                 | `PATCH /admin/projects/{k}`                               |
| 删除项目            | `delete_project`                   | `deleteProject`                 | `DELETE /admin/projects/{k}`                              |
| 项目统计            | `get_project_statistics`           | `getProjectStatistics`          | `GET /admin/projects/statistics`                          |
| 预览 GitHub 仓库    | `preview_github_repo`              | `previewGithubRepo`             | `GET /admin/projects/github-repo-preview`                 |
| 版本列表            | `list_versions`                    | `listVersions`                  | `GET /admin/projects/{k}/versions`                        |
| 创建版本            | `create_version`                   | `createVersion`                 | `POST /admin/projects/{k}/versions`                       |
| 版本详情            | `get_version`                      | `getVersion`                    | `GET /admin/projects/{k}/versions/{id}`                   |
| 更新版本            | `update_version`                   | `updateVersion`                 | `PATCH /admin/projects/{k}/versions/{id}`                 |
| 按版本号建/改       | `upsert_version`                   | `upsertVersion`                 | `PUT /admin/projects/{k}/versions/by-version/{v}`         |
| 删除版本            | `delete_version`                   | `deleteVersion`                 | `DELETE /admin/projects/{k}/versions/{id}`                |
| 版本统计            | `get_version_statistics`           | `getVersionStatistics`          | `GET /admin/versions/statistics`                          |
| 预览 GitHub Release | `preview_github_release`           | `previewGithubRelease`          | `GET /admin/projects/{k}/versions/github-release-preview` |
| 导入 GitHub Release | `import_github_releases`           | `importGithubReleases`          | `POST /admin/projects/{k}/versions/github-release-import` |
| 公告列表            | `list_announcements`               | `listAnnouncements`             | `GET /admin/projects/{k}/announcements`                   |
| 创建公告            | `create_announcement`              | `createAnnouncement`            | `POST /admin/projects/{k}/announcements`                  |
| 公告详情            | `get_announcement`                 | `getAnnouncement`               | `GET /admin/projects/{k}/announcements/{id}`              |
| 更新公告            | `update_announcement`              | `updateAnnouncement`            | `PATCH /admin/projects/{k}/announcements/{id}`            |
| 删除公告            | `delete_announcement`              | `deleteAnnouncement`            | `DELETE /admin/projects/{k}/announcements/{id}`           |
| 公告统计            | `get_announcement_statistics`      | `getAnnouncementStatistics`     | `GET /admin/announcements/statistics`                     |
| 反馈列表            | `list_feedbacks`                   | `listFeedbacks`                 | `GET /admin/projects/{k}/feedbacks`                       |
| 补录反馈            | `create_feedback`                  | `createFeedback`                | `POST /admin/projects/{k}/feedbacks`                      |
| 反馈详情            | `get_feedback`                     | `getFeedback`                   | `GET /admin/projects/{k}/feedbacks/{id}`                  |
| 更新反馈            | `update_feedback`                  | `updateFeedback`                | `PATCH /admin/projects/{k}/feedbacks/{id}`                |
| 删除反馈            | `delete_feedback`                  | `deleteFeedback`                | `DELETE /admin/projects/{k}/feedbacks/{id}`               |
| 反馈统计            | `get_feedback_statistics`          | `getFeedbackStatistics`         | `GET /admin/feedbacks/statistics`                         |
| 日志列表            | `list_logs`                        | `listLogs`                      | `GET /admin/projects/{k}/logs`                            |
| 补录日志            | `create_log`                       | `createLog`                     | `POST /admin/projects/{k}/logs`                           |
| 日志统计            | `get_log_statistics`               | `getLogStatistics`              | `GET /admin/logs/statistics`                              |
| 行为定义列表        | `list_actions`                     | `listActions`                   | `GET /admin/projects/{k}/actions`                         |
| 创建行为定义        | `create_action`                    | `createAction`                  | `POST /admin/projects/actions`                            |
| 更新行为定义        | `update_action`                    | `updateAction`                  | `PATCH /admin/actions/{id}`                               |
| 删除行为定义        | `delete_action`                    | `deleteAction`                  | `DELETE /admin/actions/{id}`                              |
| 行为记录列表        | `list_action_records`              | `listActionRecords`             | `GET /admin/actions/{id}`                                 |
| 行为记录详情        | `get_action_record`                | `getActionRecord`               | `GET /admin/actions/record/{id}`                          |
| 行为定义统计        | `get_action_statistics`            | `getActionStatistics`           | `GET /admin/actions/statistics`                           |
| 行为记录统计        | `get_action_record_statistics`     | `getActionRecordStatistics`     | `GET /admin/actions/record/statistics`                    |
| 查 Webhook 配置     | `get_github_webhook`               | `getGithubWebhook`              | `GET /admin/projects/{k}/github-webhook`                  |
| 设置 Webhook secret | `set_github_webhook_secret`        | `setGithubWebhookSecret`        | `PUT /admin/projects/{k}/github-webhook`                  |
| 重置 Webhook secret | `regenerate_github_webhook_secret` | `regenerateGithubWebhookSecret` | `POST /admin/projects/{k}/github-webhook/regenerate`      |
| 清除 Webhook secret | `clear_github_webhook_secret`      | `clearGithubWebhookSecret`      | `DELETE /admin/projects/{k}/github-webhook`               |

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
from verhub_sdk import VerhubApiError, VerhubConnectionError

try:
    client.public.get_latest_version()
except VerhubApiError as exc:
    print(exc.status, exc.message)   # 非 2xx
except VerhubConnectionError as exc:
    print(exc.cause)                 # 没到服务端
```

```ts [TypeScript / JS]
import { VerhubApiError, VerhubConnectionError } from "verhub-sdk"

try {
  await client.public.getLatestVersion()
} catch (error) {
  if (error instanceof VerhubApiError) console.error(error.status, error.message)
  else if (error instanceof VerhubConnectionError) console.error(error.cause)
}
```

```rust [Rust]
use verhub_sdk::Error;

match client.public().get_latest_version().await {
    Ok(v) => println!("{}", v.version),
    Err(Error::Api { status, message, .. }) => eprintln!("{status}: {message}"),
    Err(Error::Connection(err)) => eprintln!("{err}"),
    Err(err) => eprintln!("{err}"),
}
```

:::

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

注意：只有平台是**自动探测**出来的时候才会顺带自动探测版本；一旦你显式指定了
`platform`，版本就不再自动填（避免「平台 linux、版本却是 windows 11」的错配），需要
时请一并显式给 `platform_version`。

## 发布说明

Python、TypeScript、Rust 三个 SDK 由仓库的 Release 工作流在打 `v*` tag 时自动
构建并发布到 PyPI / npm / crates.io，版本号由 `scripts/version.mjs` 统一写入，
始终与后端一致。纯 JS 版随仓库分发，其 `verhub-sdk.global.js` 由
`node sdk/vanilla-js/build.mjs` 从 ESM 源生成，CI 会校验二者同步。
