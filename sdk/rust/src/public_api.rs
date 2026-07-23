use reqwest::Method;

use crate::error::Result;
use crate::http::{segment, Inner};
use crate::models::*;

/// 公开接口，不需要凭据。
///
/// 这些是客户端 App 会直接调用的那一组：查版本、查公告、报日志和行为。全部作用于
/// 客户端绑定的项目（构造时传入的 `project_key`），因此方法不再逐次收项目参数。
#[derive(Debug, Clone, Copy)]
pub struct PublicApi<'a> {
    pub(crate) inner: &'a Inner,
}

impl PublicApi<'_> {
    /// 取项目公开信息。
    pub async fn get_project(&self) -> Result<ProjectItem> {
        let key = self.inner.require_project_key()?;
        self.inner
            .request::<_, ()>(
                Method::GET,
                &format!("/public/{}", segment(&key)),
                &[],
                None,
                false,
            )
            .await
    }

    /// 取公开版本列表。
    pub async fn list_versions(&self, options: &PageOptions) -> Result<VersionListResponse> {
        let key = self.inner.require_project_key()?;
        self.inner
            .request::<_, ()>(
                Method::GET,
                &format!("/public/{}/versions", segment(&key)),
                &[
                    ("limit", options.limit.map(|v| v.to_string())),
                    ("offset", options.offset.map(|v| v.to_string())),
                ],
                None,
                false,
            )
            .await
    }

    /// 取最新正式版本。
    pub async fn get_latest_version(&self) -> Result<VersionItem> {
        let key = self.inner.require_project_key()?;
        self.inner
            .request::<_, ()>(
                Method::GET,
                &format!("/public/{}/versions/latest", segment(&key)),
                &[],
                None,
                false,
            )
            .await
    }

    /// 取最新 preview 版本；没有则为 `None`。
    pub async fn get_latest_preview_version(&self) -> Result<Option<VersionItem>> {
        let key = self.inner.require_project_key()?;
        self.inner
            .request::<_, ()>(
                Method::GET,
                &format!("/public/{}/versions/latest-preview", segment(&key)),
                &[],
                None,
                false,
            )
            .await
    }

    /// 按版本号取指定版本。
    pub async fn get_version(&self, version: &str) -> Result<VersionItem> {
        let key = self.inner.require_project_key()?;
        self.inner
            .request::<_, ()>(
                Method::GET,
                &format!(
                    "/public/{}/versions/by-version/{}",
                    segment(&key),
                    segment(version)
                ),
                &[],
                None,
                false,
            )
            .await
    }

    /// 提交当前版本并检查更新。
    ///
    /// `current_version` 与 `current_comparable_version` 至少提供一个。只给
    /// `current_version` 时服务端按版本号查库取其登记的可比较版本号，该版本未
    /// 登记会返回 400；两者都给时以 `current_comparable_version` 为准。
    pub async fn check_update(&self, input: &CheckUpdateInput) -> Result<CheckUpdateResponse> {
        let key = self.inner.require_project_key()?;
        self.inner
            .request(
                Method::POST,
                &format!("/public/{}/versions/check-update", segment(&key)),
                &[],
                Some(input),
                false,
            )
            .await
    }

    /// 取公开公告列表。
    pub async fn list_announcements(
        &self,
        options: &ListAnnouncementsOptions,
    ) -> Result<AnnouncementListResponse> {
        let key = self.inner.require_project_key()?;
        self.inner
            .request::<_, ()>(
                Method::GET,
                &format!("/public/{}/announcements", segment(&key)),
                &[
                    ("limit", options.limit.map(|v| v.to_string())),
                    ("offset", options.offset.map(|v| v.to_string())),
                    ("platform", options.platform.map(|v| v.as_str().to_string())),
                ],
                None,
                false,
            )
            .await
    }

    /// 取最新公告。
    pub async fn get_latest_announcement(
        &self,
        platform: Option<Platform>,
    ) -> Result<AnnouncementItem> {
        let key = self.inner.require_project_key()?;
        self.inner
            .request::<_, ()>(
                Method::GET,
                &format!("/public/{}/announcements/latest", segment(&key)),
                &[("platform", platform.map(|v| v.as_str().to_string()))],
                None,
                false,
            )
            .await
    }

    /// 提交用户反馈。
    pub async fn create_feedback(&self, input: &CreateFeedbackInput) -> Result<FeedbackItem> {
        let key = self.inner.require_project_key()?;
        self.inner
            .request(
                Method::POST,
                &format!("/public/{}/feedbacks", segment(&key)),
                &[],
                Some(input),
                false,
            )
            .await
    }

    /// 上报日志。
    pub async fn upload_log(&self, input: &UploadLogInput) -> Result<LogItem> {
        let key = self.inner.require_project_key()?;
        self.inner
            .request(
                Method::POST,
                &format!("/public/{}/logs", segment(&key)),
                &[],
                Some(input),
                false,
            )
            .await
    }

    /// 上报行为记录。`action_id` 需先在后台创建。
    pub async fn create_action_record(
        &self,
        input: &CreateActionRecordInput,
    ) -> Result<ActionRecordItem> {
        let key = self.inner.require_project_key()?;
        self.inner
            .request(
                Method::POST,
                &format!("/public/{}/actions", segment(&key)),
                &[],
                Some(input),
                false,
            )
            .await
    }
}
