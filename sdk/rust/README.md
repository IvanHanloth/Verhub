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

## 重试与超时

默认对**连接失败和幂等请求（GET）自动重试 2 次**并指数退避；`check_update` 这类
POST 不会被重放。用 `.retries(n)` 调整，`0` 关闭。`.timeout(...)` 管整体超时，
`.connect_timeout(...)` 可单独让连接阶段快速失败：

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

## 示例

```bash
VERHUB_BASE_URL=http://localhost:3080/api/v1 cargo run --example check_update -- verhub 1.1.0
```
