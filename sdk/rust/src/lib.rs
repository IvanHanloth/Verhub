//! Verhub Rust SDK。
//!
//! 接口面与 Python / TypeScript / 纯 JS 版一一对应，只是方法名按 Rust 习惯写成
//! snake_case。契约以仓库根目录的 `verhub.openapi.yaml` 为准。
//!
//! ```no_run
//! use verhub_sdk::{models::CheckUpdateInput, VerhubClient};
//!
//! # async fn demo() -> verhub_sdk::Result<()> {
//! // 客户端绑定一个项目，之后项目作用域的方法不再逐次传项目参数。
//! let client = VerhubClient::builder("https://verhub.example.com/api/v1")
//!     .project_key("verhub")
//!     .build()?;
//!
//! let result = client
//!     .public()
//!     .check_update(&CheckUpdateInput {
//!         current_version: Some("1.1.0".into()),
//!         ..Default::default()
//!     })
//!     .await?;
//!
//! if result.should_update {
//!     println!("{}", result.latest_version.version);
//! }
//! # Ok(())
//! # }
//! ```

#![forbid(unsafe_code)]
#![warn(missing_debug_implementations)]

mod admin_api;
mod error;
mod http;
mod public_api;

pub mod models;

pub use admin_api::AdminApi;
pub use error::{Error, Result};
pub use http::{
    detect_platform, detect_platform_version, VerhubClientBuilder, PLATFORM_HEADER,
    PLATFORM_VERSION_HEADER,
};
// 这两个枚举出现在几乎每个调用点上，提到 crate 根省得调用方到处写 models::。
pub use models::{LogLevel, Platform};
pub use public_api::PublicApi;

use std::sync::Arc;

use reqwest::Method;

use crate::http::Inner;
use crate::models::HealthResponse;

/// SDK 版本号，跟随主仓库版本。
pub const VERHUB_SDK_VERSION: &str = "0.2.5";

/// Verhub SDK 入口。
///
/// 两个命名空间共用一份连接与凭据：[`VerhubClient::public`] 不需要凭据，
/// [`VerhubClient::admin`] 需要管理员 JWT 或 API Key。
///
/// 克隆开销等同于克隆一个 [`Arc`]，跨任务共享直接 clone 即可。
#[derive(Debug, Clone)]
pub struct VerhubClient {
    inner: Arc<Inner>,
}

impl VerhubClient {
    /// 用默认配置建客户端（不绑定项目）。
    ///
    /// `base_url` 须包含 `/api/v1` 前缀，也就是能直接打开 `/health` 的那个地址。
    /// 要绑定项目、设置凭据/平台/超时，用 [`VerhubClient::builder`]。
    pub fn new(base_url: impl Into<String>) -> Result<Self> {
        Self::builder(base_url).build()
    }

    /// 需要绑定项目或设置凭据、平台、超时时用构建器。
    pub fn builder(base_url: impl Into<String>) -> VerhubClientBuilder {
        VerhubClientBuilder::new(base_url)
    }

    pub(crate) fn from_inner(inner: Inner) -> Self {
        Self {
            inner: Arc::new(inner),
        }
    }

    /// 公开接口，不需要凭据。
    pub fn public(&self) -> PublicApi<'_> {
        PublicApi { inner: &self.inner }
    }

    /// 管理接口，需要管理员 JWT 或 API Key。
    pub fn admin(&self) -> AdminApi<'_> {
        AdminApi { inner: &self.inner }
    }

    /// 当前绑定的项目标识。
    pub fn project_key(&self) -> Option<String> {
        self.inner.project_key()
    }

    /// 更换绑定的项目。所有克隆出去的实例都会看到新值。
    pub fn set_project_key(&self, project_key: impl Into<String>) {
        self.inner.set_project_key(project_key);
    }

    /// 设置凭据。所有克隆出去的实例都会看到新值。
    pub fn set_token(&self, token: impl Into<String>) {
        self.inner.set_token(token);
    }

    /// 清除当前凭据，之后调用 admin 接口会直接返回 [`Error::MissingToken`]。
    pub fn clear_token(&self) {
        self.inner.clear_token();
    }

    /// 更新平台声明。传 `None` 则不再声明平台。
    pub fn set_platform(&self, platform: Option<Platform>) {
        self.inner.set_platform(platform);
    }

    /// 更新系统版本明细。传 `None` 则不再声明。
    pub fn set_platform_version(&self, version: Option<String>) {
        self.inner.set_platform_version(version);
    }

    /// 查服务健康状态。
    pub async fn health(&self) -> Result<HealthResponse> {
        self.inner
            .request::<_, ()>(Method::GET, "/health", &[], None, false)
            .await
    }
}

impl VerhubClientBuilder {
    /// 建出客户端。`base_url` 不是合法 http(s) 地址时返回
    /// [`Error::InvalidBaseUrl`]。
    pub fn build(self) -> Result<VerhubClient> {
        Ok(VerhubClient::from_inner(self.build_inner()?))
    }
}
