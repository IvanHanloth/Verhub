//! 请求与响应类型。
//!
//! 字段与 `verhub.openapi.yaml` 的 schema 一一对应，契约里标注 nullable 的在
//! 这里是 `Option<T>`。输入结构体都实现了 [`Default`]，配合结构体更新语法只写
//! 关心的字段：
//!
//! ```no_run
//! # use verhub_sdk::models::CreateVersionInput;
//! let input = CreateVersionInput {
//!     version: "v1.2.0".into(),
//!     comparable_version: "1.2.0".into(),
//!     is_latest: Some(true),
//!     ..Default::default()
//! };
//! ```

use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

/// 任意 JSON 对象，用于 `custom_data` / `device_info` 这类自由字段。
pub type JsonObject = Map<String, Value>;

/// 平台取值。提交时大小写不敏感，返回时统一小写；`Others` 是兜底。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Platform {
    Windows,
    Linux,
    Macos,
    Ios,
    Android,
    Web,
    Others,
}

impl Platform {
    /// 契约里的小写字符串形式，用于请求头与查询参数。
    pub fn as_str(self) -> &'static str {
        match self {
            Platform::Windows => "windows",
            Platform::Linux => "linux",
            Platform::Macos => "macos",
            Platform::Ios => "ios",
            Platform::Android => "android",
            Platform::Web => "web",
            Platform::Others => "others",
        }
    }
}

impl std::fmt::Display for Platform {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(self.as_str())
    }
}

/// 日志等级。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(into = "u8", try_from = "u8")]
pub enum LogLevel {
    Debug,
    Info,
    Warning,
    Error,
}

impl From<LogLevel> for u8 {
    fn from(level: LogLevel) -> Self {
        match level {
            LogLevel::Debug => 0,
            LogLevel::Info => 1,
            LogLevel::Warning => 2,
            LogLevel::Error => 3,
        }
    }
}

impl TryFrom<u8> for LogLevel {
    type Error = String;

    fn try_from(value: u8) -> std::result::Result<Self, String> {
        match value {
            0 => Ok(LogLevel::Debug),
            1 => Ok(LogLevel::Info),
            2 => Ok(LogLevel::Warning),
            3 => Ok(LogLevel::Error),
            other => Err(format!("未知的日志等级：{other}")),
        }
    }
}

// ---- 响应 ----

#[derive(Debug, Clone, Deserialize)]
pub struct HealthResponse {
    pub status: String,
    pub timestamp: i64,
}

#[derive(Debug, Clone, Deserialize)]
pub struct DeleteSuccessResponse {
    pub success: bool,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct VersionDownloadLink {
    pub url: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub platform: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ProjectItem {
    pub id: String,
    pub project_key: String,
    pub name: String,
    pub repo_url: Option<String>,
    pub description: Option<String>,
    pub author: Option<String>,
    pub author_homepage_url: Option<String>,
    pub icon_url: Option<String>,
    pub website_url: Option<String>,
    pub docs_url: Option<String>,
    pub published_at: Option<i64>,
    pub optional_update_min_comparable_version: Option<String>,
    pub optional_update_max_comparable_version: Option<String>,
    pub stats_retention_days: i32,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Deserialize)]
pub struct VersionItem {
    pub id: String,
    pub version: String,
    pub comparable_version: String,
    pub title: Option<String>,
    pub content: Option<String>,
    pub download_url: Option<String>,
    #[serde(default)]
    pub download_links: Vec<VersionDownloadLink>,
    pub forced: bool,
    pub is_latest: bool,
    pub is_preview: bool,
    pub is_milestone: bool,
    pub is_deprecated: bool,
    pub platform: Option<Platform>,
    #[serde(default)]
    pub platforms: Vec<Platform>,
    pub custom_data: Option<JsonObject>,
    pub published_at: i64,
    pub created_at: i64,
}

#[derive(Debug, Clone, Deserialize)]
pub struct AnnouncementItem {
    pub id: String,
    pub title: String,
    pub content: String,
    pub is_pinned: bool,
    pub is_hidden: bool,
    #[serde(default)]
    pub platforms: Vec<Platform>,
    pub author: Option<String>,
    pub published_at: i64,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Deserialize)]
pub struct FeedbackItem {
    pub id: String,
    pub user_id: Option<String>,
    pub rating: Option<i32>,
    pub content: String,
    pub platform: Option<Platform>,
    pub platform_version: Option<String>,
    pub custom_data: Option<JsonObject>,
    pub ip: Option<String>,
    pub user_agent: Option<String>,
    pub country_code: Option<String>,
    pub country_name: Option<String>,
    pub region_name: Option<String>,
    pub city: Option<String>,
    pub created_at: i64,
}

#[derive(Debug, Clone, Deserialize)]
pub struct LogItem {
    pub id: String,
    pub level: i32,
    pub content: String,
    pub device_info: Option<JsonObject>,
    pub custom_data: Option<JsonObject>,
    pub ip: Option<String>,
    pub user_agent: Option<String>,
    pub country_code: Option<String>,
    pub country_name: Option<String>,
    pub region_name: Option<String>,
    pub city: Option<String>,
    pub platform: Option<Platform>,
    pub platform_version: Option<String>,
    pub created_at: i64,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ActionItem {
    pub action_id: String,
    pub project_key: String,
    pub name: String,
    pub description: String,
    pub custom_data: Option<JsonObject>,
    pub created_time: i64,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ActionRecordItem {
    pub action_record_id: String,
    pub action_id: String,
    pub created_time: i64,
    pub http: Option<JsonObject>,
    pub custom_data: Option<JsonObject>,
    pub ip: Option<String>,
    pub user_agent: Option<String>,
    pub country_code: Option<String>,
    pub country_name: Option<String>,
    pub region_name: Option<String>,
    pub city: Option<String>,
    pub platform: Option<Platform>,
    pub platform_version: Option<String>,
}

/// 分页响应的统一形状。
#[derive(Debug, Clone, Deserialize)]
pub struct ListResponse<T> {
    pub total: i64,
    pub data: Vec<T>,
}

pub type ProjectListResponse = ListResponse<ProjectItem>;
pub type VersionListResponse = ListResponse<VersionItem>;
pub type AnnouncementListResponse = ListResponse<AnnouncementItem>;
pub type FeedbackListResponse = ListResponse<FeedbackItem>;
pub type LogListResponse = ListResponse<LogItem>;
pub type ActionListResponse = ListResponse<ActionItem>;
pub type ActionRecordListResponse = ListResponse<ActionRecordItem>;

#[derive(Debug, Clone, Deserialize)]
pub struct CheckUpdateMilestone {
    /// 当前版本是否为里程碑版本。
    pub current: bool,
    /// 最新版本是否为里程碑版本。
    pub latest: bool,
    /// 目标版本是否因里程碑拦截而被下调；命中时 `reason_codes` 含 `milestone_guard`。
    pub target_is_milestone: bool,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CheckUpdateResponse {
    pub should_update: bool,
    /// 是否为强制更新。命中项目级可选更新范围之外时为 true。
    pub required: bool,
    #[serde(default)]
    pub reason_codes: Vec<String>,
    pub current_version: Option<String>,
    pub current_comparable_version: String,
    pub latest_version: VersionItem,
    pub latest_preview_version: Option<VersionItem>,
    /// 建议升级到的目标版本；无可升级目标时为 `None`。
    pub target_version: Option<VersionItem>,
    pub milestone: CheckUpdateMilestone,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ProjectStatistics {
    pub count: i64,
}

#[derive(Debug, Clone, Deserialize)]
pub struct VersionStatistics {
    pub total_versions: i64,
    pub total_projects: i64,
    pub forced_versions: i64,
    pub latest_version_time: Option<i64>,
    pub first_version_time: Option<i64>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct AnnouncementStatistics {
    pub count: i64,
    pub pinned_count: i64,
}

#[derive(Debug, Clone, Deserialize)]
pub struct FeedbackStatistics {
    pub count: i64,
    pub rate_count: i64,
    pub rate_avg: Option<f64>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct LogStatistics {
    pub count: i64,
    pub debug_count: i64,
    pub info_count: i64,
    pub warning_count: i64,
    pub error_count: i64,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ActionStatistics {
    pub count: i64,
}

#[derive(Debug, Clone, Deserialize)]
pub struct GithubWebhookSettings {
    /// 是否已配置 secret；为 false 时接收端点拒绝所有推送。
    pub enabled: bool,
    pub payload_path: String,
    pub content_type: String,
    /// secret 末 4 位，用于区分不同 secret。
    pub secret_hint: Option<String>,
    pub secret_updated_at: Option<i64>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct GithubWebhookSecretRevealed {
    pub enabled: bool,
    pub payload_path: String,
    pub content_type: String,
    pub secret_hint: Option<String>,
    pub secret_updated_at: Option<i64>,
    /// 完整 secret，只在设置或重新生成时返回一次。
    pub secret: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct GithubRepoProjectPreview {
    pub project_key: String,
    pub name: String,
    pub repo_url: String,
    pub description: Option<String>,
    pub author: Option<String>,
    pub author_homepage_url: Option<String>,
    pub icon_url: Option<String>,
    pub website_url: Option<String>,
    pub docs_url: Option<String>,
    pub published_at: Option<i64>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct GithubReleaseVersionPreview {
    pub version: String,
    pub comparable_version: String,
    pub title: Option<String>,
    pub content: Option<String>,
    pub download_url: Option<String>,
    #[serde(default)]
    pub download_links: Vec<VersionDownloadLink>,
    pub forced: bool,
    pub is_latest: bool,
    pub is_preview: bool,
    #[serde(default)]
    pub is_milestone: bool,
    pub is_deprecated: bool,
    pub platform: Option<Platform>,
    #[serde(default)]
    pub platforms: Vec<Platform>,
    pub published_at: i64,
    #[serde(default)]
    pub custom_data: JsonObject,
}

#[derive(Debug, Clone, Deserialize)]
pub struct VersionImportResult {
    pub imported: i64,
    pub skipped: i64,
    /// 已存在因而没有导入的版本计入 `skipped`。
    pub scanned: i64,
}

// ---- 请求 ----

/// 分页参数。
#[derive(Debug, Clone, Default)]
pub struct PageOptions {
    /// 分页大小，1..=100，默认 20。
    pub limit: Option<u32>,
    /// 分页偏移，默认 0。
    pub offset: Option<u32>,
}

/// 公告列表的分页与平台筛选。
#[derive(Debug, Clone, Default)]
pub struct ListAnnouncementsOptions {
    pub limit: Option<u32>,
    pub offset: Option<u32>,
    /// 只取投放到该平台的公告。
    pub platform: Option<Platform>,
}

/// 日志列表的分页、等级与时间范围。
#[derive(Debug, Clone, Default)]
pub struct ListLogsOptions {
    pub limit: Option<u32>,
    pub offset: Option<u32>,
    pub level: Option<LogLevel>,
    /// 起始时间（Unix 秒）。
    pub start_time: Option<i64>,
    /// 结束时间（Unix 秒）。
    pub end_time: Option<i64>,
}

/// 更新检查的入参。`current_version` 与 `current_comparable_version` 至少给一个。
#[derive(Debug, Clone, Default, Serialize)]
pub struct CheckUpdateInput {
    /// 当前语义化版本号。
    #[serde(skip_serializing_if = "Option::is_none")]
    pub current_version: Option<String>,
    /// 当前可比较版本号，如 `1.20.326`；与 `current_version` 同时提交时以此为准。
    #[serde(skip_serializing_if = "Option::is_none")]
    pub current_comparable_version: Option<String>,
    /// 是否把 preview 版本纳入比较候选。
    #[serde(skip_serializing_if = "Option::is_none")]
    pub include_preview: Option<bool>,
}

#[derive(Debug, Clone, Default, Serialize)]
pub struct CreateFeedbackInput {
    pub content: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub user_id: Option<String>,
    /// 评分，1..=5。
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rating: Option<u8>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub platform: Option<Platform>,
    /// 系统版本明细，如 `11` / `ubuntu 24.04`。
    #[serde(skip_serializing_if = "Option::is_none")]
    pub platform_version: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub custom_data: Option<JsonObject>,
}

#[derive(Debug, Clone, Default, Serialize)]
pub struct UpdateFeedbackInput {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub user_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rating: Option<u8>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub platform: Option<Platform>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub platform_version: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub custom_data: Option<JsonObject>,
}

#[derive(Debug, Clone, Default, Serialize)]
pub struct UploadLogInput {
    pub level: u8,
    pub content: String,
    /// 设备信息，客户端自报。
    #[serde(skip_serializing_if = "Option::is_none")]
    pub device_info: Option<JsonObject>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub custom_data: Option<JsonObject>,
}

#[derive(Debug, Clone, Default, Serialize)]
pub struct CreateLogInput {
    pub level: u8,
    pub content: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub device_info: Option<JsonObject>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub custom_data: Option<JsonObject>,
    /// 补录没有客户端可推断，平台只能显式指定。
    #[serde(skip_serializing_if = "Option::is_none")]
    pub platform: Option<Platform>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub platform_version: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize)]
pub struct CreateActionRecordInput {
    /// 行为定义 ID，需先在后台创建。
    pub action_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub custom_data: Option<JsonObject>,
}

#[derive(Debug, Clone, Default, Serialize)]
pub struct CreateProjectInput {
    /// 新项目标识；`None` 则用客户端绑定的 project_key。
    #[serde(skip_serializing_if = "Option::is_none")]
    pub project_key: Option<String>,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub repo_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub author: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub author_homepage_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub icon_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub website_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub docs_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub published_at: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub optional_update_min_comparable_version: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub optional_update_max_comparable_version: Option<String>,
    /// 请求统计保留天数，1..=365，默认 365。
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stats_retention_days: Option<u32>,
}

#[derive(Debug, Clone, Default, Serialize)]
pub struct UpdateProjectInput {
    /// 改键会影响所有引用该键的调用方。
    #[serde(skip_serializing_if = "Option::is_none")]
    pub project_key: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub repo_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub author: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub author_homepage_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub icon_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub website_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub docs_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub published_at: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub optional_update_min_comparable_version: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub optional_update_max_comparable_version: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stats_retention_days: Option<u32>,
}

#[derive(Debug, Clone, Default, Serialize)]
pub struct CreateVersionInput {
    /// 展示用版本号，如 `v1.2.0`。
    pub version: String,
    /// 可比较版本号，如 `1.2.0` / `1.2.0-rc.2`。
    pub comparable_version: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content: Option<String>,
    /// 外层 `None` 表示不提交该字段，`Some(None)` 表示提交 null 以清空。
    #[serde(skip_serializing_if = "Option::is_none")]
    pub download_url: Option<Option<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub download_links: Option<Vec<VersionDownloadLink>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_latest: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_preview: Option<bool>,
    /// 里程碑版本会拦截跨里程碑的直接升级。
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_milestone: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_deprecated: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub published_at: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub platform: Option<Platform>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub platforms: Option<Vec<Platform>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub custom_data: Option<JsonObject>,
}

#[derive(Debug, Clone, Default, Serialize)]
pub struct UpdateVersionInput {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub version: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub comparable_version: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content: Option<String>,
    /// 外层 `None` 表示保持原值，`Some(None)` 表示置空。
    #[serde(skip_serializing_if = "Option::is_none")]
    pub download_url: Option<Option<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub download_links: Option<Vec<VersionDownloadLink>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_latest: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_preview: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_milestone: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_deprecated: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub published_at: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub platform: Option<Platform>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub platforms: Option<Vec<Platform>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub custom_data: Option<JsonObject>,
}

/// 版本号取自路径，因此这里不再接受 `version`。
#[derive(Debug, Clone, Default, Serialize)]
pub struct UpsertVersionInput {
    /// 新建时省略会由版本号推导（去掉前导 v）。
    #[serde(skip_serializing_if = "Option::is_none")]
    pub comparable_version: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub download_url: Option<Option<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub download_links: Option<Vec<VersionDownloadLink>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_latest: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_preview: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_milestone: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_deprecated: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub published_at: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub platform: Option<Platform>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub platforms: Option<Vec<Platform>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub custom_data: Option<JsonObject>,
}

#[derive(Debug, Clone, Default, Serialize)]
pub struct CreateAnnouncementInput {
    pub title: String,
    pub content: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_pinned: Option<bool>,
    /// 隐藏后公开接口取不到。
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_hidden: Option<bool>,
    /// 投放平台，最多 8 个；留空表示全平台。
    #[serde(skip_serializing_if = "Option::is_none")]
    pub platforms: Option<Vec<Platform>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub author: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub published_at: Option<i64>,
}

#[derive(Debug, Clone, Default, Serialize)]
pub struct UpdateAnnouncementInput {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_pinned: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_hidden: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub platforms: Option<Vec<Platform>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub author: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub published_at: Option<i64>,
}

/// 行为定义在绑定项目下创建，`project_key` 由客户端注入，不在此结构里。
#[derive(Debug, Clone, Default, Serialize)]
pub struct CreateActionInput {
    pub name: String,
    pub description: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub custom_data: Option<JsonObject>,
}

#[derive(Debug, Clone, Default, Serialize)]
pub struct UpdateActionInput {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub custom_data: Option<JsonObject>,
}
