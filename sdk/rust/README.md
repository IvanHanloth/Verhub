# Verhub SDK (Rust)

[Verhub](https://github.com/IvanHanloth/verhub) 版本与发布管理平台的官方 Rust SDK。

接口面与 Python / TypeScript / 纯 JS 版一一对应，方法名按 Rust 习惯写成 snake_case。
完整的方法清单与跨语言对照见[《SDK 参考》](https://ivanhanloth.github.io/Verhub/reference/sdk)。

## 安装

```bash
cargo add verhub-sdk
```

异步接口，基于 `reqwest`，需要一个 async 运行时（如 `tokio`）。
默认走 `rustls`，不依赖系统 OpenSSL；想用系统 TLS 就换 feature：

```toml
verhub-sdk = { version = "0.1", default-features = false, features = ["native-tls"] }
```

## 快速开始

```rust
use verhub_sdk::{models::CheckUpdateInput, VerhubClient};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // 绑定项目后，项目作用域的方法不再逐次传 project_key
    let client = VerhubClient::builder("https://verhub.example.com/api/v1")
        .project_key("verhub")
        .build()?;

    let result = client
        .public()
        .check_update(&CheckUpdateInput {
            current_version: Some("1.1.0".into()),
            ..Default::default()
        })
        .await?;

    if result.should_update {
        println!("{}", result.latest_version.version);
    }

    Ok(())
}
```

`base_url` 要带上 `/api/v1` 前缀，也就是浏览器里能直接打开 `/health` 的那个地址。

## 两个命名空间

- `client.public()` — 公开接口，不需要凭据，客户端 App 直接调用
- `client.admin()` — 管理接口，需要管理员 JWT 或 API Key

```rust
use std::time::Duration;
use verhub_sdk::{models::UpsertVersionInput, Platform, VerhubClient};

let client = VerhubClient::builder("https://verhub.example.com/api/v1")
    .project_key("verhub")
    .token("vh_xxx")
    .platform(Platform::Linux)
    .platform_version("ubuntu 24.04")
    .timeout(Duration::from_secs(10))
    .build()?;

client
    .admin()
    .upsert_version(
        "v1.2.0",
        &UpsertVersionInput {
            comparable_version: Some("1.2.0".into()),
            title: Some("稳定版".into()),
            is_latest: Some(true),
            ..Default::default()
        },
    )
    .await?;
```

凭据与绑定项目都可以事后更换：`client.set_token(token)` / `client.set_project_key(key)`。
没绑定项目就调项目作用域的方法会返回 `Error::MissingProjectKey`。
`VerhubClient` 内部是 `Arc`，克隆开销极小，跨任务共享直接 clone。

### 条款文档

隐私政策与 SDK 合规性文档是**实例级**的，不作用于绑定项目，因此不需要
`project_key` 也能读：

```rust
use verhub_sdk::{models::UpdateTermsDocumentInput, TermsDocumentSlug};

for doc in client.public().list_terms().await?.data {
    println!("{} {} {}", doc.slug, doc.title, doc.updated_at);
}

let policy = client.public().get_terms(TermsDocumentSlug::PrivacyPolicy).await?;
println!("{}", policy.content);   // Markdown；实例未自定义时是内置正文
```

管理端可以改写正文，只接受管理员 JWT（API Key 会得到 401）：

```rust
client
    .admin()
    .update_terms_document(
        TermsDocumentSlug::PrivacyPolicy,
        &UpdateTermsDocumentInput {
            custom: Some(true),
            content: Some("# 隐私政策\n...".into()),
        },
    )
    .await?;

// 关掉自定义并丢弃草稿
client.admin().reset_terms_document(TermsDocumentSlug::PrivacyPolicy).await?;
```

## 省略与置空

输入结构体的可选字段是 `Option<T>`，`None` 表示不提交该字段，更新接口会保持原值。
少数允许显式置空的字段（如 `download_url`）用 `Option<Option<String>>`：

```rust
UpdateVersionInput {
    download_url: Some(None),          // 提交 null，清空下载地址
    title: Some("改个标题".into()),     // 只动标题
    ..Default::default()
}
```

## 平台与系统版本声明

SDK 默认按编译目标探测平台，并用 `os_info` 从系统信息提取系统版本（Windows `11`、
`ubuntu 24.04`、macOS `14.5.0` 等），通过 `x-verhub-platform` /
`x-verhub-platform-version` 两个请求头声明，供服务端做来源统计——这不影响任何接口
的返回内容。用 `.platform(...)` / `.platform_version(...)` 覆盖，用
`.without_platform()` 完全不声明；也可事后 `client.set_platform(...)` /
`client.set_platform_version(...)`。

两项各管各的：显式给了就用给的，没给就自己探测——指定 `.platform(...)` 不影响版本
探测。只有 `.without_platform()` 这个明确的退出声明会连带停掉版本探测（此时仍可用
`.platform_version(...)` 单独指定）。

版本明细会在存入时清洗成能安全进 HTTP 头的形式：非可打印 ASCII 按空白处理、折叠
空白、按 32 字符截断，洗完为空则不发这个头。用错编码读出来的 `...[�汾 10.0...]`
这类串因此既不会让整个头被静默丢掉，也不会弄挂请求。

## 重试与超时

**GET / HEAD** 在连接失败与 502/503/504 时默认自动重试 2 次并指数退避；其余方法
（含 `check_update` 这类 POST）一律不重放。用 `.retries(n)` 调整，`0` 关闭。
`.timeout(...)` 管整体超时，`.connect_timeout(...)` 可单独让连接阶段快速失败：

```rust
let client = VerhubClient::builder(base_url)
    .project_key("verhub")
    .retries(3)
    .connect_timeout(Duration::from_secs(3))
    .timeout(Duration::from_secs(20))
    .build()?;
```

## User-Agent 与日志

默认 UA 是 `verhub-sdk-rust/<版本>`。想加自家应用标识做统计，用
`.app_identifier("MyApp/1.2")`（保留 SDK 版本）而非 `.user_agent(...)` 整体覆盖。
SDK 通过 `log` 门面在 `debug` 级打印每次请求的方法、URL 与状态码，接一个 `log`
实现（如 `env_logger`）即可看到。

## 错误处理

`Error` 区分了本地前置校验与服务端返回：缺凭据（`Error::MissingToken`）、未绑定
项目（`Error::MissingProjectKey`）、`base_url` 非法（`Error::InvalidBaseUrl`）都在
请求发出前返回，与服务端拒绝的 `Error::Api` 分得清清楚楚。

```rust
use verhub_sdk::Error;

match client.admin().list_projects().await {
    Ok(page) => println!("{}", page.total),
    Err(Error::MissingToken) => eprintln!("忘了设 token，请求没发出去"),
    Err(Error::Api { status, message, .. }) => eprintln!("{status}: {message}"),
    Err(Error::Connection(err)) => eprintln!("网络错误：{err}"),
    Err(err) => eprintln!("{err}"),
}
```

## 事件采集

```rust
client.public().track("checkout_clicked", None).await;
client.public().flush().await?;   // 进程退出前必须调一次
```

`track()` 入队即返回，不返回 `Result`——发送失败会留在队列里按指数退避重发，靠幂等键
保证不重复入库；埋点失败不该让业务代码多一条错误分支。要确认是否送达用 `flush()`。

**事件名无需预先在后台登记**，服务端第一次收到就自动建立定义。建议用小写下划线
形式，服务端只接受字母、数字、下划线、点、连字符与冒号。

> **与其余三个语言的唯一差异**：Rust 版不自己起后台定时任务——那会要求调用方必须在
> tokio 运行时里，且任务生命周期不受控。改成在 `track()` 时顺带检查「距上次发送是否
> 已超过 `flush_interval`」。因此**攒着的最后一批必须靠 `flush()` 发出去**，进程退出
> 前漏调就只能等下次启动补发。

### 攒批与发送时机

```rust
use std::time::Duration;
use verhub_sdk::{AnalyticsOptions, VerhubClient};

let client = VerhubClient::builder(base_url)
    .project_key("verhub")
    .analytics(AnalyticsOptions {
        flush_interval: Duration::from_secs(24 * 60 * 60),
        max_queue_size: 2000,
        ..Default::default()
    })
    .build()?;
```

| 字段              | 默认    | 说明                      |
| ----------------- | ------- | ------------------------- |
| `flush_interval`  | 5 秒    | 攒批的时间上限            |
| `batch_size`      | 20      | 攒够就发，**钳到 1..=50** |
| `max_queue_size`  | 500     | 队列上限，超出丢最旧的    |
| `session_timeout` | 30 分钟 | 会话空闲多久换新          |
| `state_path`      | 自动    | 自定义状态文件位置        |

两个条件谁先到算谁。`batch_size` 的上限 50 来自服务端单批限制
`VERHUB_EVENT_BATCH_MAX`，它同时也是每个请求的分片大小。

> 硬边界：**攒够 50 条一定会立即发**，`batch_size` 拦不住。所以「24 小时发一次」
> 成立的前提是这段时间内不足 50 条事件。低频功能通常没问题。

队列是落盘的，进程提前退出不会丢数据，下次启动读回来补发。所以拉长间隔的实际语义
是「**最长** 24 小时」。整个采集能力可以直接关掉：`.without_analytics()`。

### 本地存储

这是整个 SDK 里**唯一**会在设备上写入数据的能力。其余能力（查询、检查更新、反馈、
日志）仍然一个字节都不落盘。

| 平台    | 位置                                                                  |
| ------- | --------------------------------------------------------------------- |
| Windows | `%LOCALAPPDATA%\verhub-sdk\<命名空间>.json`                           |
| macOS   | `~/Library/Application Support/verhub-sdk/<命名空间>.json`            |
| Linux   | `$XDG_STATE_HOME/verhub-sdk/<命名空间>.json`，未设则 `~/.local/state` |

每个命名空间一个文件，文件里三个键：

| 键            | 内容                  |
| ------------- | --------------------- |
| `distinct_id` | 匿名标识，随机 UUIDv4 |
| `queue`       | 待发送事件            |
| `opt_out`     | 退出标记，值为 `"1"`  |

**匿名标识是随机数，不含任何设备特征**，也不读取设备上的既有标识（序列号、MAC、
广告 ID）。它只在本应用本实例内有效，跨应用、跨设备都识别不出同一个人。存在的唯一
理由是把同一使用者的事件串成序列——单条行为记录没有分析价值，漏斗与留存必须能组合
才算得出来。

标识不引 `uuid` / `getrandom`：合规文档逐条列出 SDK 的第三方依赖，为一个非安全用途
的标识多一项依赖不划算。`RandomState` 每次构造都由操作系统播种，两次取样即得 128 位。

#### 多实例、多项目怎么隔离

本地状态按**服务实例地址 + 项目标识**隔离，命名空间是 `<origin 哈希>-<小写 project_key>`
（origin 只看协议+主机+端口，路径忽略）。这一层是必须的：同一个 `project_key` 在两套
自部署实例上是两批毫不相干的用户，共用匿名标识会让统计串味，共用待发队列更会把事件
投递到错误的实例。

同一实例同一项目下的两个应用如需各自独立，显式给 `namespace`；四个语言的哈希实现逐位
一致，同一实例在任何语言下都落到同一个命名空间。

```rust
.analytics(AnalyticsOptions { namespace: Some("my-app".into()), ..Default::default() })
```

写入是「先写临时文件再 rename」，进程中途退出不会留下损坏的状态文件。同一命名空间下
两个进程同时写仍是后写者赢——事件带幂等键，最坏结果是重发（服务端去重）。

`set_project_key()` 换绑项目后，队列会按新命名空间重建；旧项目攒下的事件留在它自己的
文件里等下次补发，**不会**被错发进新项目。

目录不可写时静默退回内存。`persistence` 控制落盘程度：`Device`（默认）、`Session`
（只在内存里，重启即换新）、`None`（完全不生成持久标识，也不落盘）。

### 退出与同意

```rust
client.public().opt_out();          // 停采 + 清空队列 + 删除本地标识 + 落盘退出标记
client.public().opt_in();           // 撤销退出，生成【新的】标识，不复用退出前那个
client.public().has_opted_out();
client.public().reset_identity();   // 继续采集但换新标识，切断与既往序列的关联
client.public().distinct_id();      // 当前标识；未采集状态下为 None
```

`opt_out()` 会**删掉** `distinct_id` 与 `queue`，同时**写入** `opt_out`。退出标记本身
必须落盘，否则重启即失效——存「用户已拒绝」这个事实是执行用户选择所必需的，不在需要
同意的范围内。

面向欧盟用户必须开 `require_consent`：

```rust
.analytics(AnalyticsOptions { require_consent: true, ..Default::default() })
```

```rust
client.public().grant_consent();    // 取得同意后开闸
client.public().revoke_consent();   // 撤回，等价于 opt_out 并回到未同意状态
```

开启后在 `grant_consent()` 之前**一个字节都不写、一条都不采**（含匿名标识的生成），
事件直接丢弃而非在内存里暂存。ePrivacy Directive Art.5(3) 要求在设备上写入或读取
信息**之前**取得同意，分析用途不适用「严格必要」例外。同意的取得与举证由接入方
负责，SDK 无从判断某次调用是否已获授权。

Rust 侧没有浏览器的 GPC / DNT 信号，因此没有对应选项。服务端另有两道不依赖 SDK 的
闸门：请求头 `x-verhub-do-not-track: 1`，以及项目级总开关 `event_collection_enabled`。
命中任一都返回 202 但不入库、不计数——这是正常的用户选择，不是错误，所以不返回 4xx。

### 数据主体权利

```rust
client.public().export_my_data(None).await?;   // 导出（Art.15 / Art.20）
client.public().delete_my_data(None).await?;   // 删除（Art.17）
```

传 `None` 用本机当前标识；拿不到标识（采集未启用或已退出）返回
`Error::MissingDistinctId`，请求不会发出去。管理端可代为删除：
`client.admin().delete_event_subject(id)`。

删除范围是事件明细与日活去重记录；**小时汇总不删**。它只保存计数、不含任何标识符、
精度为自然小时，无法回溯到具体设备或还原访问序列，属于匿名数据。

## 示例

```bash
VERHUB_BASE_URL=http://localhost:3080/api/v1 cargo run --example check_update -- verhub 1.1.0
```
