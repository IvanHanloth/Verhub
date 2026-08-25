use serde_json::Value;

/// SDK 统一结果类型。
pub type Result<T> = std::result::Result<T, Error>;

/// SDK 错误。
#[derive(Debug, thiserror::Error)]
pub enum Error {
    /// 服务端返回了非 2xx 响应。
    #[error("[{status}] {message}")]
    Api {
        /// HTTP 状态码。
        status: u16,
        /// 错误信息，优先取响应体的 message 字段。
        message: String,
        /// 已解析的响应体；不是 JSON 时为 `None`。
        body: Option<Value>,
    },

    /// 请求没能到达服务端，或响应读取失败。
    #[error("请求未能完成：{0}")]
    Connection(#[from] reqwest::Error),

    /// 响应体不是预期的结构。
    #[error("响应解析失败：{0}")]
    Decode(#[source] serde_json::Error),

    /// 请求体无法序列化成 JSON。
    #[error("请求体序列化失败：{0}")]
    Encode(#[source] serde_json::Error),

    /// 调用方给的 base_url 不是合法 URL。
    #[error("base_url 不合法：{0}")]
    InvalidBaseUrl(String),

    /// User-Agent 含无法进入请求头的字符。
    #[error("User-Agent 不合法：{0}")]
    InvalidUserAgent(String),

    /// 调用需要凭据的接口但没有设置 token。
    #[error("缺少凭据：请先设置 token")]
    MissingToken,

    /// 调用项目作用域的方法但客户端没有绑定 project_key。
    #[error("未设置 project_key：请在创建客户端时传入，或调用 set_project_key()")]
    MissingProjectKey,

    /// 选了把反馈转成 GitHub Issue，却没填联系方式。请求未发出。
    #[error("转发到 GitHub Issue 需要联系方式：请先填写 contact")]
    MissingContact,

    /// 行使数据主体权利但拿不到匿名标识：采集未启用、已退出，或用的是
    /// [`crate::AnalyticsPersistence::None`]。可在调用时显式传入标识。
    #[error("没有可用的匿名标识：事件采集未启用或已退出。可显式传入 distinct_id")]
    MissingDistinctId,
}

impl Error {
    /// 若为 [`Error::Api`] 则返回其 HTTP 状态码，否则返回 `None`。
    pub fn status(&self) -> Option<u16> {
        match self {
            Error::Api { status, .. } => Some(*status),
            _ => None,
        }
    }
}
