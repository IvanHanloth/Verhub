use std::sync::RwLock;
use std::time::Duration;

use percent_encoding::{utf8_percent_encode, NON_ALPHANUMERIC};
use reqwest::header::{HeaderMap, HeaderName, HeaderValue, ACCEPT, AUTHORIZATION, USER_AGENT};
use reqwest::Method;
use serde::de::DeserializeOwned;
use serde::Serialize;
use serde_json::Value;

use crate::error::{Error, Result};
use crate::models::Platform;
use crate::VERHUB_SDK_VERSION;

/// 客户端平台声明头。仅用于服务端请求统计，不影响接口返回内容。
pub const PLATFORM_HEADER: &str = "x-verhub-platform";

/// 客户端系统版本明细头，如 `11` / `ubuntu 24.04`；超过 32 字符会被服务端丢弃。
pub const PLATFORM_VERSION_HEADER: &str = "x-verhub-platform-version";

/// 系统版本明细的长度上限，与服务端一致，超出直接截断。
const MAX_PLATFORM_VERSION_LENGTH: usize = 32;

/// 猜测当前运行平台，用于填充 [`PLATFORM_HEADER`]。
///
/// 按编译目标区分契约里的七个取值；认不出时返回 [`Platform::Others`] 而不是
/// 瞎猜，服务端拿到 `others` 至少知道这是「说不清的平台」。
pub fn detect_platform() -> Platform {
    if cfg!(target_os = "windows") {
        Platform::Windows
    } else if cfg!(target_os = "macos") {
        Platform::Macos
    } else if cfg!(target_os = "ios") {
        Platform::Ios
    } else if cfg!(target_os = "android") {
        Platform::Android
    } else if cfg!(target_os = "linux") {
        Platform::Linux
    } else if cfg!(target_family = "wasm") {
        Platform::Web
    } else {
        Platform::Others
    }
}

/// 从系统信息里提取系统版本明细，用于填充 [`PLATFORM_VERSION_HEADER`]。
///
/// Windows 按内核构建号还原市场版本号（11 / 10），macOS 取产品版本号，Linux
/// 拼成 `发行版 版本号`。取不到就返回空串，交给服务端从 User-Agent 兜底推断。
pub fn detect_platform_version() -> String {
    use os_info::{Type, Version};

    let info = os_info::get();

    // Win11 内核仍是 10.0，只有构建号 >= 22000 能区分出来。
    if info.os_type() == Type::Windows {
        if let Version::Semantic(major, minor, build) = info.version() {
            if *major == 10 && *minor == 0 {
                return if *build >= 22000 { "11".into() } else { "10".into() };
            }
        }
    }

    let version = info.version().to_string();
    if version.is_empty() || version == "Unknown" {
        return String::new();
    }

    let combined = match info.os_type() {
        Type::Windows | Type::Macos => version,
        // 发行版名单独成维，拼进版本明细以对齐 "ubuntu 24.04" 的风格。
        other => format!("{} {}", other.to_string().to_lowercase(), version),
    };

    combined.chars().take(MAX_PLATFORM_VERSION_LENGTH).collect()
}

/// 两个命名空间共用的连接、凭据与来源声明。
#[derive(Debug)]
pub(crate) struct Inner {
    http: reqwest::Client,
    base_url: String,
    project_key: RwLock<Option<String>>,
    token: RwLock<String>,
    platform: RwLock<Option<Platform>>,
    platform_version: RwLock<Option<String>>,
}

/// 锁被毒化说明别处 panic 在持锁期间，值本身没坏，直接取回继续用。
fn read_lock<T>(lock: &RwLock<T>) -> std::sync::RwLockReadGuard<'_, T> {
    lock.read().unwrap_or_else(|e| e.into_inner())
}

fn write_lock<T>(lock: &RwLock<T>) -> std::sync::RwLockWriteGuard<'_, T> {
    lock.write().unwrap_or_else(|e| e.into_inner())
}

impl Inner {
    pub(crate) fn set_token(&self, token: impl Into<String>) {
        *write_lock(&self.token) = token.into();
    }

    pub(crate) fn clear_token(&self) {
        self.set_token(String::new());
    }

    pub(crate) fn set_project_key(&self, project_key: impl Into<String>) {
        *write_lock(&self.project_key) = Some(project_key.into());
    }

    pub(crate) fn project_key(&self) -> Option<String> {
        read_lock(&self.project_key).clone()
    }

    pub(crate) fn require_project_key(&self) -> Result<String> {
        self.project_key().ok_or(Error::MissingProjectKey)
    }

    pub(crate) fn set_platform(&self, platform: Option<Platform>) {
        *write_lock(&self.platform) = platform;
    }

    pub(crate) fn set_platform_version(&self, version: Option<String>) {
        *write_lock(&self.platform_version) = version;
    }

    fn token(&self) -> String {
        read_lock(&self.token).clone()
    }

    /// 发一个请求并把响应体反序列化成 `T`。
    ///
    /// `path` 已经是填好参数的路径，`query` 里值为 `None` 的项不会出现在 URL 上。
    pub(crate) async fn request<T, B>(
        &self,
        method: Method,
        path: &str,
        query: &[(&str, Option<String>)],
        body: Option<&B>,
        auth: bool,
    ) -> Result<T>
    where
        T: DeserializeOwned,
        B: Serialize + ?Sized,
    {
        let mut builder = self
            .http
            .request(method, format!("{}{}", self.base_url, path));

        // 来源声明随每次请求带上，支持事后用 set_platform 等改动。
        if let Some(platform) = *read_lock(&self.platform) {
            builder = builder.header(PLATFORM_HEADER, platform.as_str());
        }
        if let Some(version) = read_lock(&self.platform_version).clone() {
            if let Ok(value) = HeaderValue::from_str(&version) {
                builder = builder.header(PLATFORM_VERSION_HEADER, value);
            }
        }

        let pairs: Vec<(&str, String)> = query
            .iter()
            .filter_map(|(key, value)| value.as_ref().map(|v| (*key, v.clone())))
            .collect();
        if !pairs.is_empty() {
            builder = builder.query(&pairs);
        }

        if auth {
            let token = self.token();
            if token.is_empty() {
                return Err(Error::MissingToken);
            }
            builder = builder.header(AUTHORIZATION, format!("Bearer {token}"));
        }

        if let Some(payload) = body {
            builder = builder.json(payload);
        }

        let response = builder.send().await?;
        let status = response.status();
        let raw = response.text().await?;

        if !status.is_success() {
            let parsed: Option<Value> = serde_json::from_str(&raw).ok();
            return Err(Error::Api {
                status: status.as_u16(),
                message: error_message(parsed.as_ref())
                    .unwrap_or_else(|| format!("请求失败，HTTP {}", status.as_u16())),
                body: parsed,
            });
        }

        // 204 之类的空响应体：让 `T` 自己决定能不能从 `null` 反序列化出来。
        let text = if raw.is_empty() { "null" } else { raw.as_str() };
        serde_json::from_str(text).map_err(Error::Decode)
    }
}

/// NestJS 校验失败时 message 是字符串数组，这里合并成一行。
fn error_message(body: Option<&Value>) -> Option<String> {
    match body?.get("message")? {
        Value::String(text) => Some(text.clone()),
        Value::Array(items) if !items.is_empty() => Some(
            items
                .iter()
                .map(|item| match item {
                    Value::String(text) => text.clone(),
                    other => other.to_string(),
                })
                .collect::<Vec<_>>()
                .join("; "),
        ),
        _ => None,
    }
}

/// 把一个值编码成安全的 URL 路径片段。
pub(crate) fn segment(value: &str) -> String {
    utf8_percent_encode(value, NON_ALPHANUMERIC).to_string()
}

/// [`crate::VerhubClient`] 的构建器。
#[derive(Debug, Clone)]
pub struct VerhubClientBuilder {
    base_url: String,
    project_key: Option<String>,
    token: Option<String>,
    platform: Option<Option<Platform>>,
    platform_version: Option<String>,
    timeout: Option<Duration>,
    user_agent: Option<String>,
    headers: HeaderMap,
}

impl VerhubClientBuilder {
    /// `base_url` 须包含 `/api/v1` 前缀。
    pub fn new(base_url: impl Into<String>) -> Self {
        Self {
            base_url: base_url.into(),
            project_key: None,
            token: None,
            platform: None,
            platform_version: None,
            timeout: None,
            user_agent: None,
            headers: HeaderMap::new(),
        }
    }

    /// 绑定的项目标识；项目作用域的方法默认用它。
    pub fn project_key(mut self, project_key: impl Into<String>) -> Self {
        self.project_key = Some(project_key.into());
        self
    }

    /// 管理员 JWT 或 API Key；只调 public 接口时不用给。
    pub fn token(mut self, token: impl Into<String>) -> Self {
        self.token = Some(token.into());
        self
    }

    /// 覆盖自动探测出的平台。
    pub fn platform(mut self, platform: Platform) -> Self {
        self.platform = Some(Some(platform));
        self
    }

    /// 完全不声明平台（同时也不会自动探测系统版本）。
    pub fn without_platform(mut self) -> Self {
        self.platform = Some(None);
        self
    }

    /// 系统版本明细，如 `11` / `ubuntu 24.04`；省略时若平台也是自动探测则一并
    /// 从系统信息自动提取。
    pub fn platform_version(mut self, version: impl Into<String>) -> Self {
        self.platform_version = Some(version.into());
        self
    }

    /// 单次请求超时，默认 15 秒。
    pub fn timeout(mut self, timeout: Duration) -> Self {
        self.timeout = Some(timeout);
        self
    }

    /// 覆盖默认 User-Agent。
    pub fn user_agent(mut self, user_agent: impl Into<String>) -> Self {
        self.user_agent = Some(user_agent.into());
        self
    }

    /// 附加到每个请求上的头。
    pub fn header(mut self, name: HeaderName, value: HeaderValue) -> Self {
        self.headers.insert(name, value);
        self
    }

    pub(crate) fn build_inner(self) -> Result<Inner> {
        let base_url = self.base_url.trim().trim_end_matches('/').to_string();
        if !base_url.starts_with("http://") && !base_url.starts_with("https://") {
            return Err(Error::InvalidBaseUrl(self.base_url));
        }

        let mut headers = self.headers;
        headers.insert(ACCEPT, HeaderValue::from_static("application/json"));

        let user_agent = self
            .user_agent
            .unwrap_or_else(|| format!("verhub-sdk-rust/{VERHUB_SDK_VERSION}"));
        headers.insert(
            USER_AGENT,
            HeaderValue::from_str(&user_agent).map_err(|_| Error::InvalidBaseUrl(user_agent))?,
        );

        // 平台是自己探测出来的，才顺带把版本也探测了——用户指定了平台却由我们
        // 猜版本，很容易出现「平台 linux、版本却是 windows 11」的错配。
        let auto_platform = self.platform.is_none();
        let platform = self.platform.unwrap_or_else(|| Some(detect_platform()));
        let platform_version = match self.platform_version {
            Some(version) => Some(version),
            None if auto_platform && platform.is_some() => {
                let detected = detect_platform_version();
                (!detected.is_empty()).then_some(detected)
            }
            None => None,
        };

        let http = reqwest::Client::builder()
            .default_headers(headers)
            .timeout(self.timeout.unwrap_or(Duration::from_secs(15)))
            .build()?;

        Ok(Inner {
            http,
            base_url,
            project_key: RwLock::new(self.project_key),
            token: RwLock::new(self.token.unwrap_or_default()),
            platform: RwLock::new(platform),
            platform_version: RwLock::new(platform_version),
        })
    }
}
