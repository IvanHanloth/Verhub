use reqwest::Method;
use serde_json::{Map, Value};

use crate::analytics::EventBatch;
use crate::error::{Error, Result};
use crate::http::{segment, Inner};
use crate::models::*;

/// 公开接口，不需要凭据。
///
/// 项目作用域的方法用客户端绑定的 `project_key`，不再逐次收项目参数。
#[derive(Debug, Clone, Copy)]
pub struct PublicApi<'a> {
    pub(crate) inner: &'a Inner,
}

impl PublicApi<'_> {
    /// 取项目公开信息。
    ///
    /// `locale` 命中项目注册的语言（主标签或同义标签，大小写不敏感）且该语言译文
    /// 填了对应字段时，`name` / `description` 返回译文，返回体的 `locale` 标出实际
    /// 语言；否则回落项目自身的值。
    pub async fn get_project(&self, locale: Option<&str>) -> Result<ProjectItem> {
        let key = self.inner.require_project_key()?;
        self.inner
            .request::<_, ()>(
                Method::GET,
                &format!("/public/{}", segment(&key)),
                &[("locale", locale.map(str::to_string))],
                None,
                false,
            )
            .await
    }

    /// 取公开版本列表。
    pub async fn list_versions(
        &self,
        options: &ListVersionsOptions,
    ) -> Result<VersionListResponse> {
        let key = self.inner.require_project_key()?;
        self.inner
            .request::<_, ()>(
                Method::GET,
                &format!("/public/{}/versions", segment(&key)),
                &[
                    ("limit", options.limit.map(|v| v.to_string())),
                    ("offset", options.offset.map(|v| v.to_string())),
                    ("locale", options.locale.clone()),
                ],
                None,
                false,
            )
            .await
    }

    /// 取最新正式版本。
    ///
    /// `locale` 命中项目注册的语言（主标签或同义标签，大小写不敏感）且该版本有对应
    /// 译文时，`title` / `content` 返回译文，返回体的 `locale` 标出实际语言；
    /// 否则回落版本自身的内容。
    pub async fn get_latest_version(&self, locale: Option<&str>) -> Result<VersionItem> {
        let key = self.inner.require_project_key()?;
        self.inner
            .request::<_, ()>(
                Method::GET,
                &format!("/public/{}/versions/latest", segment(&key)),
                &[("locale", locale.map(str::to_string))],
                None,
                false,
            )
            .await
    }

    /// 取最新 preview 版本；没有则为 `None`。`locale` 语义同 `get_latest_version`。
    pub async fn get_latest_preview_version(
        &self,
        locale: Option<&str>,
    ) -> Result<Option<VersionItem>> {
        let key = self.inner.require_project_key()?;
        self.inner
            .request::<_, ()>(
                Method::GET,
                &format!("/public/{}/versions/latest-preview", segment(&key)),
                &[("locale", locale.map(str::to_string))],
                None,
                false,
            )
            .await
    }

    /// 按版本号取指定版本。`locale` 语义同 `get_latest_version`。
    pub async fn get_version(&self, version: &str, locale: Option<&str>) -> Result<VersionItem> {
        let key = self.inner.require_project_key()?;
        self.inner
            .request::<_, ()>(
                Method::GET,
                &format!(
                    "/public/{}/versions/by-version/{}",
                    segment(&key),
                    segment(version)
                ),
                &[("locale", locale.map(str::to_string))],
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
                    ("version", options.version.clone()),
                    ("locale", options.locale.clone()),
                ],
                None,
                false,
            )
            .await
    }

    /// 取最新公告。
    pub async fn get_latest_announcement(
        &self,
        options: &LatestAnnouncementOptions,
    ) -> Result<AnnouncementItem> {
        let key = self.inner.require_project_key()?;
        self.inner
            .request::<_, ()>(
                Method::GET,
                &format!("/public/{}/announcements/latest", segment(&key)),
                &[
                    ("platform", options.platform.map(|v| v.as_str().to_string())),
                    ("version", options.version.clone()),
                    ("locale", options.locale.clone()),
                ],
                None,
                false,
            )
            .await
    }

    /// 反馈提交选项。客户端据此决定要不要显示「转发到 GitHub Issue」的勾选框。
    pub async fn get_feedback_options(&self) -> Result<PublicFeedbackOptions> {
        let key = self.inner.require_project_key()?;
        self.inner
            .request::<_, ()>(
                Method::GET,
                &format!("/public/{}/feedbacks/options", segment(&key)),
                &[],
                None,
                false,
            )
            .await
    }

    /// 提交用户反馈。
    ///
    /// `forward_to_github` 为 true 时联系方式必填，本地即返回
    /// [`Error::MissingContact`]；项目未开放转发时服务端返回 400，Issue 建失败时
    /// 整条反馈不会被记录（503）。
    pub async fn create_feedback(&self, input: &CreateFeedbackInput) -> Result<FeedbackItem> {
        if input.forward_to_github == Some(true)
            && !input
                .contact
                .as_deref()
                .is_some_and(|contact| !contact.trim().is_empty())
        {
            return Err(Error::MissingContact);
        }
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

    // ---- 条款文档 ----

    /// 列出全部条款文档的标题与最后更新时间，不含正文。
    ///
    /// 不作用于绑定项目，条款是实例级的。
    pub async fn list_terms(&self) -> Result<TermsDocumentListResponse> {
        self.inner
            .request::<_, ()>(Method::GET, "/public/terms", &[], None, false)
            .await
    }

    /// 取条款文档正文（Markdown）。实例未自定义时返回内置正文。
    pub async fn get_terms(&self, slug: TermsDocumentSlug) -> Result<TermsDocumentView> {
        self.inner
            .request::<_, ()>(
                Method::GET,
                &format!("/public/terms/{}", segment(slug.as_str())),
                &[],
                None,
                false,
            )
            .await
    }

    /// 记录一次用户行为。入队即返回，只有攒够一批或距上次发送超过间隔时才发请求。
    ///
    /// 事件名无需预先登记，服务端第一次收到就自动建立定义。建议用小写下划线形式
    /// （`checkout_clicked`）；服务端归一化为小写，只接受字母、数字、下划线、点、
    /// 连字符与冒号。
    ///
    /// 每条事件带幂等键，发送失败时留在队列里。未同意、已退出或采集被关闭时本调用
    /// 是空操作，返回 `Ok(())`。
    ///
    /// Rust 版不起后台定时任务，攒着的最后一批要靠 [`PublicApi::flush`] 发出去。
    pub async fn track(&self, name: &str, properties: Option<Map<String, Value>>) -> Result<()> {
        if self.inner.analytics().enqueue(name, properties) {
            self.flush().await?;
        }
        Ok(())
    }

    /// 立即发送队列里的所有事件。进程退出前调一次，避免丢掉最后一批。
    ///
    /// 发送失败时事件留在队列里等下次，本方法仍返回 `Ok(())`；失败原因走 `log`
    /// 的 debug 级别。
    pub async fn flush(&self) -> Result<()> {
        let queue = self.inner.analytics();
        let key = match self.inner.project_key() {
            Some(key) => key,
            // 没绑定项目就无处可发。
            None => return Ok(()),
        };

        while let Some(batch) = queue.take_batch() {
            let sent = batch.events.len();
            let result: Result<IngestEventsResponse> = self
                .inner
                .request(
                    Method::POST,
                    &format!("/public/{}/events", segment(&key)),
                    &[],
                    Some(&batch),
                    false,
                )
                .await;

            match result {
                Ok(_) => queue.commit(sent),
                Err(err) => {
                    log::debug!("verhub: 事件发送失败，稍后重试：{err}");
                    queue.record_failure();
                    return Ok(());
                }
            }
        }
        Ok(())
    }

    /// 停止采集、丢弃待发队列、删除本地匿名标识，并把退出标记写入本地。
    pub fn opt_out(&self) {
        self.inner.analytics().opt_out();
    }

    /// 撤销退出，并生成一个新的匿名标识。
    pub fn opt_in(&self) {
        self.inner.analytics().opt_in();
    }

    /// 当前是否处于退出状态。
    pub fn has_opted_out(&self) -> bool {
        self.inner.analytics().has_opted_out()
    }

    /// `require_consent` 模式下开闸。在此之前 SDK 不采集、不写盘，含匿名标识的生成。
    pub fn grant_consent(&self) {
        self.inner.analytics().grant_consent();
    }

    /// 撤回同意，等价于 [`PublicApi::opt_out`] 并回到未同意状态。
    pub fn revoke_consent(&self) {
        self.inner.analytics().revoke_consent();
    }

    /// 换一个新的匿名标识，切断与既往事件序列的关联。保持采集开启。
    pub fn reset_identity(&self) {
        self.inner.analytics().reset_identity();
    }

    /// 当前的匿名标识；未采集状态下为 `None`。
    pub fn distinct_id(&self) -> Option<String> {
        self.inner.analytics().current_distinct_id()
    }

    /// 导出本机匿名标识下的全部事件明细（GDPR Art.15 / Art.20）。
    ///
    /// `distinct_id` 传 `None` 则用当前标识；没有可用标识时返回
    /// [`Error::MissingDistinctId`]。
    pub async fn export_my_data(&self, distinct_id: Option<&str>) -> Result<EventSubjectExport> {
        let key = self.inner.require_project_key()?;
        let id = self.require_distinct_id(distinct_id)?;
        self.inner
            .request::<_, ()>(
                Method::GET,
                &format!("/public/{}/events/me", segment(&key)),
                &[("distinct_id", Some(id))],
                None,
                false,
            )
            .await
    }

    /// 删除本机匿名标识下的全部事件明细（GDPR Art.17）。
    ///
    /// 小时汇总不在删除范围内。`distinct_id` 传 `None` 则用当前标识；没有可用
    /// 标识时返回 [`Error::MissingDistinctId`]。
    pub async fn delete_my_data(
        &self,
        distinct_id: Option<&str>,
    ) -> Result<EventSubjectDeleteResponse> {
        let key = self.inner.require_project_key()?;
        let id = self.require_distinct_id(distinct_id)?;
        self.inner
            .request::<_, ()>(
                Method::DELETE,
                &format!("/public/{}/events/me", segment(&key)),
                &[("distinct_id", Some(id))],
                None,
                false,
            )
            .await
    }

    /// 直接发一批事件，绕过本地队列。常规入口是 [`PublicApi::track`]。
    pub async fn ingest_events(&self, batch: &EventBatch) -> Result<IngestEventsResponse> {
        let key = self.inner.require_project_key()?;
        self.inner
            .request(
                Method::POST,
                &format!("/public/{}/events", segment(&key)),
                &[],
                Some(batch),
                false,
            )
            .await
    }

    fn require_distinct_id(&self, explicit: Option<&str>) -> Result<String> {
        explicit
            .map(str::to_string)
            .or_else(|| self.inner.analytics().current_distinct_id())
            .ok_or(Error::MissingDistinctId)
    }
}
