use std::sync::{Arc, RwLock};
use std::time::Duration;

use percent_encoding::{utf8_percent_encode, NON_ALPHANUMERIC};
use reqwest::header::{HeaderMap, HeaderName, HeaderValue, ACCEPT, AUTHORIZATION, USER_AGENT};
use reqwest::Method;
use serde::de::DeserializeOwned;
use serde::Serialize;
use serde_json::Value;

use crate::analytics::{analytics_namespace, AnalyticsOptions, EventQueue};
use crate::error::{Error, Result};
use crate::models::Platform;
use crate::VERHUB_SDK_VERSION;

/// 客户端平台声明头。仅用于服务端请求统计，不影响接口返回内容。
pub const PLATFORM_HEADER: &str = "x-verhub-platform";

/// 客户端系统版本明细头，如 `11` / `ubuntu 24.04`；超过 32 字符会被服务端丢弃。
pub const PLATFORM_VERSION_HEADER: &str = "x-verhub-platform-version";

/// 系统版本明细的长度上限，与服务端一致。
const MAX_PLATFORM_VERSION_LENGTH: usize = 32;

/// Windows NT 内核号 → 市场版本号。10.0 不在表内，另按构建号区分。
const WINDOWS_NT_TO_MARKET: [(&str, &str); 3] = [("6.1", "7"), ("6.2", "8"), ("6.3", "8.1")];

/// 把系统版本明细规整成能进 HTTP 头的形式。
///
/// 非可打印 ASCII 一律替换成空格，折叠连续空白，按
/// [`MAX_PLATFORM_VERSION_LENGTH`] 截断。四个语言的 SDK 规则相同。
fn sanitize_platform_version(value: &str) -> String {
    value
        .chars()
        .map(|c| if c.is_ascii_graphic() { c } else { ' ' })
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .chars()
        .take(MAX_PLATFORM_VERSION_LENGTH)
        .collect::<String>()
        .trim_end()
        .to_string()
}

/// [`sanitize_platform_version`] 的 `Option` 版：洗完是空串则返回 `None`。
fn clean_version(value: String) -> Option<String> {
    let cleaned = sanitize_platform_version(&value);
    (!cleaned.is_empty()).then_some(cleaned)
}

/// 把 macOS 产品版本号收敛成市场版本号：`15.3.1` → `15`，`10.15.7` → `10.15`。
///
/// 与其余三个语言的 SDK 一致。
fn macos_marketing_version(product_version: &str) -> String {
    let parts: Vec<&str> = product_version
        .trim()
        .split('.')
        .filter(|p| !p.is_empty())
        .collect();
    match parts.as_slice() {
        [] => String::new(),
        ["10", minor, ..] => format!("10.{minor}"),
        [major, ..] => (*major).to_string(),
    }
}

/// 默认重试次数。
const DEFAULT_RETRIES: usize = 2;

/// 会触发重试的服务端状态码。
const RETRY_STATUS: [u16; 3] = [502, 503, 504];

/// 会自动重试的幂等方法；其余方法一律不重试。四个语言的 SDK 集合相同。
fn is_idempotent(method: &Method) -> bool {
    *method == Method::GET || *method == Method::HEAD
}

/// 探测当前运行平台，用于填充 [`PLATFORM_HEADER`]。
///
/// 按编译目标区分契约里的七个取值，识别不出时返回 [`Platform::Others`]。
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

/// 探测系统版本明细，用于填充 [`PLATFORM_VERSION_HEADER`]。
///
/// Windows 与 macOS 给市场版本号（`11` / `15` / `10.15`），Linux 给
/// `发行版 版本号`。取不到时返回空串。
pub fn detect_platform_version() -> String {
    use os_info::{Type, Version};

    let info = os_info::get();

    if info.os_type() == Type::Windows {
        if let Version::Semantic(major, minor, build) = info.version() {
            // Win11 仍上报内核 10.0，只有构建号 >= 22000 能区分出来。
            if *major == 10 && *minor == 0 {
                return if *build >= 22000 {
                    "11".into()
                } else {
                    "10".into()
                };
            }
            let nt = format!("{major}.{minor}");
            if let Some((_, market)) = WINDOWS_NT_TO_MARKET.iter().find(|(key, _)| *key == nt) {
                return (*market).to_string();
            }
        }
    }

    let version = info.version().to_string();
    if version.is_empty() || version == "Unknown" {
        return String::new();
    }

    let combined = match info.os_type() {
        Type::Windows => version,
        Type::Macos => macos_marketing_version(&version),
        // 发行版名单独成维，拼进版本明细以对齐 "ubuntu 24.04" 的写法。
        other => format!("{} {}", other.to_string().to_lowercase(), version),
    };

    sanitize_platform_version(&combined)
}

/// 两个命名空间共用的连接、凭据与来源声明。
#[derive(Debug)]
pub(crate) struct Inner {
    http: reqwest::Client,
    base_url: String,
    retries: usize,
    project_key: RwLock<Option<String>>,
    token: RwLock<String>,
    platform: RwLock<Option<Platform>>,
    platform_version: RwLock<Option<String>>,
    /// 事件队列。首次访问时才建，命名空间变化时丢弃重建。
    analytics: RwLock<Option<Arc<EventQueue>>>,
    analytics_options: AnalyticsOptions,
}

/// 锁被毒化时取回内部值继续用。
fn read_lock<T>(lock: &RwLock<T>) -> std::sync::RwLockReadGuard<'_, T> {
    lock.read().unwrap_or_else(|e| e.into_inner())
}

/// 锁被毒化时取回内部值继续用。
fn write_lock<T>(lock: &RwLock<T>) -> std::sync::RwLockWriteGuard<'_, T> {
    lock.write().unwrap_or_else(|e| e.into_inner())
}

impl Inner {
    /// 事件队列，首次访问时才建，命名空间变化时丢弃重建。
    ///
    /// 旧命名空间攒下的事件留在它自己的状态文件里，下次绑定回去时补发。
    pub(crate) fn analytics(&self) -> Arc<EventQueue> {
        let namespace = match &self.analytics_options.namespace {
            Some(explicit) => explicit.clone(),
            None => analytics_namespace(&self.base_url, read_lock(&self.project_key).as_deref()),
        };

        if let Some(existing) = read_lock(&self.analytics).as_ref() {
            if existing.namespace() == namespace {
                return Arc::clone(existing);
            }
        }

        let mut slot = write_lock(&self.analytics);
        // 拿到写锁后再确认一次，别的线程可能已经建好了。
        if let Some(existing) = slot.as_ref() {
            if existing.namespace() == namespace {
                return Arc::clone(existing);
            }
        }
        let created = Arc::new(EventQueue::new(&namespace, self.analytics_options.clone()));
        *slot = Some(Arc::clone(&created));
        created
    }

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
        *write_lock(&self.platform_version) = version.and_then(clean_version);
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
        let url = format!("{}{}", self.base_url, path);

        let bearer = if auth {
            let token = self.token();
            if token.is_empty() {
                return Err(Error::MissingToken);
            }
            Some(format!("Bearer {token}"))
        } else {
            None
        };

        // 一次调用内快照来源声明，保证多次重试用的是同一份。
        let platform = *read_lock(&self.platform);
        let platform_version = read_lock(&self.platform_version).clone();
        let pairs: Vec<(&str, String)> = query
            .iter()
            .filter_map(|(key, value)| value.as_ref().map(|v| (*key, v.clone())))
            .collect();

        let can_retry = is_idempotent(&method) && self.retries > 0;
        let max_attempts = if can_retry { self.retries + 1 } else { 1 };

        let mut attempt = 1;
        loop {
            let mut builder = self.http.request(method.clone(), &url);
            if let Some(platform) = platform {
                builder = builder.header(PLATFORM_HEADER, platform.as_str());
            }
            if let Some(version) = &platform_version {
                if let Ok(value) = HeaderValue::from_str(version) {
                    builder = builder.header(PLATFORM_VERSION_HEADER, value);
                }
            }
            if !pairs.is_empty() {
                builder = builder.query(&pairs);
            }
            if let Some(value) = &bearer {
                builder = builder.header(AUTHORIZATION, value.clone());
            }
            if let Some(payload) = body {
                builder = builder.json(payload);
            }

            log::debug!("verhub 请求 {method} {url}（第 {attempt} 次）");
            match builder.send().await {
                Ok(response) => {
                    let status = response.status();
                    log::debug!("verhub 响应 {method} {url} -> {}", status.as_u16());

                    if can_retry
                        && attempt < max_attempts
                        && RETRY_STATUS.contains(&status.as_u16())
                    {
                        backoff(attempt).await;
                        attempt += 1;
                        continue;
                    }

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

                    // 204 之类的空响应体交给 `T` 自己决定能不能从 `null` 反序列化出来。
                    let text = if raw.is_empty() { "null" } else { raw.as_str() };
                    return serde_json::from_str(text).map_err(Error::Decode);
                }
                Err(err) => {
                    if can_retry && attempt < max_attempts && (err.is_connect() || err.is_timeout())
                    {
                        log::debug!("verhub 请求 {method} {url} 连接失败，将重试：{err}");
                        backoff(attempt).await;
                        attempt += 1;
                        continue;
                    }
                    return Err(Error::Connection(err));
                }
            }
        }
    }
}

/// 指数退避：第 n 次重试前等 300 * 2^(n-1) 毫秒。
async fn backoff(attempt: usize) {
    let ms = 300u64 * (1u64 << (attempt - 1));
    tokio::time::sleep(std::time::Duration::from_millis(ms)).await;
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
    connect_timeout: Option<Duration>,
    retries: Option<usize>,
    user_agent: Option<String>,
    app_identifier: Option<String>,
    headers: HeaderMap,
    analytics: AnalyticsOptions,
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
            connect_timeout: None,
            retries: None,
            user_agent: None,
            analytics: AnalyticsOptions::default(),
            app_identifier: None,
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

    /// 覆盖自动探测出的平台。不影响系统版本明细，后者仍会自动探测。
    pub fn platform(mut self, platform: Platform) -> Self {
        self.platform = Some(Some(platform));
        self
    }

    /// 完全不声明平台，系统版本明细也随之不再自动探测；仍要报版本时显式调用
    /// [`Self::platform_version`]。
    pub fn without_platform(mut self) -> Self {
        self.platform = Some(None);
        self
    }

    /// 系统版本明细，如 `11` / `ubuntu 24.04`；省略则从系统信息自动提取。
    pub fn platform_version(mut self, version: impl Into<String>) -> Self {
        self.platform_version = Some(version.into());
        self
    }

    /// 单次请求超时（连接 + 读取），默认 15 秒。
    pub fn timeout(mut self, timeout: Duration) -> Self {
        self.timeout = Some(timeout);
        self
    }

    /// 单独设置连接阶段超时；不设则由 [`Self::timeout`] 统管。
    pub fn connect_timeout(mut self, connect_timeout: Duration) -> Self {
        self.connect_timeout = Some(connect_timeout);
        self
    }

    /// GET / HEAD 在连接失败与 502/503/504 时的自动重试次数，默认 2；传 0 关闭。
    pub fn retries(mut self, retries: usize) -> Self {
        self.retries = Some(retries);
        self
    }

    /// 覆盖默认 User-Agent，会连带丢掉 SDK 版本信息。
    pub fn user_agent(mut self, user_agent: impl Into<String>) -> Self {
        self.user_agent = Some(user_agent.into());
        self
    }

    /// 追加到默认 User-Agent 之后的应用标识（如 `MyApp/1.2`），保留 SDK 版本又
    /// 便于服务端统计；与 [`Self::user_agent`] 同时给时以后者为准。
    pub fn app_identifier(mut self, app_identifier: impl Into<String>) -> Self {
        self.app_identifier = Some(app_identifier.into());
        self
    }

    /// 附加到每个请求上的头。
    pub fn header(mut self, name: HeaderName, value: HeaderValue) -> Self {
        self.headers.insert(name, value);
        self
    }

    /// 事件采集配置。
    ///
    /// 省略即启用默认行为：设备级匿名标识 + 本地待发队列。这是 SDK 里唯一会在
    /// 设备上写入数据的能力。面向欧盟用户的接入方应当设置 `require_consent: true`。
    pub fn analytics(mut self, options: AnalyticsOptions) -> Self {
        self.analytics = options;
        self
    }

    /// 完全关闭事件采集：不生成标识、不落盘、不发请求。
    pub fn without_analytics(mut self) -> Self {
        self.analytics.enabled = false;
        self
    }

    pub(crate) fn build_inner(self) -> Result<Inner> {
        let base_url = self.base_url.trim().trim_end_matches('/').to_string();
        if !base_url.starts_with("http://") && !base_url.starts_with("https://") {
            return Err(Error::InvalidBaseUrl(self.base_url));
        }
        if !base_url.contains("/api/v") {
            log::warn!("verhub: base_url 通常应以 /api/v1 结尾，当前为 {base_url:?}；若非有意为之，请求可能全部 404");
        }

        let mut headers = self.headers;
        headers.insert(ACCEPT, HeaderValue::from_static("application/json"));

        // 默认 UA 后追加应用标识；显式 user_agent 优先，会连带丢掉 SDK 版本。
        let user_agent = self.user_agent.unwrap_or_else(|| {
            let base = format!("verhub-sdk-rust/{VERHUB_SDK_VERSION}");
            match self.app_identifier.as_deref().map(str::trim) {
                Some(app) if !app.is_empty() => format!("{base} {app}"),
                _ => base,
            }
        });
        headers.insert(
            USER_AGENT,
            HeaderValue::from_str(&user_agent).map_err(|_| Error::InvalidUserAgent(user_agent))?,
        );

        // 两个维度各管各的：显式给了就用给的，没给就自己探测。
        // without_platform() 例外，平台与版本一并不报。
        let platform = self.platform.unwrap_or_else(|| Some(detect_platform()));
        let platform_version = match self.platform_version {
            Some(version) => clean_version(version),
            None if platform.is_some() => clean_version(detect_platform_version()),
            None => None,
        };

        let mut http_builder = reqwest::Client::builder()
            .default_headers(headers)
            .timeout(self.timeout.unwrap_or(Duration::from_secs(15)));
        if let Some(connect_timeout) = self.connect_timeout {
            http_builder = http_builder.connect_timeout(connect_timeout);
        }
        let http = http_builder.build()?;

        Ok(Inner {
            http,
            base_url,
            retries: self.retries.unwrap_or(DEFAULT_RETRIES),
            project_key: RwLock::new(self.project_key),
            token: RwLock::new(self.token.unwrap_or_default()),
            analytics: RwLock::new(None),
            analytics_options: self.analytics,
            platform: RwLock::new(platform),
            platform_version: RwLock::new(platform_version),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 混入非 ASCII 的系统版本：非 ASCII 部分被剔掉，ASCII 的版本号留下。
    #[test]
    fn sanitize_strips_mojibake_but_keeps_the_version_number() {
        let raw = "Microsoft Windows [\u{FFFD}汾 10.0.26200.8875]";
        let cleaned = sanitize_platform_version(raw);
        assert_eq!(cleaned, "Microsoft Windows [ 10.0.26200.8");
        assert!(
            HeaderValue::from_str(&cleaned).is_ok(),
            "清洗后必须能进请求头，否则这个头会被静默丢掉"
        );
    }

    #[test]
    fn sanitize_folds_whitespace_and_trims() {
        assert_eq!(
            sanitize_platform_version("  ubuntu\t\n 24.04  "),
            "ubuntu 24.04"
        );
        assert_eq!(sanitize_platform_version("11"), "11");
    }

    #[test]
    fn sanitize_truncates_to_the_server_limit() {
        let cleaned = sanitize_platform_version(&"9".repeat(100));
        assert_eq!(cleaned.chars().count(), MAX_PLATFORM_VERSION_LENGTH);
    }

    #[test]
    fn sanitize_yields_empty_when_nothing_survives() {
        assert_eq!(sanitize_platform_version("版本"), "");
        assert_eq!(sanitize_platform_version("   "), "");
        assert_eq!(clean_version("版本".to_string()), None, "空串收敛成 None");
        assert_eq!(clean_version("11".to_string()), Some("11".to_string()));
    }

    /// 换行 / 回车会构成响应头注入，必须一并清掉。
    #[test]
    fn sanitize_removes_control_characters() {
        let cleaned = sanitize_platform_version("11\r\nX-Injected: 1");
        assert!(
            !cleaned.contains('\r') && !cleaned.contains('\n'),
            "{cleaned}"
        );
        assert!(HeaderValue::from_str(&cleaned).is_ok());
    }

    /// macOS 只报市场大版本；10.x 时代保留次版本号。四个语言的 SDK 一致。
    #[test]
    fn macos_version_collapses_to_the_marketing_number() {
        assert_eq!(macos_marketing_version("15.3.1"), "15");
        assert_eq!(macos_marketing_version("26"), "26");
        assert_eq!(macos_marketing_version("10.15.7"), "10.15");
        assert_eq!(macos_marketing_version(""), "");
    }

    /// 显式声明平台不影响版本探测。
    #[test]
    fn explicit_platform_keeps_auto_detected_version() {
        let inner = VerhubClientBuilder::new("https://example.com/api/v1")
            .platform(Platform::Windows)
            .build_inner()
            .expect("构造客户端");
        assert_eq!(*read_lock(&inner.platform), Some(Platform::Windows));
        assert_eq!(
            read_lock(&inner.platform_version).clone(),
            clean_version(detect_platform_version()),
            "指定平台后版本仍应自动探测并带上"
        );
    }

    /// 显式给的版本优先于探测值，且同样要过清洗。
    #[test]
    fn explicit_version_wins_and_is_sanitized() {
        let inner = VerhubClientBuilder::new("https://example.com/api/v1")
            .platform_version("  Windows\u{FFFD} 11  ")
            .build_inner()
            .expect("构造客户端");
        assert_eq!(
            read_lock(&inner.platform_version).clone(),
            Some("Windows 11".to_string())
        );
    }

    /// without_platform 时平台与版本都不报。
    #[test]
    fn without_platform_reports_nothing() {
        let inner = VerhubClientBuilder::new("https://example.com/api/v1")
            .without_platform()
            .build_inner()
            .expect("构造客户端");
        assert_eq!(*read_lock(&inner.platform), None);
        assert_eq!(read_lock(&inner.platform_version).clone(), None);
    }

    /// without_platform 只针对自动探测，显式给的版本仍然照发。
    #[test]
    fn without_platform_still_honours_an_explicit_version() {
        let inner = VerhubClientBuilder::new("https://example.com/api/v1")
            .without_platform()
            .platform_version("ubuntu 24.04")
            .build_inner()
            .expect("构造客户端");
        assert_eq!(
            read_lock(&inner.platform_version).clone(),
            Some("ubuntu 24.04".to_string())
        );
    }

    /// 探测值直接进请求头，必须是干净的 ASCII。
    #[test]
    fn detected_version_is_header_safe() {
        let detected = detect_platform_version();
        assert!(
            detected.chars().all(|c| c.is_ascii_graphic() || c == ' '),
            "探测出的系统版本含非 ASCII 字符: {detected:?}"
        );
        assert!(detected.chars().count() <= MAX_PLATFORM_VERSION_LENGTH);
        assert!(HeaderValue::from_str(&detected).is_ok());
    }
}
