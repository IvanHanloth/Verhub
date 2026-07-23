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

## 异步用法

需要在 asyncio / GUI 事件循环里调用时，用 `AsyncVerhubClient`。它的接口面与
`VerhubClient` 完全一致，只是 `public` / `admin` 上的方法都要 `await`：

```python
from verhub_sdk import AsyncVerhubClient

async def main():
    async with AsyncVerhubClient("https://verhub.example.com/api/v1", "verhub") as client:
        result = await client.public.check_update(current_version="1.1.0")
        if result["should_update"]:
            print(result["target_version"]["version"])
```

实现上是「线程壳套同步」：内部持有一个同步客户端，每次调用用
`asyncio.to_thread` 丢到线程池执行，从而不阻塞事件循环。适合客户端 App 这类
低并发场景（如「别卡住 PySide6 主线程」）；每个在途调用占一个线程池线程，因此
**不适合高并发服务端**——那种场景请另选原生 async HTTP 库。

## 重试与超时

- 默认对**连接失败和幂等请求（GET 等）自动重试 2 次**并指数退避；`check_update`
  这类 POST 不会被重放。用 `retries=` 调整，传 `0` 关闭：
  `VerhubClient(base_url, "verhub", retries=3)`。
- `timeout` 支持 `(connect, read)` 元组，分别指定连接与读取超时——更新检查常
  希望连接快速失败、读取宽松些：`VerhubClient(base_url, timeout=(3.0, 20.0))`。
- 传入自定义 `requests.Session` 时 `retries` 不再挂载，重试策略由该 Session 自负。

## 线程安全

同步 `VerhubClient` **非线程安全**：`set_token` / `set_project_key` 等是原地改可变
状态。GUI 里「主线程建、worker 线程调」时，建议**每个线程一个客户端**，或在构造时
配置好凭据后只读使用，不要在有在途请求时并发调用 setter。

## 可观测性

SDK 通过 `logging.getLogger("verhub_sdk")` 在 `DEBUG` 级打印每次请求的方法、URL
与状态码，默认不输出：

```python
import logging
logging.getLogger("verhub_sdk").setLevel(logging.DEBUG)
```

## 错误处理

```python
from verhub_sdk import VerhubApiError, VerhubAuthError, VerhubConnectionError

try:
    client.admin.list_projects()
except VerhubAuthError as exc:
    print("忘了设 token，请求没发出去", exc)  # 本地前置校验失败
except VerhubApiError as exc:
    print(exc.status, exc.message, exc.body)   # 服务端返回非 2xx
except VerhubConnectionError as exc:
    print(exc.cause)                            # 请求没到服务端
```

三者都继承自 `VerhubError`。`VerhubAuthError` 用于「调 admin 接口却没设凭据」这类
**本地前置校验失败**——请求根本没发出去，与服务端真正拒绝凭据的 `VerhubApiError`
（HTTP 401/403）区分开。

> **升级提示（破坏性变更）**：早期版本在缺 token 时抛的是伪造的 `VerhubApiError`
> （status 401）。现在改抛 `VerhubAuthError`。若你之前靠 `except VerhubApiError`
> 兜这种情况，请补上 `VerhubAuthError`。

## User-Agent

默认 UA 是 `verhub-sdk-python/<版本>`。想加上自家应用标识做服务端统计，用
`app_identifier`（保留 SDK 版本信息），不要用 `user_agent` 整体覆盖：

```python
VerhubClient(base_url, "verhub", app_identifier="MyApp/1.2")
# UA: verhub-sdk-python/x.y.z MyApp/1.2
```

## 其他

- 返回值是解析后的 `dict`；`verhub_sdk.models` 里有对应的 `TypedDict`，
  供编辑器补全和 mypy 使用，运行时不做校验也不做拷贝。
- 需要代理、自定义证书或重试策略时，传入自己的 `requests.Session`：
  `VerhubClient(base_url, session=my_session)`。
- 客户端可作为上下文管理器使用，退出时关闭连接池（异步版用 `async with`）。
