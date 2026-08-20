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
    /// 改名后保留的旧 Project Key（别名），均可访问到本项目。新到旧排序。
    #[serde(default)]
    pub aliases: Vec<String>,
    /// 本次返回的 name / description 实际来自哪个语言的译文；None 表示项目自身的值。
    #[serde(default)]
    pub locale: Option<String>,
    /// 项目的全部译文，仅管理接口返回。
    #[serde(default)]
    pub translations: Option<Vec<ProjectTranslation>>,
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
    /// 可见版本范围下界（含），None 表示该端不限。
    #[serde(default)]
    pub min_comparable_version: Option<String>,
    /// 可见版本范围上界（含），None 表示该端不限。
    #[serde(default)]
    pub max_comparable_version: Option<String>,
    /// 本次返回的 title / content 实际来自哪个语言的译文；None 表示默认内容
    /// （没提语言偏好、语言未注册，或该公告没有这个语言的译文）。
    #[serde(default)]
    pub locale: Option<String>,
    /// 全部译文，仅管理接口返回；公开接口不带这个字段。
    #[serde(default)]
    pub translations: Option<Vec<AnnouncementTranslation>>,
    pub published_at: i64,
    pub created_at: i64,
    pub updated_at: i64,
}

/// 某个语言下的覆盖设置，三个维度彼此独立：title 留空即用默认标题、
/// content 留空即用默认正文、is_hidden 为真则该语言下整条公告不返回。
/// 写入时三者至少要有一项有意义。
#[derive(Debug, Clone, Default, Deserialize, Serialize)]
pub struct AnnouncementTranslation {
    pub locale: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub content: Option<String>,
    #[serde(default)]
    pub is_hidden: bool,
}

#[derive(Debug, Clone, Deserialize)]
pub struct FeedbackItem {
    pub id: String,
    pub user_id: Option<String>,
    pub rating: Option<i32>,
    pub content: String,
    /// 提交者留下的联系方式；未填写为 None。
    pub contact: Option<String>,
    /// 隐藏的反馈默认不出现在后台列表里，评分仍计入统计。
    pub is_hidden: bool,
    pub platform: Option<Platform>,
    pub platform_version: Option<String>,
    pub custom_data: Option<JsonObject>,
    /// 是否已转成 GitHub Issue。转发失败的提交不会落库，所以拿到的记录都是成功的那些。
    pub forwarded_to_github: bool,
    /// 生成的 Issue 编号与链接；未转发时都是 None。
    pub github_issue_number: Option<i64>,
    pub github_issue_url: Option<String>,
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

/// 项目别名（改名保留的旧 Project Key）。
#[derive(Debug, Clone, Deserialize)]
pub struct ProjectAliasItem {
    pub alias: String,
    pub created_at: i64,
}

/// 别名列表响应，仅含 `data`（无分页 total）。
#[derive(Debug, Clone, Deserialize)]
pub struct ProjectAliasListResponse {
    pub data: Vec<ProjectAliasItem>,
}

/// 项目注册的语言。只有注册过的语言能存译文，也只有它们的偏好被公开端认账。
#[derive(Debug, Clone, Deserialize)]
pub struct ProjectLocaleItem {
    pub locale: String,
    /// 同义标签：客户端提交其中任何一个都等价于命中主标签（多对一）。
    /// 只认显式列出的，不做 `en-*` 前缀自动回退。
    #[serde(default)]
    pub aliases: Vec<String>,
    pub label: Option<String>,
    pub created_at: i64,
}

/// 某个语言下项目名称与描述的覆盖设置，字段留空即回落项目自身的值。
#[derive(Debug, Clone, Default, Deserialize, Serialize)]
pub struct ProjectTranslation {
    pub locale: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
}

/// 语言列表响应，仅含 `data`（无分页 total）。
#[derive(Debug, Clone, Deserialize)]
pub struct ProjectLocaleListResponse {
    pub data: Vec<ProjectLocaleItem>,
}

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
    /// secret 末 6 位，用于区分不同 secret。
    pub secret_hint: Option<String>,
    /// 已存 secret 的字符数，供渲染与真实长度一致的掩码。
    pub secret_length: Option<i64>,
    pub secret_updated_at: Option<i64>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct GithubWebhookSecretRevealed {
    pub enabled: bool,
    pub payload_path: String,
    pub content_type: String,
    pub secret_hint: Option<String>,
    pub secret_length: Option<i64>,
    pub secret_updated_at: Option<i64>,
    /// 完整 secret，只在设置或重新生成时返回一次。
    pub secret: String,
}

/// 实例级 GitHub App 配置视图。私钥永不回读，仅返回指纹。
#[derive(Debug, Clone, Deserialize)]
pub struct GithubAppConfig {
    /// App ID 与私钥齐全才为 true，功能才可能生效。
    pub configured: bool,
    pub app_id: Option<String>,
    pub has_private_key: bool,
    pub private_key_fingerprint: Option<String>,
    pub private_key_updated_at: Option<i64>,
    pub has_webhook_secret: bool,
    pub webhook_secret_hint: Option<String>,
    /// 已存 secret 的字符数，供渲染与真实长度一致的掩码。
    pub webhook_secret_length: Option<i64>,
    pub webhook_secret_updated_at: Option<i64>,
    /// 配置到 GitHub App 设置里的 Webhook URL 路径。
    pub webhook_payload_path: String,
    /// 已启用的功能："feedback_issue" / "comment_commands"。
    pub enabled_features: Vec<String>,
    /// 关闭时忽略下面两个模板字段，实例缺省即内置模板。
    pub feedback_issue_custom_template: bool,
    pub feedback_issue_title_template: Option<String>,
    pub feedback_issue_body_template: Option<String>,
    /// 内置模板原文，可直接作为自定义模板编辑器的初值。内置正文不含评分。
    pub builtin_feedback_issue_title_template: String,
    pub builtin_feedback_issue_body_template: String,
    /// 模板可用变量名清单。
    pub feedback_issue_template_variables: Vec<String>,
    pub updated_at: Option<i64>,
}

/// 部分更新实例级 GitHub App 配置。`private_key` / `webhook_secret` 传空串表示清除。
#[derive(Debug, Clone, Default, Serialize)]
pub struct UpdateGithubAppConfigInput {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub app_id: Option<String>,
    /// App 私钥 PEM 原文，只写不读。
    #[serde(skip_serializing_if = "Option::is_none")]
    pub private_key: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub webhook_secret: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub enabled_features: Option<Vec<String>>,
    /// 关闭时下面两个模板字段被忽略，实例缺省回到内置模板。
    #[serde(skip_serializing_if = "Option::is_none")]
    pub feedback_issue_custom_template: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub feedback_issue_title_template: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub feedback_issue_body_template: Option<String>,
}

/// 仓库模板文件的拉取结果。拉不到时 `error` 给出原因，其余字段为空。
#[derive(Debug, Clone, Deserialize)]
pub struct FeedbackIssueRepoTemplatePreview {
    pub path: String,
    pub r#ref: Option<String>,
    pub fetched_at: Option<i64>,
    pub title_template: Option<String>,
    pub body_template: Option<String>,
    /// 模板 front matter 里声明的标签，优先于项目上单独配置的标签。
    pub labels: Vec<String>,
    pub error: Option<String>,
}

/// 评论命令定义：/verhub-<name> <args> → workflow_dispatch。
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct GithubCommandDefinition {
    /// 命令名，不含 /verhub- 前缀。
    pub name: String,
    /// workflow 文件名（如 release.yml）或数字 ID。
    pub workflow: String,
    /// dispatch 的目标 ref。
    pub r#ref: String,
    /// 参数写入 workflow inputs 的键名，缺省 "args"。
    #[serde(skip_serializing_if = "Option::is_none")]
    pub input: Option<String>,
}

/// 项目级 GitHub 集成配置视图。`*_active` 是综合实例配置后的实际生效状态。
#[derive(Debug, Clone, Deserialize)]
pub struct ProjectGithubIntegration {
    pub project_key: String,
    pub repo_full_name: Option<String>,
    /// 只表示「允许转发」；是否转发由提交者逐条选择。
    pub feedback_issue_enabled: bool,
    pub feedback_issue_active: bool,
    /// 模板来源："inherit" / "custom" / "repo"。
    pub feedback_issue_template_source: String,
    pub feedback_issue_template_repo_path: Option<String>,
    pub feedback_issue_template_repo_ref: Option<String>,
    pub feedback_issue_title_template: Option<String>,
    pub feedback_issue_body_template: Option<String>,
    pub feedback_issue_labels: Vec<String>,
    pub comment_commands_enabled: bool,
    pub comment_commands_active: bool,
    pub command_allowed_associations: Vec<String>,
    pub command_allowed_users: Vec<String>,
    pub commands: Vec<GithubCommandDefinition>,
    pub updated_at: Option<i64>,
}

/// 部分更新项目级 GitHub 集成配置。`repo_full_name` 传空串表示清除并连带关闭依赖开关。
#[derive(Debug, Clone, Default, Serialize)]
pub struct UpdateProjectGithubIntegrationInput {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub repo_full_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub feedback_issue_enabled: Option<bool>,
    /// 模板来源："inherit" / "custom" / "repo"。
    #[serde(skip_serializing_if = "Option::is_none")]
    pub feedback_issue_template_source: Option<String>,
    /// 来源为 "repo" 时必填，仓库内的相对路径。
    #[serde(skip_serializing_if = "Option::is_none")]
    pub feedback_issue_template_repo_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub feedback_issue_template_repo_ref: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub feedback_issue_title_template: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub feedback_issue_body_template: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub feedback_issue_labels: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub comment_commands_enabled: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub command_allowed_associations: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub command_allowed_users: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub commands: Option<Vec<GithubCommandDefinition>>,
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

/// 公告列表的分页、平台、版本与语言筛选。
#[derive(Debug, Clone, Default)]
pub struct ListAnnouncementsOptions {
    pub limit: Option<u32>,
    pub offset: Option<u32>,
    /// 只取投放到该平台的公告。
    pub platform: Option<Platform>,
    /// 客户端当前版本号，用来筛掉不在可见版本范围内的公告。
    /// **不传时，所有设了可见版本范围的公告都不会返回。**
    pub version: Option<String>,
    /// 语言偏好。命中项目注册的语言且该公告有译文时返回译文，否则返回默认内容；
    /// 返回项的 `locale` 字段标出实际语言（None 即默认内容）。
    pub locale: Option<String>,
}

/// 最新公告的筛选项，与列表接口同义。
#[derive(Debug, Clone, Default)]
pub struct LatestAnnouncementOptions {
    pub platform: Option<Platform>,
    pub version: Option<String>,
    pub locale: Option<String>,
}

/// 反馈列表的分页与隐藏项开关。
#[derive(Debug, Clone, Default)]
pub struct ListFeedbacksOptions {
    pub limit: Option<u32>,
    pub offset: Option<u32>,
    /// 是否把已隐藏的反馈一起列出来，默认 false。
    pub include_hidden: Option<bool>,
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
    /// 联系方式，邮箱 / 手机号 / IM 账号皆可。
    #[serde(skip_serializing_if = "Option::is_none")]
    pub contact: Option<String>,
    /// 由提交者选择是否把这条反馈转发成 GitHub Issue，默认 false。
    /// 传 true 时联系方式必填（SDK 本地就会拒绝）且受单 IP 转发限流约束；
    /// Issue 建失败时这条反馈不会被记录。仅公开提交接口生效。
    #[serde(skip_serializing_if = "Option::is_none")]
    pub forward_to_github: Option<bool>,
    /// 隐藏后后台列表默认不返回，评分仍计入统计。
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_hidden: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub platform: Option<Platform>,
    /// 系统版本明细，如 `11` / `ubuntu 24.04`。
    #[serde(skip_serializing_if = "Option::is_none")]
    pub platform_version: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub custom_data: Option<JsonObject>,
}

/// 反馈提交选项，决定客户端是否显示「转发到 GitHub Issue」的勾选框。
#[derive(Debug, Clone, Deserialize)]
pub struct PublicFeedbackOptions {
    pub project_key: String,
    pub github_forward_available: bool,
    /// 选择转发时联系方式是否必填；转发不可用时恒为 false。
    pub contact_required_for_forward: bool,
}

#[derive(Debug, Clone, Default, Serialize)]
pub struct UpdateFeedbackInput {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub user_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rating: Option<u8>,
    /// 联系方式，邮箱 / 手机号 / IM 账号皆可。
    #[serde(skip_serializing_if = "Option::is_none")]
    pub contact: Option<String>,
    /// 隐藏后后台列表默认不返回，评分仍计入统计。
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_hidden: Option<bool>,
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
    /// 项目名称与描述的译文。传了就整体替换全部译文，空数组即清空；不传则不动。
    /// 语言必须先在项目里注册（同义标签同样算命中），否则整个请求 400。
    #[serde(skip_serializing_if = "Option::is_none")]
    pub translations: Option<Vec<ProjectTranslation>>,
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
    /// 传了即整体替换全部译文，空数组即清空；不传则保持原样。
    #[serde(skip_serializing_if = "Option::is_none")]
    pub translations: Option<Vec<ProjectTranslation>>,
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
    /// 可见版本范围下界（含）。留空即该端不限。
    #[serde(skip_serializing_if = "Option::is_none")]
    pub min_comparable_version: Option<String>,
    /// 可见版本范围上界（含）。留空即该端不限。
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_comparable_version: Option<String>,
    /// 译文集合。传了就整体替换该公告的全部译文，空数组即清空；不传则不动。
    /// 语言必须先在项目里注册，否则整个请求 400。
    #[serde(skip_serializing_if = "Option::is_none")]
    pub translations: Option<Vec<AnnouncementTranslation>>,
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
    pub min_comparable_version: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_comparable_version: Option<String>,
    /// 传了即整体替换全部译文，空数组即清空；不传则保持原样。
    #[serde(skip_serializing_if = "Option::is_none")]
    pub translations: Option<Vec<AnnouncementTranslation>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub published_at: Option<i64>,
}

/// 注册项目语言。已注册（主标签或同义标签命中，均忽略大小写）时只更新其余字段。
#[derive(Debug, Clone, Default, Serialize)]
pub struct CreateProjectLocaleInput {
    /// 如 zh-CN / en-US。
    pub locale: String,
    /// 同义标签，例如主标签 `en` 列出 `en-US` / `en-GB`。
    /// 与本项目其它语言的主标签或同义标签相撞会 400。
    #[serde(skip_serializing_if = "Option::is_none")]
    pub aliases: Option<Vec<String>>,
    /// 后台展示名，如「简体中文」。
    #[serde(skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
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
