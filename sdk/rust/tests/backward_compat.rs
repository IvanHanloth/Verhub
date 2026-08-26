//! 跨版本兼容性回归测试。
//!
//! 四个 SDK 里 Rust 的反序列化最严格：serde 遇到结构体上没有的字段会忽略（本 crate
//! 没开 `deny_unknown_fields`），但**缺少**的字段会直接报错，除非该字段标了
//! `#[serde(default)]`。所以两个方向都得钉住：
//!
//! - 旧 SDK + 新服务端：老结构体不认识 `locale` / `translations`，必须照样能解析；
//! - 新 SDK + 旧服务端：响应里没有 `locale` / `translations`，必须回落成 None。
//!
//! 下面的 `legacy` 结构体是 v0.2.8 引入多语言**之前**的形状，**不要**跟着
//! `src/models.rs` 一起改——它们的价值就在于停留在过去。

use serde::Deserialize;
use serde_json::json;
use verhub_sdk::models::{AnnouncementItem, VersionItem};

/// v0.2.8 之前的响应形状：完全没有多语言的概念。
///
/// 字段大多只为「能解析」而存在，测试不会逐个读，所以整块放行 dead_code。
#[allow(dead_code)]
mod legacy {
    use serde::Deserialize;
    use serde_json::{Map, Value};

    pub type JsonObject = Map<String, Value>;

    #[derive(Debug, Clone, Deserialize)]
    pub struct VersionDownloadLink {
        pub url: String,
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
        pub platform: Option<String>,
        #[serde(default)]
        pub platforms: Vec<String>,
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
        pub platforms: Vec<String>,
        pub author: Option<String>,
        pub published_at: i64,
        pub created_at: i64,
        pub updated_at: i64,
    }
}

/// 今天的服务端对 `/public/{key}/versions/latest?locale=en` 的真实响应。
fn current_version_response() -> serde_json::Value {
    json!({
        "id": "ver-1",
        "version": "2.0.0",
        "comparable_version": "2.0.0",
        "title": "Stable release",
        "content": "Bug fixes",
        "locale": "en",
        "download_url": null,
        "download_links": [],
        "forced": false,
        "is_latest": true,
        "is_preview": false,
        "is_milestone": false,
        "is_deprecated": false,
        "platforms": [],
        "platform": null,
        "custom_data": null,
        "published_at": 1787732657,
        "created_at": 1787732657
    })
}

/// 今天的服务端对 `/public/{key}/announcements/latest?locale=en` 的真实响应。
fn current_announcement_response() -> serde_json::Value {
    json!({
        "id": "ann-1",
        "title": "Maintenance",
        "content": "Down on Saturday",
        "is_pinned": false,
        "is_hidden": false,
        "platforms": [],
        "author": null,
        "min_comparable_version": null,
        "max_comparable_version": null,
        "locale": "en",
        "published_at": 1787732657,
        "created_at": 1787732657,
        "updated_at": 1787732657
    })
}

#[test]
fn legacy_sdk_parses_current_version_response() {
    let parsed: legacy::VersionItem = serde_json::from_value(current_version_response())
        .expect("多语言之前的 VersionItem 必须能解析今天的响应");

    // 老客户端拿到的是服务端按 locale 挑好的那一份，字段位置没变。
    assert_eq!(parsed.title.as_deref(), Some("Stable release"));
    assert_eq!(parsed.content.as_deref(), Some("Bug fixes"));
    assert_eq!(parsed.version, "2.0.0");
    assert!(parsed.is_latest);
}

#[test]
fn legacy_sdk_parses_current_announcement_response() {
    let parsed: legacy::AnnouncementItem = serde_json::from_value(current_announcement_response())
        .expect("多语言之前的 AnnouncementItem 必须能解析今天的响应");

    assert_eq!(parsed.title, "Maintenance");
    assert_eq!(parsed.content, "Down on Saturday");
    assert!(!parsed.is_pinned);
}

#[test]
fn legacy_sdk_parses_current_check_update_response() {
    // 更新检查把版本对象嵌在三个位置，任一处解析失败整个响应就废了。
    #[derive(Debug, Deserialize)]
    struct LegacyCheckUpdate {
        should_update: bool,
        latest_version: legacy::VersionItem,
        latest_preview_version: Option<legacy::VersionItem>,
        target_version: Option<legacy::VersionItem>,
    }

    let payload = json!({
        "should_update": true,
        "required": false,
        "reason_codes": ["newer_version_available"],
        "current_version": "1.0.0",
        "current_comparable_version": "1.0.0",
        "latest_version": current_version_response(),
        "latest_preview_version": null,
        "target_version": current_version_response(),
        "milestone": { "current": false, "latest": false, "target_is_milestone": false }
    });

    let parsed: LegacyCheckUpdate =
        serde_json::from_value(payload).expect("多语言之前的更新检查响应必须能解析");

    assert!(parsed.should_update);
    assert_eq!(
        parsed.latest_version.title.as_deref(),
        Some("Stable release")
    );
    assert!(parsed.latest_preview_version.is_none());
    assert_eq!(
        parsed.target_version.map(|v| v.version),
        Some("2.0.0".to_string())
    );
}

#[test]
fn current_sdk_parses_legacy_version_response() {
    // 旧服务端没有 locale / translations 这两个键。
    let mut payload = current_version_response();
    let object = payload.as_object_mut().unwrap();
    object.remove("locale");
    object.remove("translations");

    let parsed: VersionItem =
        serde_json::from_value(payload).expect("缺少 locale 的旧响应必须能解析成 None");

    assert_eq!(parsed.locale, None);
    assert!(parsed.translations.is_none());
    assert_eq!(parsed.title.as_deref(), Some("Stable release"));
}

#[test]
fn current_sdk_parses_legacy_announcement_response() {
    let mut payload = current_announcement_response();
    let object = payload.as_object_mut().unwrap();
    object.remove("locale");
    object.remove("translations");

    let parsed: AnnouncementItem =
        serde_json::from_value(payload).expect("缺少 locale 的旧响应必须能解析成 None");

    assert_eq!(parsed.locale, None);
    assert!(parsed.translations.is_none());
    assert_eq!(parsed.title, "Maintenance");
}

#[test]
fn current_sdk_reads_version_translations_from_admin_response() {
    // 管理接口会额外带上全部译文；公开接口不带，两种都要认。
    let mut payload = current_version_response();
    payload.as_object_mut().unwrap().insert(
        "translations".to_string(),
        json!([{ "locale": "en", "title": "Stable release", "content": "Bug fixes" }]),
    );

    let parsed: VersionItem = serde_json::from_value(payload).expect("管理端响应必须能解析");
    let translations = parsed.translations.expect("译文数组应当存在");

    assert_eq!(translations.len(), 1);
    assert_eq!(translations[0].locale, "en");
    assert_eq!(translations[0].title.as_deref(), Some("Stable release"));
}
