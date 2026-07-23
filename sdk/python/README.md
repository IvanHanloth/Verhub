# Verhub SDK (Python)

[Verhub](https://github.com/IvanHanloth/verhub) 版本与发布管理平台的官方 Python SDK。

接口面与 TypeScript / Rust / 纯 JS 版一一对应，只是方法名按 Python 习惯写成 snake_case。
完整的方法清单与跨语言对照见[《SDK 参考》](https://ivanhanloth.github.io/Verhub/reference/sdk)。

## 安装

```bash
pip install verhub-sdk
```

## 快速开始

```python
from verhub_sdk import VerhubClient

# 第二个参数是绑定的项目 key，之后项目作用域的方法都不用再传它
client = VerhubClient("https://verhub.example.com/api/v1", "verhub")

result = client.public.check_update(current_version="1.1.0")
if result["should_update"]:
    print(result["target_version"]["version"], result["target_version"]["content"])
```

`base_url` 要带上 `/api/v1` 前缀，也就是浏览器里能直接打开 `/health` 的那个地址。

## 两个命名空间

- `client.public` — 公开接口，不需要凭据，客户端 App 直接调用
- `client.admin` — 管理接口，需要管理员 JWT 或 API Key

```python
client = VerhubClient("https://verhub.example.com/api/v1", "verhub", token="vh_xxx")

client.admin.upsert_version(
    "v1.2.0",
    comparable_version="1.2.0",
    title="稳定版",
    content="修复若干问题。",
    is_latest=True,
)
```

凭据与绑定项目都可以事后更换：`client.set_token(token)` / `client.set_project_key(key)`。
没绑定项目就调项目作用域的方法会抛 `VerhubError`。

## 省略与置空

可选参数的默认值是 `UNSET` 而不是 `None`，这两者含义不同：

- 不传该参数 → 字段不出现在请求里 → 更新接口保持原值
- 显式传 `None` → 字段以 JSON `null` 提交 → 更新接口把该字段置空

```python
client.admin.update_version("ver-001", download_url=None)  # 清空下载地址
client.admin.update_version("ver-001", title="改个标题")     # 只动标题
```

## 平台与系统版本声明

SDK 默认按运行环境自动探测平台**与系统版本**（如 Windows `11`、`ubuntu 24.04`、
macOS `14.5.0`），通过 `x-verhub-platform` / `x-verhub-platform-version` 两个请求头
声明，供服务端做来源统计——这不影响任何接口的返回内容。

```python
# 覆盖探测结果
client = VerhubClient(base_url, "verhub", platform="linux", platform_version="ubuntu 24.04")

# 事后更新
client.set_platform("linux")
client.set_platform_version("ubuntu 24.04")

# 完全不声明平台（也就不再自动探测版本）
client = VerhubClient(base_url, "verhub", platform=None)
```

## 错误处理

```python
from verhub_sdk import VerhubApiError, VerhubConnectionError

try:
    client.public.get_latest_version()
except VerhubApiError as exc:
    print(exc.status, exc.message, exc.body)   # 服务端返回非 2xx
except VerhubConnectionError as exc:
    print(exc.cause)                            # 请求没到服务端
```

两者都继承自 `VerhubError`。

## 其他

- 返回值是解析后的 `dict`；`verhub_sdk.models` 里有对应的 `TypedDict`，
  供编辑器补全和 mypy 使用，运行时不做校验也不做拷贝。
- 需要代理、自定义证书或重试策略时，传入自己的 `requests.Session`：
  `VerhubClient(base_url, session=my_session)`。
- 客户端可作为上下文管理器使用，退出时关闭连接池。
