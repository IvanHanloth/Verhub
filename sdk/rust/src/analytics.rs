//! 事件采集的本地状态：匿名标识、退出标记与待发送队列。
//!
//! 这是整个 SDK 里唯一会在设备上写入数据的部分；改动这里要同步更新
//! 《SDK 合规性文档》。
//!
//! 与其余三个语言的 SDK 的唯一差异是定时发送：Rust 版不自己起后台任务，改成在
//! `track` 时顺带检查「距上次发送是否已超过 flush_interval」。攒着的最后一批靠
//! [`crate::PublicApi::flush`] 发出去。这条差异同样记在合规文档的
//! 「各语言版本的差异」一节里。

use std::collections::HashMap;
use std::hash::{BuildHasher, Hasher, RandomState};
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

/// 攒批的时间上限。
pub const DEFAULT_FLUSH_INTERVAL: Duration = Duration::from_secs(5);

/// 攒够这么多条立即发送。
pub const DEFAULT_BATCH_SIZE: usize = 20;

/// 队列上限，超出丢最旧的。
pub const DEFAULT_MAX_QUEUE_SIZE: usize = 500;

/// 会话空闲多久换新。
pub const DEFAULT_SESSION_TIMEOUT: Duration = Duration::from_secs(30 * 60);

/// 服务端单批上限，与 `VERHUB_EVENT_BATCH_MAX` 的默认值一致。
const SERVER_BATCH_MAX: usize = 50;

/// 重试退避的上限，避免服务端长时间不可用时把间隔拖到几小时。
const MAX_BACKOFF: Duration = Duration::from_secs(60);

/// 匿名标识的持久化程度。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum AnalyticsPersistence {
    /// 写入本地，重启后仍是同一个标识，可算跨天留存。
    #[default]
    Device,
    /// 只在进程内存里，重启即换新，无法算跨天留存。
    Session,
    /// 不生成持久标识，也不落盘。
    None,
}

/// 事件采集配置。
#[derive(Debug, Clone)]
pub struct AnalyticsOptions {
    /// 关掉后 `track` 直接返回，不生成标识、不落盘、不发请求。
    pub enabled: bool,
    /// 开启后，在 `grant_consent` 被调用前不采集、不写盘（含匿名标识的生成），
    /// 事件直接丢弃。面向欧盟用户的接入方应当开启。
    pub require_consent: bool,
    pub persistence: AnalyticsPersistence,
    pub flush_interval: Duration,
    pub batch_size: usize,
    pub max_queue_size: usize,
    pub session_timeout: Duration,
    /// 自定义状态文件位置；省略则用各平台的常规用户状态目录。
    pub state_path: Option<PathBuf>,
    /// 覆盖本地状态的命名空间。默认由 `base_url` 的 origin 与 `project_key` 算出。
    ///
    /// 同一实例同一项目下的两个应用要各自独立的匿名标识时显式指定。
    pub namespace: Option<String>,
}

impl Default for AnalyticsOptions {
    fn default() -> Self {
        Self {
            enabled: true,
            require_consent: false,
            persistence: AnalyticsPersistence::default(),
            flush_interval: DEFAULT_FLUSH_INTERVAL,
            batch_size: DEFAULT_BATCH_SIZE,
            max_queue_size: DEFAULT_MAX_QUEUE_SIZE,
            session_timeout: DEFAULT_SESSION_TIMEOUT,
            state_path: None,
            namespace: None,
        }
    }
}

/// 队列里的一条事件。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QueuedEvent {
    /// 客户端生成的幂等键，服务端据此去重。
    pub event_id: String,
    pub name: String,
    pub occurred_at: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub properties: Option<Map<String, Value>>,
}

/// 一次上报的载荷。
#[derive(Debug, Clone, Serialize)]
pub struct EventBatch {
    pub distinct_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub session_id: Option<String>,
    pub events: Vec<QueuedEvent>,
}

/// 随机 UUIDv4。不读取任何设备特征。
///
/// 自己拼而不引 `uuid` / `getrandom`：`RandomState` 每次构造都由操作系统播种，
/// 两次取样即得 128 位，足够区分不同使用者。不承担安全职责。
pub fn random_id() -> String {
    let hi = random_u64();
    let lo = random_u64();
    let mut bytes = [0u8; 16];
    bytes[..8].copy_from_slice(&hi.to_be_bytes());
    bytes[8..].copy_from_slice(&lo.to_be_bytes());

    // 打上 v4 与 RFC 4122 变体标记，让它是一个格式合法的 UUID。
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;

    let hex: String = bytes.iter().map(|b| format!("{b:02x}")).collect();
    format!(
        "{}-{}-{}-{}-{}",
        &hex[0..8],
        &hex[8..12],
        &hex[12..16],
        &hex[16..20],
        &hex[20..32]
    )
}

fn random_u64() -> u64 {
    let mut hasher = RandomState::new().build_hasher();
    hasher.write_u128(
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or_default(),
    );
    hasher.finish()
}

fn now_seconds() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or_default()
}

/// 取 base_url 的 origin（协议 + 主机 + 端口），路径一律忽略。
///
/// 主机名与协议转小写，剥掉 userinfo，`http` 的 80 与 `https` 的 443 会被省略。
/// 不含 `://` 的输入原样转小写返回。四个语言的 SDK 规则相同。
pub fn origin_of(base_url: &str) -> String {
    let trimmed = base_url.trim();
    let Some(scheme_end) = trimmed.find("://") else {
        return trimmed.to_lowercase();
    };

    let scheme = trimmed[..scheme_end].to_lowercase();
    let rest = &trimmed[scheme_end + 3..];
    let authority = match rest.find('/') {
        Some(slash) => &rest[..slash],
        None => rest,
    };
    let mut authority = authority.to_lowercase();

    if let Some(at) = authority.rfind('@') {
        authority = authority[at + 1..].to_string();
    }

    // IPv6 的冒号在方括号里，端口只可能在 `]` 之后。
    let host_end = authority.rfind(']').map(|i| i + 1).unwrap_or(0);
    if let Some(offset) = authority[host_end..].find(':') {
        let colon = host_end + offset;
        let port = &authority[colon + 1..];
        if (scheme == "http" && port == "80") || (scheme == "https" && port == "443") {
            authority.truncate(colon);
        }
    }

    format!("{scheme}://{authority}")
}

/// FNV-1a 32 位，按 UTF-8 字节计算，输出 8 位小写 hex。
///
/// 四个语言的 SDK 对同一输入给出同一结果。
pub fn fnv1a32_hex(value: &str) -> String {
    let mut hash: u32 = 0x811c_9dc5;
    for byte in value.as_bytes() {
        hash ^= u32::from(*byte);
        hash = hash.wrapping_mul(0x0100_0193);
    }
    format!("{hash:08x}")
}

/// 本地状态的命名空间：`<origin 哈希>-<小写 project_key>`。
///
/// `project_key` 去首尾空白后转小写；为空或只有空白时用 `default`。
/// 四个语言的 SDK 对同一组入参给出同一结果。
pub fn analytics_namespace(base_url: &str, project_key: Option<&str>) -> String {
    let key = project_key.unwrap_or("default").trim().to_lowercase();
    let key = if key.is_empty() {
        "default".to_string()
    } else {
        key
    };
    format!("{}-{}", fnv1a32_hex(&origin_of(base_url)), key)
}

/// 把命名空间洗成安全的文件名：非 `[A-Za-z0-9._-]` 换成下划线，截到 96 字符。
fn file_safe(namespace: &str) -> String {
    namespace
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-') {
                c
            } else {
                '_'
            }
        })
        .take(96)
        .collect()
}

/// 各平台的常规用户状态目录，每个命名空间一个文件。
fn default_state_path(namespace: &str) -> PathBuf {
    let base = if cfg!(windows) {
        std::env::var_os("LOCALAPPDATA")
            .map(PathBuf::from)
            .or_else(|| home_dir().map(|h| h.join("AppData").join("Local")))
    } else if cfg!(target_os = "macos") {
        home_dir().map(|h| h.join("Library").join("Application Support"))
    } else {
        std::env::var_os("XDG_STATE_HOME")
            .map(PathBuf::from)
            .or_else(|| home_dir().map(|h| h.join(".local").join("state")))
    };

    base.unwrap_or_else(std::env::temp_dir)
        .join("verhub-sdk")
        .join(format!("{}.json", file_safe(namespace)))
}

fn home_dir() -> Option<PathBuf> {
    std::env::var_os("HOME")
        .or_else(|| std::env::var_os("USERPROFILE"))
        .map(PathBuf::from)
}

/// 本地状态的读写。目录不可写时退化成不持久化。
#[derive(Debug)]
enum Storage {
    File(PathBuf),
    Memory(Mutex<HashMap<String, String>>),
    Null,
}

impl Storage {
    fn read(&self, key: &str) -> Option<String> {
        match self {
            Storage::File(path) => Self::read_file(path).get(key).cloned(),
            Storage::Memory(map) => map.lock().ok()?.get(key).cloned(),
            Storage::Null => None,
        }
    }

    fn write(&self, key: &str, value: &str) {
        match self {
            Storage::File(path) => {
                let mut data = Self::read_file(path);
                data.insert(key.to_string(), value.to_string());
                Self::write_file(path, &data);
            }
            Storage::Memory(map) => {
                if let Ok(mut guard) = map.lock() {
                    guard.insert(key.to_string(), value.to_string());
                }
            }
            Storage::Null => {}
        }
    }

    fn remove(&self, key: &str) {
        match self {
            Storage::File(path) => {
                let mut data = Self::read_file(path);
                data.remove(key);
                Self::write_file(path, &data);
            }
            Storage::Memory(map) => {
                if let Ok(mut guard) = map.lock() {
                    guard.remove(key);
                }
            }
            Storage::Null => {}
        }
    }

    fn read_file(path: &PathBuf) -> HashMap<String, String> {
        std::fs::read_to_string(path)
            .ok()
            .and_then(|raw| serde_json::from_str(&raw).ok())
            .unwrap_or_default()
    }

    fn write_file(path: &PathBuf, data: &HashMap<String, String>) {
        if let Some(parent) = path.parent() {
            if std::fs::create_dir_all(parent).is_err() {
                log::debug!("verhub: 事件采集状态目录不可写，本次不持久化");
                return;
            }
        }
        let Ok(raw) = serde_json::to_string(data) else {
            log::debug!("verhub: 事件采集状态序列化失败");
            return;
        };

        // 先写临时文件再 rename，写入过程中崩溃不会留下半个 JSON。
        let tmp = path.with_extension(format!("{}.tmp", std::process::id()));
        if std::fs::write(&tmp, raw).is_err() {
            log::debug!("verhub: 事件采集状态写入失败，本次不持久化");
            let _ = std::fs::remove_file(&tmp);
            return;
        }
        if std::fs::rename(&tmp, path).is_err() {
            log::debug!("verhub: 事件采集状态替换失败，本次不持久化");
            let _ = std::fs::remove_file(&tmp);
        }
    }
}

#[derive(Debug)]
struct QueueState {
    queue: Vec<QueuedEvent>,
    distinct_id: Option<String>,
    session_id: Option<String>,
    last_event_at: Option<Instant>,
    last_flush_at: Option<Instant>,
    failures: u32,
    opted_out: bool,
    consented: bool,
}

/// 事件队列：攒批入队，满一批或距上次发送超过 `flush_interval` 时要求发送。
///
/// 每条事件带 `event_id` 幂等键，重发不会在服务端产生重复。队列本身不发请求，
/// 取批与提交由 [`crate::PublicApi`] 驱动。
#[derive(Debug)]
pub struct EventQueue {
    options: AnalyticsOptions,
    storage: Storage,
    prefix: String,
    /// 本地状态的命名空间。调用方据此判断绑定项目变化后要不要重建队列。
    namespace: String,
    state: Mutex<QueueState>,
}

impl EventQueue {
    pub(crate) fn new(namespace: &str, mut options: AnalyticsOptions) -> Self {
        options.batch_size = options.batch_size.clamp(1, SERVER_BATCH_MAX);

        // 显式的 namespace 选项优先于调用方算出来的那个。
        let resolved = options
            .namespace
            .clone()
            .unwrap_or_else(|| namespace.to_string());

        let storage = match options.persistence {
            AnalyticsPersistence::Device => Storage::File(
                options
                    .state_path
                    .clone()
                    .unwrap_or_else(|| default_state_path(&resolved)),
            ),
            AnalyticsPersistence::Session => Storage::Memory(Mutex::new(HashMap::new())),
            AnalyticsPersistence::None => Storage::Null,
        };

        let prefix = format!("verhub.analytics.{resolved}.");

        let opted_out = storage.read(&format!("{prefix}opt_out")).as_deref() == Some("1");
        let consented = !options.require_consent;

        let mut queue = Vec::new();
        if options.enabled && !opted_out && consented {
            if let Some(raw) = storage.read(&format!("{prefix}queue")) {
                match serde_json::from_str::<Vec<QueuedEvent>>(&raw) {
                    Ok(mut restored) => {
                        if restored.len() > options.max_queue_size {
                            restored.drain(..restored.len() - options.max_queue_size);
                        }
                        queue = restored;
                    }
                    Err(_) => storage.remove(&format!("{prefix}queue")),
                }
            }
        }

        Self {
            options,
            storage,
            prefix,
            namespace: resolved,
            state: Mutex::new(QueueState {
                queue,
                distinct_id: None,
                session_id: None,
                last_event_at: None,
                // 以构造时刻起算，第一条事件不会立刻触发一次单条发送。
                last_flush_at: Some(Instant::now()),
                failures: 0,
                opted_out,
                consented,
            }),
        }
    }

    /// 当前是否会采集。为 false 时不生成标识、不落盘、不发请求。
    pub fn active(&self) -> bool {
        let state = match self.state.lock() {
            Ok(state) => state,
            Err(_) => return false,
        };
        self.options.enabled && !state.opted_out && state.consented
    }

    /// 当前是否处于退出状态。
    pub fn has_opted_out(&self) -> bool {
        self.state.lock().map(|s| s.opted_out).unwrap_or(false)
    }

    /// 停止采集、丢弃待发队列、删除本地匿名标识，并把退出标记写入本地。
    pub fn opt_out(&self) {
        if let Ok(mut state) = self.state.lock() {
            state.opted_out = true;
            state.consented = !self.options.require_consent;
            state.queue.clear();
            state.distinct_id = None;
            state.session_id = None;
        }
        self.storage.remove(&format!("{}distinct_id", self.prefix));
        self.storage.remove(&format!("{}queue", self.prefix));
        self.storage.write(&format!("{}opt_out", self.prefix), "1");
    }

    /// 撤销退出，并生成一个新的匿名标识。
    pub fn opt_in(&self) {
        if let Ok(mut state) = self.state.lock() {
            state.opted_out = false;
        }
        self.storage.remove(&format!("{}opt_out", self.prefix));
        self.reset_identity();
    }

    /// `require_consent` 模式下开闸。在此之前不会有任何字节写入设备。
    pub fn grant_consent(&self) {
        if let Ok(mut state) = self.state.lock() {
            state.consented = true;
        }
    }

    /// 撤回同意，等价于 [`EventQueue::opt_out`] 并回到未同意状态。
    pub fn revoke_consent(&self) {
        self.opt_out();
        if let Ok(mut state) = self.state.lock() {
            state.consented = false;
        }
    }

    /// 换一个新的匿名标识，切断与既往事件序列的关联。
    pub fn reset_identity(&self) {
        if let Ok(mut state) = self.state.lock() {
            state.distinct_id = None;
            state.session_id = None;
        }
        self.storage.remove(&format!("{}distinct_id", self.prefix));
    }

    /// 当前的匿名标识；未采集状态下返回 `None`，且不会顺带生成一个。
    pub fn current_distinct_id(&self) -> Option<String> {
        if !self.active() {
            return None;
        }
        Some(self.identity())
    }

    /// 入队一条事件，返回是否该立即发送（攒够一批，或距上次发送已超过间隔）。
    pub(crate) fn enqueue(&self, name: &str, properties: Option<Map<String, Value>>) -> bool {
        if !self.active() {
            return false;
        }

        let event = QueuedEvent {
            event_id: random_id(),
            name: name.to_string(),
            occurred_at: now_seconds(),
            properties,
        };

        let should_flush = {
            let mut state = match self.state.lock() {
                Ok(state) => state,
                Err(_) => return false,
            };

            state.queue.push(event);
            if state.queue.len() > self.options.max_queue_size {
                let excess = state.queue.len() - self.options.max_queue_size;
                state.queue.drain(..excess);
            }

            // 空闲超过 session_timeout 就换一个会话号。会话号从不落盘。
            let now = Instant::now();
            // map_or 而不是 is_none_or：后者要 Rust 1.82，本 crate 的 MSRV 是 1.75。
            let stale = state.last_event_at.map_or(true, |at| {
                now.duration_since(at) > self.options.session_timeout
            });
            if state.session_id.is_none() || stale {
                state.session_id = Some(random_id());
            }
            state.last_event_at = Some(now);

            let due = state.last_flush_at.map_or(true, |at| {
                now.duration_since(at) >= self.options.flush_interval
            });
            state.queue.len() >= self.options.batch_size || due
        };

        self.persist_queue();
        should_flush
    }

    /// 取出下一批待发送的载荷；没有可发的返回 `None`。
    pub(crate) fn take_batch(&self) -> Option<EventBatch> {
        let distinct_id = self.current_distinct_id()?;
        let state = self.state.lock().ok()?;
        if state.queue.is_empty() {
            return None;
        }

        let size = state.queue.len().min(self.options.batch_size);
        Some(EventBatch {
            distinct_id,
            session_id: state.session_id.clone(),
            events: state.queue[..size].to_vec(),
        })
    }

    /// 一批发送成功后从队列里摘掉。
    pub(crate) fn commit(&self, sent: usize) {
        if let Ok(mut state) = self.state.lock() {
            let sent = sent.min(state.queue.len());
            state.queue.drain(..sent);
            state.failures = 0;
            state.last_flush_at = Some(Instant::now());
        }
        self.persist_queue();
    }

    /// 记一次失败并返回下次重试前应等待的时长（指数退避，封顶 [`MAX_BACKOFF`]）。
    pub(crate) fn record_failure(&self) -> Duration {
        let failures = {
            let mut state = match self.state.lock() {
                Ok(state) => state,
                Err(_) => return self.options.flush_interval,
            };
            state.failures = state.failures.saturating_add(1);
            // 失败也算「试过了」，否则每次 track 都会立刻重试同一批。
            state.last_flush_at = Some(Instant::now());
            state.failures
        };
        self.options
            .flush_interval
            .saturating_mul(2u32.saturating_pow(failures.saturating_sub(1).min(16)))
            .min(MAX_BACKOFF)
    }

    /// 本地状态的命名空间。绑定项目变了就该按新命名空间重建队列。
    pub fn namespace(&self) -> &str {
        &self.namespace
    }

    /// 队列里还剩多少条。
    pub fn pending(&self) -> usize {
        self.state.lock().map(|s| s.queue.len()).unwrap_or(0)
    }

    /// 匿名标识。`persistence` 为 `None` 时每次返回一个不落盘的临时标识。
    fn identity(&self) -> String {
        if let Ok(state) = self.state.lock() {
            if let Some(id) = state.distinct_id.clone() {
                return id;
            }
        }

        let key = format!("{}distinct_id", self.prefix);
        if let Some(stored) = self.storage.read(&key) {
            if let Ok(mut state) = self.state.lock() {
                state.distinct_id = Some(stored.clone());
            }
            return stored;
        }

        let created = random_id();
        if let Ok(mut state) = self.state.lock() {
            state.distinct_id = Some(created.clone());
        }
        self.storage.write(&key, &created);
        created
    }

    fn persist_queue(&self) {
        if self.options.persistence != AnalyticsPersistence::Device {
            return;
        }
        let snapshot = match self.state.lock() {
            Ok(state) => serde_json::to_string(&state.queue).ok(),
            Err(_) => None,
        };
        if let Some(raw) = snapshot {
            self.storage.write(&format!("{}queue", self.prefix), &raw);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn memory_queue(options: AnalyticsOptions) -> EventQueue {
        let mut queue = EventQueue::new("test", options);
        // 测试一律用内存存储，不碰真实用户目录。
        queue.storage = Storage::Memory(Mutex::new(HashMap::new()));
        queue
    }

    fn session_options() -> AnalyticsOptions {
        AnalyticsOptions {
            persistence: AnalyticsPersistence::Session,
            ..Default::default()
        }
    }

    #[test]
    fn random_id_is_a_well_formed_uuid_v4() {
        let id = random_id();
        assert_eq!(id.len(), 36);
        assert_eq!(id.as_bytes()[14], b'4');
        assert!(matches!(id.as_bytes()[19], b'8' | b'9' | b'a' | b'b'));
        assert_ne!(random_id(), random_id());
    }

    #[test]
    fn full_batch_asks_for_a_flush() {
        let queue = memory_queue(AnalyticsOptions {
            batch_size: 2,
            flush_interval: Duration::from_secs(3600),
            ..session_options()
        });

        // 第一条：既没满也没到间隔，不该要求发送。
        assert!(!queue.enqueue("a", None));
        assert!(queue.enqueue("b", None));
    }

    #[test]
    fn every_event_carries_a_unique_idempotency_key() {
        let queue = memory_queue(session_options());
        queue.enqueue("a", None);
        queue.enqueue("b", None);

        let batch = queue.take_batch().expect("batch");
        assert_eq!(batch.events.len(), 2);
        assert_ne!(batch.events[0].event_id, batch.events[1].event_id);
    }

    #[test]
    fn a_batch_shares_one_distinct_and_session_id() {
        let queue = memory_queue(session_options());
        queue.enqueue("a", None);

        let batch = queue.take_batch().expect("batch");
        assert!(!batch.distinct_id.is_empty());
        assert!(batch.session_id.is_some());
    }

    #[test]
    fn a_failed_batch_stays_queued_with_the_same_ids() {
        let queue = memory_queue(session_options());
        queue.enqueue("a", None);

        let first = queue.take_batch().expect("batch");
        queue.record_failure();

        // 没有 commit，事件仍在队列里，幂等键不变。
        let retry = queue.take_batch().expect("batch");
        assert_eq!(first.events[0].event_id, retry.events[0].event_id);
    }

    #[test]
    fn commit_removes_only_what_was_sent() {
        let queue = memory_queue(AnalyticsOptions {
            batch_size: 1,
            ..session_options()
        });
        queue.enqueue("a", None);
        queue.enqueue("b", None);
        assert_eq!(queue.pending(), 2);

        queue.commit(1);
        assert_eq!(queue.pending(), 1);
        assert_eq!(queue.take_batch().expect("batch").events[0].name, "b");
    }

    #[test]
    fn opt_out_drops_the_queue_and_survives_a_restart() {
        let path = std::env::temp_dir().join(format!("verhub-test-{}.json", random_id()));
        let options = AnalyticsOptions {
            state_path: Some(path.clone()),
            ..Default::default()
        };

        let queue = EventQueue::new("test", options.clone());
        queue.enqueue("a", None);
        queue.opt_out();

        assert_eq!(queue.pending(), 0);
        assert!(queue.take_batch().is_none());
        assert!(queue.current_distinct_id().is_none());

        // 退出标记落了盘，重启后仍然生效。
        let restarted = EventQueue::new("test", options);
        assert!(restarted.has_opted_out());
        assert!(!restarted.active());

        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn opt_in_mints_a_new_identity_instead_of_reusing_the_old_one() {
        let queue = memory_queue(session_options());
        let before = queue.current_distinct_id().expect("id");

        queue.opt_out();
        queue.opt_in();

        let after = queue.current_distinct_id().expect("id");
        assert_ne!(before, after);
    }

    #[test]
    fn require_consent_collects_nothing_before_consent() {
        let queue = memory_queue(AnalyticsOptions {
            require_consent: true,
            ..session_options()
        });

        assert!(!queue.active());
        assert!(!queue.enqueue("a", None));
        assert_eq!(queue.pending(), 0);
        assert!(queue.current_distinct_id().is_none());

        queue.grant_consent();
        assert!(queue.active());
        queue.enqueue("b", None);
        assert_eq!(queue.pending(), 1);
    }

    #[test]
    fn disabled_queue_is_a_no_op() {
        let queue = memory_queue(AnalyticsOptions {
            enabled: false,
            ..session_options()
        });
        assert!(!queue.enqueue("a", None));
        assert_eq!(queue.pending(), 0);
    }

    #[test]
    fn oversized_queue_drops_the_oldest() {
        let queue = memory_queue(AnalyticsOptions {
            max_queue_size: 2,
            batch_size: 10,
            ..session_options()
        });
        queue.enqueue("a", None);
        queue.enqueue("b", None);
        queue.enqueue("c", None);

        let batch = queue.take_batch().expect("batch");
        let names: Vec<_> = batch.events.iter().map(|e| e.name.as_str()).collect();
        assert_eq!(names, ["b", "c"]);
    }

    #[test]
    fn restart_replays_what_was_never_sent() {
        let path = std::env::temp_dir().join(format!("verhub-test-{}.json", random_id()));
        let options = AnalyticsOptions {
            state_path: Some(path.clone()),
            ..Default::default()
        };

        let first = EventQueue::new("test", options.clone());
        first.enqueue("a", None);
        let queued = first.take_batch().expect("batch");

        let restarted = EventQueue::new("test", options);
        let replayed = restarted.take_batch().expect("batch");
        assert_eq!(replayed.events[0].event_id, queued.events[0].event_id);

        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn persistence_none_writes_nothing_locally() {
        let queue = EventQueue::new(
            "test",
            AnalyticsOptions {
                persistence: AnalyticsPersistence::None,
                ..Default::default()
            },
        );
        queue.enqueue("a", None);

        assert!(matches!(queue.storage, Storage::Null));
        assert!(queue.storage.read("anything").is_none());
    }

    #[test]
    fn backoff_grows_and_stays_capped() {
        let queue = memory_queue(AnalyticsOptions {
            flush_interval: Duration::from_secs(5),
            ..session_options()
        });

        assert_eq!(queue.record_failure(), Duration::from_secs(5));
        assert_eq!(queue.record_failure(), Duration::from_secs(10));
        assert_eq!(queue.record_failure(), Duration::from_secs(20));
        for _ in 0..20 {
            queue.record_failure();
        }
        assert_eq!(queue.record_failure(), MAX_BACKOFF);
    }
}

#[cfg(test)]
mod namespace_tests {
    use super::*;

    /// 这组固定向量在 TypeScript / Python / 纯 JS 版里逐字相同。
    const ORIGIN_CASES: &[(&str, &str)] = &[
        (
            "https://verhub.example.com/api/v1",
            "https://verhub.example.com",
        ),
        (
            "https://verhub.example.com/v2/api/v1",
            "https://verhub.example.com",
        ),
        ("https://verhub.example.com", "https://verhub.example.com"),
        (
            "HTTPS://Verhub.Example.COM/api/v1",
            "https://verhub.example.com",
        ),
        (
            "https://verhub.example.com:443/api/v1",
            "https://verhub.example.com",
        ),
        (
            "http://verhub.example.com:80/api/v1",
            "http://verhub.example.com",
        ),
        (
            "http://verhub.example.com:3080/api/v1",
            "http://verhub.example.com:3080",
        ),
        (
            "https://user:pass@verhub.example.com/api/v1",
            "https://verhub.example.com",
        ),
        ("http://[::1]:3080/api/v1", "http://[::1]:3080"),
        ("https://[::1]:443/api/v1", "https://[::1]"),
    ];

    #[test]
    fn origin_只取协议主机端口() {
        for (raw, expected) in ORIGIN_CASES {
            assert_eq!(&origin_of(raw), expected, "{raw}");
        }
    }

    #[test]
    fn fnv1a_与其余三个语言逐位一致() {
        assert_eq!(fnv1a32_hex(""), "811c9dc5");
        assert_eq!(fnv1a32_hex("a"), "e40c292c");
        assert_eq!(fnv1a32_hex("foobar"), "bf9cf968");
        assert_eq!(fnv1a32_hex("https://verhub.example.com"), "8e08b085");
        // 非 ASCII 按 UTF-8 字节算。
        assert_eq!(fnv1a32_hex("héllo"), "4aa48540");
    }

    #[test]
    fn 命名空间带实例哈希且project_key小写化() {
        let ns = analytics_namespace("https://verhub.example.com/api/v1", Some("Demo"));
        assert_eq!(ns, "8e08b085-demo");
        assert_eq!(
            analytics_namespace("https://verhub.example.com/v2/api/v1", Some("demo")),
            ns
        );
    }

    #[test]
    fn 同project_key的两个实例互不相同() {
        assert_ne!(
            analytics_namespace("https://a.example.com/api/v1", Some("demo")),
            analytics_namespace("https://b.example.com/api/v1", Some("demo"))
        );
    }

    #[test]
    fn 没绑定项目时回落到default() {
        // 空串与纯空白也回落到 default，四个语言的 SDK 一致。
        for key in [None, Some(""), Some("  ")] {
            assert!(
                analytics_namespace("https://a.example.com/api/v1", key).ends_with("-default"),
                "{key:?}"
            );
        }
    }

    #[test]
    fn 状态文件按命名空间分开() {
        let a = default_state_path("8e08b085-demo");
        let b = default_state_path("8e08b085-other");
        assert_eq!(a.file_name().unwrap(), "8e08b085-demo.json");
        assert_eq!(a.parent(), b.parent());
        assert_ne!(a, b);
    }

    #[test]
    fn 文件名清洗掉路径分隔符() {
        assert_eq!(file_safe("abc-a/b"), "abc-a_b");
        assert_eq!(file_safe(r"abc-a\b"), "abc-a_b");
        assert!(!file_safe("abc-../x").contains('/'));
    }
}
