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
/// 方法（`list_projects`、各类统计、条款文档等）不涉及绑定项目。
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
        let mut body = serde_json::to_value(input).map_err(Error::Encode)?;
        if let Value::Object(map) = &mut body {
            if !map.contains_key("project_key") {
                map.insert(
                    "project_key".into(),
                    json!(self.inner.require_project_key()?),
                );
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

    /// 更新绑定的项目。提交 `project_key` 会改键；改键后旧 key 会自动登记为别名并
    /// 继续指向本项目（旧 key 仍可访问），但仍应 `set_project_key` 切到新 key。
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

    /// 列出绑定项目的别名（改名保留的旧 Project Key）。
    pub async fn list_project_aliases(&self) -> Result<ProjectAliasListResponse> {
        let key = self.inner.require_project_key()?;
        self.inner
            .request::<_, ()>(
                Method::GET,
                &format!("/admin/projects/{}/aliases", segment(&key)),
                &[],
                None,
                true,
            )
            .await
    }

    /// 删除一个别名。删除后旧 key 不再指向本项目，此后以它访问会 404。
    pub async fn delete_project_alias(&self, alias: &str) -> Result<DeleteSuccessResponse> {
        let key = self.inner.require_project_key()?;
        self.inner
            .request::<_, ()>(
                Method::DELETE,
                &format!(
                    "/admin/projects/{}/aliases/{}",
                    segment(&key),
                    segment(alias)
                ),
                &[],
                None,
                true,
            )
            .await
    }

    /// 列出绑定项目注册的语言。只有注册过的语言能存译文，也只有它们的偏好
    /// 会被公开接口认账——公开端收到未注册的语言偏好时返回默认内容。
    pub async fn list_project_locales(&self) -> Result<ProjectLocaleListResponse> {
        let key = self.inner.require_project_key()?;
        self.inner
            .request::<_, ()>(
                Method::GET,
                &format!("/admin/projects/{}/locales", segment(&key)),
                &[],
                None,
                true,
            )
            .await
    }

    /// 注册一个语言。已注册（主标签或同义标签命中，均忽略大小写）时只更新其余字段，
    /// 不会新建第二行。同义标签让多个写法指向同一份译文（主标签 `en` 列出
    /// `en-US` / `en-GB`），与本项目其它语言相撞会 400。
    pub async fn create_project_locale(
        &self,
        input: &CreateProjectLocaleInput,
    ) -> Result<ProjectLocaleItem> {
        let key = self.inner.require_project_key()?;
        self.inner
            .request(
                Method::POST,
                &format!("/admin/projects/{}/locales", segment(&key)),
                &[],
                Some(input),
                true,
            )
            .await
    }

    /// 注销一个语言。已录入的译文不会被删除，只是暂时不可达，重新注册即恢复。
    pub async fn delete_project_locale(&self, locale: &str) -> Result<DeleteSuccessResponse> {
        let key = self.inner.require_project_key()?;
        self.inner
            .request::<_, ()>(
                Method::DELETE,
                &format!(
                    "/admin/projects/{}/locales/{}",
                    segment(&key),
                    segment(locale)
                ),
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

    /// 取反馈列表。默认不含已隐藏的反馈，`include_hidden` 为真时一并返回。
    pub async fn list_feedbacks(
        &self,
        options: &ListFeedbacksOptions,
    ) -> Result<FeedbackListResponse> {
        let key = self.inner.require_project_key()?;
        self.inner
            .request::<_, ()>(
                Method::GET,
                &format!("/admin/projects/{}/feedbacks", segment(&key)),
                &[
                    ("limit", options.limit.map(|v| v.to_string())),
                    ("offset", options.offset.map(|v| v.to_string())),
                    (
                        "include_hidden",
                        options.include_hidden.map(|v| v.to_string()),
                    ),
                ],
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

    // ---- 事件分析 ----

    /// 自动发现的事件清单。定义由采集端在第一次收到某个事件名时登记，没有创建接口。
    pub async fn list_event_definitions(
        &self,
        options: &ListEventDefinitionsOptions,
    ) -> Result<EventDefinitionListResponse> {
        let key = self.inner.require_project_key()?;
        self.inner
            .request::<_, ()>(
                Method::GET,
                &format!("/admin/projects/{}/events/definitions", segment(&key)),
                &[
                    (
                        "start_time",
                        options.range.start_time.map(|v| v.to_string()),
                    ),
                    ("end_time", options.range.end_time.map(|v| v.to_string())),
                    (
                        "tz_offset_minutes",
                        options.range.tz_offset_minutes.map(|v| v.to_string()),
                    ),
                    ("limit", options.limit.map(|v| v.to_string())),
                    ("offset", options.offset.map(|v| v.to_string())),
                    ("search", options.search.clone()),
                    (
                        "include_archived",
                        options.include_archived.map(|v| v.to_string()),
                    ),
                ],
                None,
                true,
            )
            .await
    }

    /// 补充显示名与描述，或把停用的事件归档。
    ///
    /// 事件名不在可改字段里——它是客户端上报时使用的键。
    pub async fn update_event_definition(
        &self,
        definition_id: &str,
        input: &UpdateEventDefinitionInput,
    ) -> Result<EventDefinitionItem> {
        let key = self.inner.require_project_key()?;
        self.inner
            .request(
                Method::PATCH,
                &format!(
                    "/admin/projects/{}/events/definitions/{}",
                    segment(&key),
                    segment(definition_id)
                ),
                &[],
                Some(input),
                true,
            )
            .await
    }

    /// 删除事件定义本身；明细与统计保留，下一次上报会把定义重新建回来。
    /// 要停用某个事件请改用归档。
    pub async fn delete_event_definition(
        &self,
        definition_id: &str,
    ) -> Result<DeleteSuccessResponse> {
        let key = self.inner.require_project_key()?;
        self.inner
            .request::<_, ()>(
                Method::DELETE,
                &format!(
                    "/admin/projects/{}/events/definitions/{}",
                    segment(&key),
                    segment(definition_id)
                ),
                &[],
                None,
                true,
            )
            .await
    }

    /// 区间内的事件总量、独立标识数、活跃会话数与事件种类数。
    pub async fn get_event_overview(
        &self,
        options: &EventRangeOptions,
    ) -> Result<EventOverviewResponse> {
        let key = self.inner.require_project_key()?;
        self.inner
            .request::<_, ()>(
                Method::GET,
                &format!("/admin/projects/{}/events/stats/overview", segment(&key)),
                &range_query(options),
                None,
                true,
            )
            .await
    }

    /// 事件量趋势。
    ///
    /// `data` 是总量，永远返回；给了 `group_by` 时额外返回拆开的 `series`。
    pub async fn get_event_timeseries(
        &self,
        options: &EventTimeseriesOptions,
    ) -> Result<EventTimeseriesResponse> {
        let key = self.inner.require_project_key()?;
        let mut query = range_query(&options.range).to_vec();
        query.push(("granularity", options.granularity.clone()));
        query.push(("event_name", options.event_name.clone()));
        query.push(("group_by", options.group_by.clone()));
        query.push(("limit", options.limit.map(|v| v.to_string())));

        self.inner
            .request::<_, ()>(
                Method::GET,
                &format!("/admin/projects/{}/events/stats/timeseries", segment(&key)),
                &query,
                None,
                true,
            )
            .await
    }

    /// 事件分布。
    ///
    /// `total` 是全量而非本页之和。`dimension` 为 `property` 时必须给 `property_key`。
    pub async fn get_event_breakdown(
        &self,
        options: &EventBreakdownOptions,
    ) -> Result<EventBreakdownResponse> {
        let key = self.inner.require_project_key()?;
        let mut query = range_query(&options.range).to_vec();
        query.push(("dimension", options.dimension.clone()));
        query.push(("property_key", options.property_key.clone()));
        query.push(("event_name", options.event_name.clone()));
        query.push(("limit", options.limit.map(|v| v.to_string())));

        self.inner
            .request::<_, ()>(
                Method::GET,
                &format!("/admin/projects/{}/events/stats/breakdown", segment(&key)),
                &query,
                None,
                true,
            )
            .await
    }

    /// 星期 × 小时活跃热力图，固定 168 格。
    ///
    /// 折叠按每条上报来源国家的代表时区进行；`tz_offset_minutes` 是无法定位的
    /// 来源的回退值。
    pub async fn get_event_heatmap(
        &self,
        options: &EventRangeOptions,
        event_name: Option<&str>,
    ) -> Result<EventHeatmapResponse> {
        let key = self.inner.require_project_key()?;
        let mut query = range_query(options).to_vec();
        query.push(("event_name", event_name.map(str::to_string)));

        self.inner
            .request::<_, ()>(
                Method::GET,
                &format!("/admin/projects/{}/events/stats/heatmap", segment(&key)),
                &query,
                None,
                true,
            )
            .await
    }

    /// 漏斗转化。
    ///
    /// 每一步取「上一步之后、且仍在转化窗口内」的最早一条命中，窗口锚定在第一步。
    /// 只读接口，所需 scope 是 `events:read`。
    pub async fn get_funnel(&self, input: &FunnelInput) -> Result<FunnelResponse> {
        let key = self.inner.require_project_key()?;
        self.inner
            .request(
                Method::POST,
                &format!("/admin/projects/{}/events/analysis/funnel", segment(&key)),
                &[],
                Some(input),
                true,
            )
            .await
    }

    /// 留存矩阵。尚未走完的周期返回 `None` 而不是 0。
    pub async fn get_retention(&self, input: &RetentionInput) -> Result<RetentionResponse> {
        let key = self.inner.require_project_key()?;
        self.inner
            .request(
                Method::POST,
                &format!(
                    "/admin/projects/{}/events/analysis/retention",
                    segment(&key)
                ),
                &[],
                Some(input),
                true,
            )
            .await
    }

    /// 路径分析（桑基图边集）。默认按会话串联。
    pub async fn get_paths(&self, input: &PathsInput) -> Result<PathsResponse> {
        let key = self.inner.require_project_key()?;
        self.inner
            .request(
                Method::POST,
                &format!("/admin/projects/{}/events/analysis/paths", segment(&key)),
                &[],
                Some(input),
                true,
            )
            .await
    }

    /// 指标 DSL 求值。查询构建器与看板卡片共用这一个入口。
    ///
    /// `query` 的结构见 `verhub.openapi.yaml` 的 `EventQueryDto`；`formula` 支持
    /// `"A / B * 100"` 形式的跨事件运算。
    pub async fn run_event_query(&self, query: &JsonObject) -> Result<EventQueryResponse> {
        let key = self.inner.require_project_key()?;
        self.inner
            .request(
                Method::POST,
                &format!("/admin/projects/{}/events/analysis/query", segment(&key)),
                &[],
                Some(query),
                true,
            )
            .await
    }

    /// 该项目保存的分析卡片，按 `sort_order` 升序。
    pub async fn list_dashboard_cards(&self) -> Result<DashboardCardListResponse> {
        let key = self.inner.require_project_key()?;
        self.inner
            .request::<_, ()>(
                Method::GET,
                &format!("/admin/projects/{}/events/dashboards/cards", segment(&key)),
                &[],
                None,
                true,
            )
            .await
    }

    /// 保存一份指标 DSL 查询定义。只存定义不存结果——结果随时间范围变化。
    ///
    /// `query` 在写入时就完整校验（含公式语法），不合法直接 400。
    pub async fn create_dashboard_card(
        &self,
        input: &CreateDashboardCardInput,
    ) -> Result<DashboardCardItem> {
        let key = self.inner.require_project_key()?;
        self.inner
            .request(
                Method::POST,
                &format!("/admin/projects/{}/events/dashboards/cards", segment(&key)),
                &[],
                Some(input),
                true,
            )
            .await
    }

    /// 更新看板卡片。
    pub async fn update_dashboard_card(
        &self,
        card_id: &str,
        input: &UpdateDashboardCardInput,
    ) -> Result<DashboardCardItem> {
        let key = self.inner.require_project_key()?;
        self.inner
            .request(
                Method::PATCH,
                &format!(
                    "/admin/projects/{}/events/dashboards/cards/{}",
                    segment(&key),
                    segment(card_id)
                ),
                &[],
                Some(input),
                true,
            )
            .await
    }

    /// 删除看板卡片。
    pub async fn delete_dashboard_card(&self, card_id: &str) -> Result<DeleteSuccessResponse> {
        let key = self.inner.require_project_key()?;
        self.inner
            .request::<_, ()>(
                Method::DELETE,
                &format!(
                    "/admin/projects/{}/events/dashboards/cards/{}",
                    segment(&key),
                    segment(card_id)
                ),
                &[],
                None,
                true,
            )
            .await
    }

    /// 代最终用户删除其全部事件明细（GDPR Art.17）。小时汇总不在删除范围内。
    pub async fn delete_event_subject(
        &self,
        distinct_id: &str,
    ) -> Result<EventSubjectDeleteResponse> {
        let key = self.inner.require_project_key()?;
        self.inner
            .request::<_, ()>(
                Method::DELETE,
                &format!(
                    "/admin/projects/{}/events/subjects/{}",
                    segment(&key),
                    segment(distinct_id)
                ),
                &[],
                None,
                true,
            )
            .await
    }

    // ---- GitHub Webhook ----

    /// 查绑定项目的 webhook 配置。secret 不回显，只给末 6 位提示。
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
                &format!(
                    "/admin/projects/{}/github-webhook/regenerate",
                    segment(&key)
                ),
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

    // ---- GitHub App ----

    /// 查实例级 GitHub App 配置。仅管理员 JWT 可访问，API key 会得到 401。
    pub async fn get_github_app_config(&self) -> Result<GithubAppConfig> {
        self.inner
            .request::<_, ()>(Method::GET, "/admin/github-app", &[], None, true)
            .await
    }

    /// 部分更新实例级 GitHub App 配置。`private_key` / `webhook_secret` 传空串表示清除。
    pub async fn update_github_app_config(
        &self,
        input: &UpdateGithubAppConfigInput,
    ) -> Result<GithubAppConfig> {
        self.inner
            .request(Method::PUT, "/admin/github-app", &[], Some(input), true)
            .await
    }

    /// 清空实例级 GitHub App 配置。所有项目的 GitHub App 功能随即失效。
    pub async fn clear_github_app_config(&self) -> Result<GithubAppConfig> {
        self.inner
            .request::<_, ()>(Method::DELETE, "/admin/github-app", &[], None, true)
            .await
    }

    /// 查绑定项目的 GitHub 集成配置。
    pub async fn get_github_integration(&self) -> Result<ProjectGithubIntegration> {
        let key = self.inner.require_project_key()?;
        self.inner
            .request::<_, ()>(
                Method::GET,
                &format!("/admin/projects/{}/github-integration", segment(&key)),
                &[],
                None,
                true,
            )
            .await
    }

    /// 部分更新绑定项目的 GitHub 集成配置。打开功能开关要求实例级已启用对应功能。
    pub async fn update_github_integration(
        &self,
        input: &UpdateProjectGithubIntegrationInput,
    ) -> Result<ProjectGithubIntegration> {
        let key = self.inner.require_project_key()?;
        self.inner
            .request(
                Method::PUT,
                &format!("/admin/projects/{}/github-integration", segment(&key)),
                &[],
                Some(input),
                true,
            )
            .await
    }

    /// 预览目标仓库里的反馈 Issue 模板（模板来源为 `repo` 时使用）。
    ///
    /// `refresh` 为 true 时先作废服务端缓存再重新拉取。拉取失败不会返回 Err，
    /// 原因放在返回值的 `error` 字段里。
    pub async fn get_github_integration_repo_template(
        &self,
        refresh: bool,
    ) -> Result<FeedbackIssueRepoTemplatePreview> {
        let key = self.inner.require_project_key()?;
        self.inner
            .request::<_, ()>(
                Method::GET,
                &format!(
                    "/admin/projects/{}/github-integration/repo-template",
                    segment(&key)
                ),
                &[("refresh", refresh.then(|| "true".to_string()))],
                None,
                true,
            )
            .await
    }

    // ---- 条款文档 ----

    /// 列出全部条款文档的设置视图（含生效正文、自定义草稿与内置原文）。
    ///
    /// 条款接口只接受管理员 JWT，API Key 会得到 401。不作用于绑定项目。
    pub async fn list_terms_documents(&self) -> Result<TermsDocumentConfigListResponse> {
        self.inner
            .request::<_, ()>(Method::GET, "/admin/terms/documents", &[], None, true)
            .await
    }

    /// 查单份条款文档的设置视图。
    pub async fn get_terms_document(
        &self,
        slug: TermsDocumentSlug,
    ) -> Result<TermsDocumentConfigView> {
        self.inner
            .request::<_, ()>(
                Method::GET,
                &format!("/admin/terms/documents/{}", segment(slug.as_str())),
                &[],
                None,
                true,
            )
            .await
    }

    /// 部分更新条款文档，只修改传入的字段。
    ///
    /// `custom` 关闭时 `content` 仍会保存为草稿，重新打开即可继续编辑；
    /// `content` 传空串表示清除草稿。
    pub async fn update_terms_document(
        &self,
        slug: TermsDocumentSlug,
        input: &UpdateTermsDocumentInput,
    ) -> Result<TermsDocumentConfigView> {
        self.inner
            .request(
                Method::PUT,
                &format!("/admin/terms/documents/{}", segment(slug.as_str())),
                &[],
                Some(input),
                true,
            )
            .await
    }

    /// 恢复内置条款正文：关闭自定义开关并丢弃草稿，前台随即回到内置正文。
    pub async fn reset_terms_document(
        &self,
        slug: TermsDocumentSlug,
    ) -> Result<TermsDocumentConfigView> {
        self.inner
            .request::<_, ()>(
                Method::DELETE,
                &format!("/admin/terms/documents/{}", segment(slug.as_str())),
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

/// 区间参数出现在每个统计方法上，抽出来免得逐个手写。
fn range_query(options: &EventRangeOptions) -> [(&'static str, Option<String>); 3] {
    [
        ("start_time", options.start_time.map(|v| v.to_string())),
        ("end_time", options.end_time.map(|v| v.to_string())),
        (
            "tz_offset_minutes",
            options.tz_offset_minutes.map(|v| v.to_string()),
        ),
    ]
}
