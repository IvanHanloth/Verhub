use reqwest::Method;
use serde_json::{json, Value};

use crate::error::{Error, Result};
use crate::http::{segment, Inner};
use crate::models::*;

/// 管理接口，全部需要凭据。
///
/// 凭据可以是 `POST /auth/login` 拿到的管理员 JWT（默认 2 小时过期），也可以是
/// 后台签发的长期 API Key（`vh_` 前缀）。两者在 admin 接口上等价，但 API Key
/// 受 scope 与项目范围限制：读接口要 `<资源>:read`，写接口要 `<资源>:write`，
/// 写权限不隐含读权限。
///
/// 项目作用域的方法用客户端绑定的 `project_key`，不再逐次收项目参数；跨项目的
/// 方法（`list_projects`、各类统计、按 id 操作行为等）不涉及绑定项目。
#[derive(Debug, Clone, Copy)]
pub struct AdminApi<'a> {
    pub(crate) inner: &'a Inner,
}

impl AdminApi<'_> {
    // ---- 项目 ----

    /// 取项目列表（全部项目，不限于绑定项目）。
    pub async fn list_projects(&self, options: &PageOptions) -> Result<ProjectListResponse> {
        self.inner
            .request::<_, ()>(Method::GET, "/admin/projects", &page(options), None, true)
            .await
    }

    /// 创建项目。`input.project_key` 是新项目标识，省略则用客户端绑定的那个。
    pub async fn create_project(&self, input: &CreateProjectInput) -> Result<ProjectItem> {
        let mut body = serde_json::to_value(input).map_err(Error::Decode)?;
        if let Value::Object(map) = &mut body {
            if !map.contains_key("project_key") {
                map.insert("project_key".into(), json!(self.inner.require_project_key()?));
            }
        }
        self.inner
            .request(Method::POST, "/admin/projects", &[], Some(&body), true)
            .await
    }

    /// 取绑定项目的详情。
    pub async fn get_project(&self) -> Result<ProjectItem> {
        let key = self.inner.require_project_key()?;
        self.inner
            .request::<_, ()>(
                Method::GET,
                &format!("/admin/projects/{}", segment(&key)),
                &[],
                None,
                true,
            )
            .await
    }

    /// 更新绑定的项目。提交 `project_key` 会改键，改完记得 `set_project_key`。
    pub async fn update_project(&self, input: &UpdateProjectInput) -> Result<ProjectItem> {
        let key = self.inner.require_project_key()?;
        self.inner
            .request(
                Method::PATCH,
                &format!("/admin/projects/{}", segment(&key)),
                &[],
                Some(input),
                true,
            )
            .await
    }

    /// 删除绑定的项目。
    pub async fn delete_project(&self) -> Result<DeleteSuccessResponse> {
        let key = self.inner.require_project_key()?;
        self.inner
            .request::<_, ()>(
                Method::DELETE,
                &format!("/admin/projects/{}", segment(&key)),
                &[],
                None,
                true,
            )
            .await
    }

    /// 取项目总数。
    pub async fn get_project_statistics(&self) -> Result<ProjectStatistics> {
        self.inner
            .request::<_, ()>(Method::GET, "/admin/projects/statistics", &[], None, true)
            .await
    }

    /// 从 GitHub 仓库地址预填项目字段。
    pub async fn preview_github_repo(&self, repo_url: &str) -> Result<GithubRepoProjectPreview> {
        self.inner
            .request::<_, ()>(
                Method::GET,
                "/admin/projects/github-repo-preview",
                &[("repo_url", Some(repo_url.to_string()))],
                None,
                true,
            )
            .await
    }

    // ---- 版本 ----

    /// 取版本列表。
    pub async fn list_versions(&self, options: &PageOptions) -> Result<VersionListResponse> {
        let key = self.inner.require_project_key()?;
        self.inner
            .request::<_, ()>(
                Method::GET,
                &format!("/admin/projects/{}/versions", segment(&key)),
                &page(options),
                None,
                true,
            )
            .await
    }

    /// 创建版本。
    pub async fn create_version(&self, input: &CreateVersionInput) -> Result<VersionItem> {
        let key = self.inner.require_project_key()?;
        self.inner
            .request(
                Method::POST,
                &format!("/admin/projects/{}/versions", segment(&key)),
                &[],
                Some(input),
                true,
            )
            .await
    }

    /// 取单个版本。
    pub async fn get_version(&self, version_id: &str) -> Result<VersionItem> {
        let key = self.inner.require_project_key()?;
        self.inner
            .request::<_, ()>(
                Method::GET,
                &format!(
                    "/admin/projects/{}/versions/{}",
                    segment(&key),
                    segment(version_id)
                ),
                &[],
                None,
                true,
            )
            .await
    }

    /// 更新版本。省略的字段保持原值；`Some(None)` 的字段被置空。
    pub async fn update_version(
        &self,
        version_id: &str,
        input: &UpdateVersionInput,
    ) -> Result<VersionItem> {
        let key = self.inner.require_project_key()?;
        self.inner
            .request(
                Method::PATCH,
                &format!(
                    "/admin/projects/{}/versions/{}",
                    segment(&key),
                    segment(version_id)
                ),
                &[],
                Some(input),
                true,
            )
            .await
    }

    /// 按版本号创建或更新，适合在 CI 里幂等地发版。
    ///
    /// 目标版本号取自路径。新建时省略 `comparable_version` 会由版本号推导
    /// （去掉前导 v）；更新时省略的字段保持原值。
    pub async fn upsert_version(
        &self,
        version: &str,
        input: &UpsertVersionInput,
    ) -> Result<VersionItem> {
        let key = self.inner.require_project_key()?;
        self.inner
            .request(
                Method::PUT,
                &format!(
                    "/admin/projects/{}/versions/by-version/{}",
                    segment(&key),
                    segment(version)
                ),
                &[],
                Some(input),
                true,
            )
            .await
    }

    /// 删除版本。
    pub async fn delete_version(&self, version_id: &str) -> Result<DeleteSuccessResponse> {
        let key = self.inner.require_project_key()?;
        self.inner
            .request::<_, ()>(
                Method::DELETE,
                &format!(
                    "/admin/projects/{}/versions/{}",
                    segment(&key),
                    segment(version_id)
                ),
                &[],
                None,
                true,
            )
            .await
    }

    /// 取版本总量与时间跨度。
    pub async fn get_version_statistics(&self) -> Result<VersionStatistics> {
        self.inner
            .request::<_, ()>(Method::GET, "/admin/versions/statistics", &[], None, true)
            .await
    }

    /// 从 GitHub Release 预填版本字段。`tag` 省略则取最新一个。
    pub async fn preview_github_release(
        &self,
        tag: Option<&str>,
    ) -> Result<GithubReleaseVersionPreview> {
        let key = self.inner.require_project_key()?;
        self.inner
            .request::<_, ()>(
                Method::GET,
                &format!(
                    "/admin/projects/{}/versions/github-release-preview",
                    segment(&key)
                ),
                &[("tag", tag.map(str::to_string))],
                None,
                true,
            )
            .await
    }

    /// 从 GitHub Release 批量导入历史版本。已存在的版本计入 `skipped`。
    pub async fn import_github_releases(&self) -> Result<VersionImportResult> {
        let key = self.inner.require_project_key()?;
        self.inner
            .request::<_, ()>(
                Method::POST,
                &format!(
                    "/admin/projects/{}/versions/github-release-import",
                    segment(&key)
                ),
                &[],
                None,
                true,
            )
            .await
    }

    // ---- 公告 ----

    /// 取公告列表。
    pub async fn list_announcements(
        &self,
        options: &PageOptions,
    ) -> Result<AnnouncementListResponse> {
        let key = self.inner.require_project_key()?;
        self.inner
            .request::<_, ()>(
                Method::GET,
                &format!("/admin/projects/{}/announcements", segment(&key)),
                &page(options),
                None,
                true,
            )
            .await
    }

    /// 新增公告。
    pub async fn create_announcement(
        &self,
        input: &CreateAnnouncementInput,
    ) -> Result<AnnouncementItem> {
        let key = self.inner.require_project_key()?;
        self.inner
            .request(
                Method::POST,
                &format!("/admin/projects/{}/announcements", segment(&key)),
                &[],
                Some(input),
                true,
            )
            .await
    }

    /// 取单条公告。
    pub async fn get_announcement(&self, announcement_id: &str) -> Result<AnnouncementItem> {
        let key = self.inner.require_project_key()?;
        self.inner
            .request::<_, ()>(
                Method::GET,
                &format!(
                    "/admin/projects/{}/announcements/{}",
                    segment(&key),
                    segment(announcement_id)
                ),
                &[],
                None,
                true,
            )
            .await
    }

    /// 更新公告。
    pub async fn update_announcement(
        &self,
        announcement_id: &str,
        input: &UpdateAnnouncementInput,
    ) -> Result<AnnouncementItem> {
        let key = self.inner.require_project_key()?;
        self.inner
            .request(
                Method::PATCH,
                &format!(
                    "/admin/projects/{}/announcements/{}",
                    segment(&key),
                    segment(announcement_id)
                ),
                &[],
                Some(input),
                true,
            )
            .await
    }

    /// 删除公告。
    pub async fn delete_announcement(
        &self,
        announcement_id: &str,
    ) -> Result<DeleteSuccessResponse> {
        let key = self.inner.require_project_key()?;
        self.inner
            .request::<_, ()>(
                Method::DELETE,
                &format!(
                    "/admin/projects/{}/announcements/{}",
                    segment(&key),
                    segment(announcement_id)
                ),
                &[],
                None,
                true,
            )
            .await
    }

    /// 取公告总数与置顶数。
    pub async fn get_announcement_statistics(&self) -> Result<AnnouncementStatistics> {
        self.inner
            .request::<_, ()>(
                Method::GET,
                "/admin/announcements/statistics",
                &[],
                None,
                true,
            )
            .await
    }

    // ---- 反馈 ----

    /// 取反馈列表。
    pub async fn list_feedbacks(&self, options: &PageOptions) -> Result<FeedbackListResponse> {
        let key = self.inner.require_project_key()?;
        self.inner
            .request::<_, ()>(
                Method::GET,
                &format!("/admin/projects/{}/feedbacks", segment(&key)),
                &page(options),
                None,
                true,
            )
            .await
    }

    /// 后台手动补录反馈。客户端上报请用 [`crate::PublicApi::create_feedback`]。
    pub async fn create_feedback(&self, input: &CreateFeedbackInput) -> Result<FeedbackItem> {
        let key = self.inner.require_project_key()?;
        self.inner
            .request(
                Method::POST,
                &format!("/admin/projects/{}/feedbacks", segment(&key)),
                &[],
                Some(input),
                true,
            )
            .await
    }

    /// 取单条反馈。
    pub async fn get_feedback(&self, feedback_id: &str) -> Result<FeedbackItem> {
        let key = self.inner.require_project_key()?;
        self.inner
            .request::<_, ()>(
                Method::GET,
                &format!(
                    "/admin/projects/{}/feedbacks/{}",
                    segment(&key),
                    segment(feedback_id)
                ),
                &[],
                None,
                true,
            )
            .await
    }

    /// 编辑反馈。
    pub async fn update_feedback(
        &self,
        feedback_id: &str,
        input: &UpdateFeedbackInput,
    ) -> Result<FeedbackItem> {
        let key = self.inner.require_project_key()?;
        self.inner
            .request(
                Method::PATCH,
                &format!(
                    "/admin/projects/{}/feedbacks/{}",
                    segment(&key),
                    segment(feedback_id)
                ),
                &[],
                Some(input),
                true,
            )
            .await
    }

    /// 删除反馈。
    pub async fn delete_feedback(&self, feedback_id: &str) -> Result<DeleteSuccessResponse> {
        let key = self.inner.require_project_key()?;
        self.inner
            .request::<_, ()>(
                Method::DELETE,
                &format!(
                    "/admin/projects/{}/feedbacks/{}",
                    segment(&key),
                    segment(feedback_id)
                ),
                &[],
                None,
                true,
            )
            .await
    }

    /// 取反馈总数与平均分。
    pub async fn get_feedback_statistics(&self) -> Result<FeedbackStatistics> {
        self.inner
            .request::<_, ()>(Method::GET, "/admin/feedbacks/statistics", &[], None, true)
            .await
    }

    // ---- 日志 ----

    /// 取日志列表。
    pub async fn list_logs(&self, options: &ListLogsOptions) -> Result<LogListResponse> {
        let key = self.inner.require_project_key()?;
        self.inner
            .request::<_, ()>(
                Method::GET,
                &format!("/admin/projects/{}/logs", segment(&key)),
                &[
                    ("limit", options.limit.map(|v| v.to_string())),
                    ("offset", options.offset.map(|v| v.to_string())),
                    ("level", options.level.map(|v| u8::from(v).to_string())),
                    ("start_time", options.start_time.map(|v| v.to_string())),
                    ("end_time", options.end_time.map(|v| v.to_string())),
                ],
                None,
                true,
            )
            .await
    }

    /// 后台手动补录日志。客户端上报请用 [`crate::PublicApi::upload_log`]。
    pub async fn create_log(&self, input: &CreateLogInput) -> Result<LogItem> {
        let key = self.inner.require_project_key()?;
        self.inner
            .request(
                Method::POST,
                &format!("/admin/projects/{}/logs", segment(&key)),
                &[],
                Some(input),
                true,
            )
            .await
    }

    /// 取各等级日志条数。
    pub async fn get_log_statistics(&self) -> Result<LogStatistics> {
        self.inner
            .request::<_, ()>(Method::GET, "/admin/logs/statistics", &[], None, true)
            .await
    }

    // ---- 行为 ----

    /// 取行为定义列表。
    pub async fn list_actions(&self, options: &PageOptions) -> Result<ActionListResponse> {
        let key = self.inner.require_project_key()?;
        self.inner
            .request::<_, ()>(
                Method::GET,
                &format!("/admin/projects/{}/actions", segment(&key)),
                &page(options),
                None,
                true,
            )
            .await
    }

    /// 在绑定项目下创建行为定义。
    pub async fn create_action(&self, input: &CreateActionInput) -> Result<ActionItem> {
        let mut body = serde_json::to_value(input).map_err(Error::Decode)?;
        if let Value::Object(map) = &mut body {
            map.insert("project_key".into(), json!(self.inner.require_project_key()?));
        }
        self.inner
            .request(Method::POST, "/admin/projects/actions", &[], Some(&body), true)
            .await
    }

    /// 编辑行为定义。
    pub async fn update_action(
        &self,
        action_id: &str,
        input: &UpdateActionInput,
    ) -> Result<ActionItem> {
        self.inner
            .request(
                Method::PATCH,
                &format!("/admin/actions/{}", segment(action_id)),
                &[],
                Some(input),
                true,
            )
            .await
    }

    /// 删除行为定义。
    pub async fn delete_action(&self, action_id: &str) -> Result<DeleteSuccessResponse> {
        self.inner
            .request::<_, ()>(
                Method::DELETE,
                &format!("/admin/actions/{}", segment(action_id)),
                &[],
                None,
                true,
            )
            .await
    }

    /// 取某个行为定义下的行为记录。
    pub async fn list_action_records(
        &self,
        action_id: &str,
        options: &PageOptions,
    ) -> Result<ActionRecordListResponse> {
        self.inner
            .request::<_, ()>(
                Method::GET,
                &format!("/admin/actions/{}", segment(action_id)),
                &page(options),
                None,
                true,
            )
            .await
    }

    /// 取单条行为记录。
    pub async fn get_action_record(&self, action_record_id: &str) -> Result<ActionRecordItem> {
        self.inner
            .request::<_, ()>(
                Method::GET,
                &format!("/admin/actions/record/{}", segment(action_record_id)),
                &[],
                None,
                true,
            )
            .await
    }

    /// 取行为定义总数。
    pub async fn get_action_statistics(&self) -> Result<ActionStatistics> {
        self.inner
            .request::<_, ()>(Method::GET, "/admin/actions/statistics", &[], None, true)
            .await
    }

    /// 取行为记录总数。
    pub async fn get_action_record_statistics(&self) -> Result<ActionStatistics> {
        self.inner
            .request::<_, ()>(
                Method::GET,
                "/admin/actions/record/statistics",
                &[],
                None,
                true,
            )
            .await
    }

    // ---- GitHub Webhook ----

    /// 查绑定项目的 webhook 配置。secret 不回显，只给末 4 位提示。
    pub async fn get_github_webhook(&self) -> Result<GithubWebhookSettings> {
        let key = self.inner.require_project_key()?;
        self.inner
            .request::<_, ()>(
                Method::GET,
                &format!("/admin/projects/{}/github-webhook", segment(&key)),
                &[],
                None,
                true,
            )
            .await
    }

    /// 设置 webhook secret，16..=256 字符。返回值含完整 secret，仅此一次。
    pub async fn set_github_webhook_secret(
        &self,
        secret: &str,
    ) -> Result<GithubWebhookSecretRevealed> {
        let key = self.inner.require_project_key()?;
        self.inner
            .request(
                Method::PUT,
                &format!("/admin/projects/{}/github-webhook", segment(&key)),
                &[],
                Some(&json!({ "secret": secret })),
                true,
            )
            .await
    }

    /// 重新生成 webhook secret。旧 secret 立即失效，记得同步改 GitHub。
    pub async fn regenerate_github_webhook_secret(&self) -> Result<GithubWebhookSecretRevealed> {
        let key = self.inner.require_project_key()?;
        self.inner
            .request::<_, ()>(
                Method::POST,
                &format!("/admin/projects/{}/github-webhook/regenerate", segment(&key)),
                &[],
                None,
                true,
            )
            .await
    }

    /// 清除 webhook secret。接收端点随即拒绝所有推送。
    pub async fn clear_github_webhook_secret(&self) -> Result<GithubWebhookSettings> {
        let key = self.inner.require_project_key()?;
        self.inner
            .request::<_, ()>(
                Method::DELETE,
                &format!("/admin/projects/{}/github-webhook", segment(&key)),
                &[],
                None,
                true,
            )
            .await
    }
}

fn page(options: &PageOptions) -> [(&'static str, Option<String>); 2] {
    [
        ("limit", options.limit.map(|v| v.to_string())),
        ("offset", options.offset.map(|v| v.to_string())),
    ]
}
