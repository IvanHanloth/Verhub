//! 客户端本地时间头（`x-verhub-client-time`）实际发出的样子。
//!
//! 四个语言的 SDK 断言同一套形状，改一处务必同步其余三处：
//! sdk/python/tests/、sdk/typescript/tests/client-time.test.mjs、sdk/vanilla-js/。
//!
//! 起一个本地 TCP 服务按顺序应答给定状态码，把收到的原始请求交回测试断言，不碰外网。

use std::io::{Read, Write};
use std::net::TcpListener;
use std::sync::mpsc;
use std::thread;

use verhub_sdk::models::PageOptions;
use verhub_sdk::{EventBatch, VerhubClient, VerhubClientBuilder, CLIENT_TIME_HEADER};

const HEADER_END: &str = "\r\n\r\n";

/// 逐个连接按 `statuses` 的顺序应答，返回服务地址与收到的原始请求。
fn serve(statuses: Vec<u16>) -> (String, mpsc::Receiver<String>) {
    let listener = TcpListener::bind("127.0.0.1:0").expect("绑定本地端口");
    let address = format!("http://{}/api/v1", listener.local_addr().unwrap());
    let (sender, receiver) = mpsc::channel();

    thread::spawn(move || {
        for status in statuses {
            let (mut stream, _) = listener.accept().expect("接受连接");
            let mut raw = Vec::new();
            let mut buffer = [0u8; 4096];
            // 读到头部结束且请求体按 Content-Length 收齐为止。
            loop {
                let read = stream.read(&mut buffer).expect("读取请求");
                raw.extend_from_slice(&buffer[..read]);
                let text = String::from_utf8_lossy(&raw).to_string();
                let Some(split) = text.find(HEADER_END) else {
                    if read == 0 {
                        break;
                    }
                    continue;
                };
                let length = text[..split]
                    .lines()
                    .find_map(|line| {
                        let (name, value) = line.split_once(':')?;
                        if name.eq_ignore_ascii_case("content-length") {
                            value.trim().parse::<usize>().ok()
                        } else {
                            None
                        }
                    })
                    .unwrap_or(0);
                if read == 0 || raw.len() >= split + HEADER_END.len() + length {
                    break;
                }
            }
            // 一份响应体凑齐各测试接口的必填字段。
            let body = r#"{"status":"ok","timestamp":0,"accepted":0,"skipped":0,"suppressed":false,"data":[],"total":0}"#;
            let response = format!(
                "HTTP/1.1 {status} X\r\ncontent-type: application/json\r\ncontent-length: {}\r\nconnection: close{HEADER_END}{body}",
                body.len()
            );
            stream.write_all(response.as_bytes()).expect("写回响应");
            sender
                .send(String::from_utf8_lossy(&raw).to_string())
                .unwrap();
        }
    });

    (address, receiver)
}

fn builder(base_url: String) -> VerhubClientBuilder {
    VerhubClient::builder(base_url)
        .project_key("demo")
        .token("tok")
        .without_analytics()
}

/// 原始请求里某个头的值（头名大小写不敏感）。
fn header(raw: &str, name: &str) -> Option<String> {
    raw.split(HEADER_END).next()?.lines().find_map(|line| {
        let (key, value) = line.split_once(':')?;
        key.eq_ignore_ascii_case(name)
            .then(|| value.trim().to_string())
    })
}

/// 形如 `YYYY-MM-DDTHH:MM:SS.mmm±HH:MM`。
fn assert_shape(value: &str) {
    let pattern = b"dddd-dd-ddTdd:dd:dd.ddd?dd:dd";
    let ok = value.len() == pattern.len()
        && value.bytes().zip(pattern).all(|(b, &p)| match p {
            b'd' => b.is_ascii_digit(),
            b'?' => b == b'+' || b == b'-',
            _ => b == p,
        });
    assert!(ok, "形状不合规：{value:?}");
}

/// 进程当前时区的偏移，写成 `±HH:MM`。
fn local_offset() -> String {
    let seconds = chrono::Local::now().offset().local_minus_utc();
    let sign = if seconds < 0 { '-' } else { '+' };
    let minutes = seconds.abs() / 60;
    format!("{sign}{:02}:{:02}", minutes / 60, minutes % 60)
}

#[tokio::test]
async fn sent_by_default_on_public_admin_and_event_ingest() {
    let (base_url, received) = serve(vec![200, 200, 200]);
    let client = builder(base_url).retries(0).build().expect("构造客户端");

    let before = chrono::Utc::now() - chrono::Duration::milliseconds(1);
    client.health().await.expect("health");
    let after = chrono::Utc::now();
    client
        .admin()
        .list_projects(&PageOptions::default())
        .await
        .expect("admin");
    client
        .public()
        .ingest_events(&EventBatch {
            distinct_id: "d".into(),
            session_id: None,
            events: Vec::new(),
        })
        .await
        .expect("ingest");

    for index in 0..3 {
        let raw = received.recv().unwrap();
        let value = header(&raw, CLIENT_TIME_HEADER).expect("应带上本地时间头");
        assert_shape(&value);
        assert_eq!(&value[value.len() - 6..], local_offset());
        if index == 0 {
            let parsed = chrono::DateTime::parse_from_rfc3339(&value).unwrap();
            assert!(before <= parsed && parsed <= after, "{value}");
        }
    }
}

#[tokio::test]
async fn without_client_time_omits_the_header() {
    let (base_url, received) = serve(vec![200]);
    let client = builder(base_url)
        .without_client_time()
        .retries(0)
        .build()
        .expect("构造客户端");

    client.health().await.expect("health");
    let raw = received.recv().unwrap();
    assert_eq!(header(&raw, CLIENT_TIME_HEADER), None);
}

#[tokio::test]
async fn recomputed_for_each_retry() {
    let (base_url, received) = serve(vec![503, 200]);
    let client = builder(base_url).retries(1).build().expect("构造客户端");

    client.health().await.expect("重试后成功");
    let first = header(&received.recv().unwrap(), CLIENT_TIME_HEADER).unwrap();
    let second = header(&received.recv().unwrap(), CLIENT_TIME_HEADER).unwrap();
    let first = chrono::DateTime::parse_from_rfc3339(&first).unwrap();
    let second = chrono::DateTime::parse_from_rfc3339(&second).unwrap();
    // 两次之间隔着 300ms 退避。
    assert!(
        second - first >= chrono::Duration::milliseconds(250),
        "{first} -> {second}"
    );
}
