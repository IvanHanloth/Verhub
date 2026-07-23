//! 最小可运行示例：查一次更新。
//!
//! ```bash
//! VERHUB_BASE_URL=http://localhost:3080/api/v1 cargo run --example check_update -- verhub 1.1.0
//! ```

use std::env;

use verhub_sdk::models::CheckUpdateInput;
use verhub_sdk::VerhubClient;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let base_url =
        env::var("VERHUB_BASE_URL").unwrap_or_else(|_| "http://localhost:3080/api/v1".into());
    let mut args = env::args().skip(1);
    let project_key = args.next().unwrap_or_else(|| "verhub".into());
    let current = args.next().unwrap_or_else(|| "1.0.0".into());

    // 客户端绑定项目后，check_update 不再单独传 project_key。
    let client = VerhubClient::builder(base_url).project_key(project_key).build()?;
    println!("health: {:?}", client.health().await?);

    let result = client
        .public()
        .check_update(&CheckUpdateInput {
            current_version: Some(current),
            ..Default::default()
        })
        .await?;

    println!("should_update: {}", result.should_update);
    if let Some(target) = result.target_version {
        println!("target: {} — {:?}", target.version, target.title);
    }

    Ok(())
}
