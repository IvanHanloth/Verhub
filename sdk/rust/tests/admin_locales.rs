//! 项目语言管理接口实际发出的请求：方法、路径编码与请求体。
//!
//! 起一个只应答一次的本地 TCP 服务，把收到的原始请求交回测试断言，不碰外网。

use std::io::{Read, Write};
use std::net::TcpListener;
use std::sync::mpsc;
use std::thread;

use verhub_sdk::models::UpdateProjectLocaleInput;
use verhub_sdk::VerhubClient;

const HEADER_END: &str = "\r\n\r\n";

/// 应答一次固定 JSON，返回服务地址与收到的原始请求。
fn serve_once(body: &'static str) -> (String, mpsc::Receiver<String>) {
    let listener = TcpListener::bind("127.0.0.1:0").expect("绑定本地端口");
    let address = format!("http://{}/api/v1", listener.local_addr().unwrap());
    let (sender, receiver) = mpsc::channel();

    thread::spawn(move || {
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
        let response = format!(
            "HTTP/1.1 200 OK\r\ncontent-type: application/json\r\ncontent-length: {}\r\nconnection: close{HEADER_END}{}",
            body.len(),
            body
        );
        stream.write_all(response.as_bytes()).expect("写回响应");
        sender
            .send(String::from_utf8_lossy(&raw).to_string())
            .unwrap();
    });

    (address, receiver)
}

#[tokio::test]
async fn update_project_locale_patches_encoded_path() {
    let (base_url, received) =
        serve_once(r#"{"locale":"en-US","aliases":["en"],"label":null,"created_at":1}"#);
    let client = VerhubClient::builder(base_url)
        .project_key("demo")
        .token("tok")
        .without_platform()
        .without_analytics()
        .retries(0)
        .build()
        .expect("构造客户端");

    let item = client
        .admin()
        .update_project_locale(
            "en (US)",
            &UpdateProjectLocaleInput {
                locale: Some("en-US".to_string()),
                aliases: None,
                label: Some(None),
            },
        )
        .await
        .expect("请求成功");
    assert_eq!(item.locale, "en-US");
    assert_eq!(item.aliases, vec!["en".to_string()]);

    let raw = received.recv().unwrap();
    let request_line = raw.lines().next().unwrap();
    assert_eq!(
        request_line,
        "PATCH /api/v1/admin/projects/demo/locales/en%20%28US%29 HTTP/1.1"
    );
    let body = raw.split(HEADER_END).nth(1).unwrap();
    let body: serde_json::Value = serde_json::from_str(body).expect("请求体是 JSON");
    // aliases 为 None 不提交；label 为 Some(None) 提交 null 以清空。
    assert_eq!(
        body,
        serde_json::json!({ "locale": "en-US", "label": null })
    );
}
