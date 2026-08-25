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

### 条款文档

隐私政策与 SDK 合规性文档是**实例级**的，不作用于绑定项目，因此不需要
`project_key` 也能读：

```python
for doc in client.public.list_terms()["data"]:
    print(doc["slug"], doc["title"], doc["updated_at"])

policy = client.public.get_terms("privacy-policy")
print(policy["content"])          # Markdown；实例未自定义时是内置正文
```

管理端可以改写正文，只接受管理员 JWT（API Key 会得到 401）：

```python
client.admin.update_terms_document("privacy-policy", custom=True, content="# 隐私政策\n...")
client.admin.reset_terms_document("privacy-policy")   # 关掉自定义并丢弃草稿
```

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

# 完全不声明平台（这是明确的退出声明，也就不再自动探测版本）
client = VerhubClient(base_url, "verhub", platform=None)
```

两项各管各的：显式给了就用给的，没给就自己探测——指定 `platform` 不影响版本探测。
只有 `platform=None` 会连带停掉版本探测（此时仍可单独给 `platform_version`）。

版本明细会在存入时清洗成能安全进 HTTP 头的形式：非可打印 ASCII 按空白处理、折叠
空白、按 32 字符截断，洗完为空则不发这个头。用错编码读出来的 `...[�汾 10.0...]`
这类串因此不会让 HTTP 客户端在编码请求头时抛异常，把整个请求带下水。

## 异步用法

在 asyncio 里跑就用 `AsyncVerhubClient`。它的接口面与 `VerhubClient` 完全一致，
只是 `public` / `admin` 上的方法都要 `await`：

```python
from verhub_sdk import AsyncVerhubClient

async def main():
    async with AsyncVerhubClient("https://verhub.example.com/api/v1", "verhub") as client:
        result = await client.public.check_update(current_version="1.1.0")
        if result["should_update"]:
            print(result["target_version"]["version"])
```

底层是原生 `httpx.AsyncClient`，**真正的非阻塞 I/O**——不再是早期版本的「线程壳套
同步」，在途请求不占线程，高并发场景也能用。两个客户端共用同一份接口实现，同步版
和异步版的行为、参数、异常完全对齐。

缺 `project_key`、转发反馈却没填联系方式这类**本地前置校验在调用当下就抛**，不等
到 `await`；把整个 `await client.public.xxx(...)` 表达式包进 `try` 即可两种时机都
兜住。

> 异步侧 `public` / `admin` 的静态类型是 `Any`：方法体两边共用一份，返回值标注按
> 同步视角写，标成 `Any` 是为了让 `await` 不被类型检查器判成「await 了一个 dict」。
> 代价是异步侧没有返回结构的补全，需要时用 `cast(VersionItem, await ...)`。

## PySide6 等 GUI：后台调用与主线程回调

Qt 跑的是自己的事件循环，`await` 在里面无处安放，而 UI 又只能在主线程碰。同步客户端
的 `client.background` 给出的是不依赖任何 GUI 框架的两段式方案（**SDK 自己不 import
Qt**）：请求丢进后台线程池，回调**不在工作线程就地执行**，而是排队等主线程来取。

```python
from PySide6.QtCore import QTimer

client = VerhubClient("https://verhub.example.com/api/v1", "verhub")

# 用 Qt 自己的定时器周期性排空回调队列 —— 于是回调都跑在主线程，可以直接改控件
self._timer = QTimer(self)
self._timer.timeout.connect(client.background.drain)
self._timer.start(50)

client.background.submit(
    client.public.check_update,
    current_version="1.1.0",
    on_success=self.show_update,   # 在主线程执行，随便改 UI
    on_error=self.show_error,      # 收到异常对象
    on_done=self.hide_spinner,     # 成功失败都会跑
)
```

- `submit()` 返回标准的 `concurrent.futures.Future`。三个回调都不给就纯粹当线程池
  用，`add_done_callback` 按 `concurrent.futures` 的语义在工作线程执行。
- `drain(max_callbacks=None)` 不阻塞：队列空了立刻返回，返回值是本次执行的回调数。
  回调很重怕拖住界面时可以限一批的量。
- 回调自己抛的异常会记进 `verhub_sdk` 日志器并跳过，不会卡死队列。
- 忘了接定时器（回调排了一堆没人取）时，`close()` 会打一条 WARNING 提示。
- 线程池大小用 `VerhubClient(..., background_workers=4)` 调；不碰 `background`
  就一个线程都不会创建。

tkinter 用 `after()`、wxPython 用 `wx.Timer` 接 `drain` 同理。

## 重试与超时

- **GET / HEAD** 在连接失败与 502/503/504 时默认自动重试 2 次并指数退避；其余方法
  （含 `check_update` 这类 POST）一律不重放。读超时也不重试——请求可能已经在服务端
  生效了。用 `retries=` 调整，传 `0` 关闭：`VerhubClient(base_url, "verhub", retries=3)`。
- `timeout` 支持 `(connect, read)` 元组，分别指定连接与读取超时——更新检查常
  希望连接快速失败、读取宽松些：`VerhubClient(base_url, timeout=(3.0, 20.0))`。
  也可以直接传 `httpx.Timeout(...)` 做精细控制，或传 `None` 不限时。
- 传自定义 `http_client` 时重试与超时仍由 SDK 负责（超时按每次请求下发）。

## 线程安全

同步 `VerhubClient` 的底层 `httpx.Client` 本身线程安全，多线程共用一个客户端并发发
请求没有问题（`background` 线程池就是这么用的）。但 `set_token` / `set_project_key`
/ `set_platform` 这些 setter 是**原地改可变状态**，不要在有在途请求时并发调用；
构造时配好凭据、之后只读使用是最省心的用法。

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

## 事件采集

```python
client.public.track("checkout_clicked", {"plan": "pro"})
client.public.flush()   # 退出前手动催发；close() 与 with 退出时也会自动 flush
```

`track()` 入队即返回，不发起网络请求。**事件名无需预先在后台登记**，服务端第一次
收到就自动建立定义；建议用小写下划线形式，服务端只接受字母、数字、下划线、点、
连字符与冒号。

异步客户端上 `track()` / `flush()` 返回协程，要 `await`：

```python
await client.public.track("app_opened")
await client.public.flush()
```

### 攒批与发送时机

```python
VerhubClient(base_url, "verhub", analytics={
    "flush_interval": 5.0,      # 秒（不是毫秒），默认 5.0
    "batch_size": 20,           # 攒够就发，上限 50
    "max_queue_size": 500,      # 超出丢最旧的
    "session_timeout": 1800.0,  # 会话空闲多久换新，秒
})
```

两个条件谁先到算谁。`batch_size` 会被钳到 50（服务端单批上限
`VERHUB_EVENT_BATCH_MAX`），它同时也是每个请求的分片大小。

想让不常用的功能少上报几次，把间隔拉长即可：

```python
VerhubClient(base_url, "verhub", analytics={
    "flush_interval": 24 * 60 * 60,
    "max_queue_size": 2000,
})
```

> 硬边界：**攒够 50 条一定会立即发**，`batch_size` 拦不住。所以「24 小时发一次」
> 成立的前提是这段时间内不足 50 条事件。

后台发送走 `_worker.py` 的 `BackgroundWorker`（异步版走原生协程）。进程提前退出不会
丢数据——队列是落盘的，下次启动读回来并排一次发送。所以拉长间隔的实际语义是
「**最长** 24 小时」。

### 本地存储

这是整个 SDK 里**唯一**会在设备上写入数据的能力。其余能力（查询、检查更新、反馈、
日志）仍然一个字节都不落盘。

| 平台    | 位置                                                                  |
| ------- | --------------------------------------------------------------------- |
| Windows | `%LOCALAPPDATA%\verhub-sdk\<命名空间>.json`                           |
| macOS   | `~/Library/Application Support/verhub-sdk/<命名空间>.json`            |
| Linux   | `$XDG_STATE_HOME/verhub-sdk/<命名空间>.json`，未设则 `~/.local/state` |

每个命名空间一个文件，文件里三个键：

| 键            | 内容                  |
| ------------- | --------------------- |
| `distinct_id` | 匿名标识，随机 UUIDv4 |
| `queue`       | 待发送事件            |
| `opt_out`     | 退出标记，值为 `"1"`  |

**匿名标识是随机数，不含任何设备特征**，也不读取设备上的既有标识（序列号、MAC、
广告 ID）。它只在本应用本实例内有效，跨应用、跨设备都识别不出同一个人。存在的唯一
理由是把同一使用者的事件串成序列——单条行为记录没有分析价值，漏斗与留存必须能组合
才算得出来。

#### 多实例、多项目怎么隔离

本地状态按**服务实例地址 + 项目标识**隔离，命名空间是
`<origin 哈希>-<小写 project_key>`（origin 只看协议+主机+端口，路径忽略）。这一层是
必须的：同一个 `project_key` 在两套自部署实例上是两批毫不相干的用户，共用匿名标识会让
统计串味，共用待发队列更会把事件投递到错误的实例。

同一实例同一项目下的两个应用如需各自独立，显式给 `namespace`；四个语言的哈希实现逐位
一致，同一实例在任何语言下都落到同一个命名空间。

```python
VerhubClient(base_url, "verhub", analytics={"namespace": "my-app"})
```

写入是「先写临时文件再 `os.replace`」，进程中途退出不会留下损坏的状态文件。同一命名
空间下两个进程同时写仍是后写者赢——事件带幂等键，最坏结果是重发（服务端去重）。

`set_project_key()` 换绑项目后，队列会按新命名空间重建；旧项目攒下的事件留在它自己的
文件里等下次补发，**不会**被错发进新项目。

目录不可写时静默退回内存：采集不该因为存不下标识就整个失效，但也不会假装落了盘。
用 `storage=` 可以接管持久化位置。

`persistence` 控制落盘程度：`"device"`（默认，重启后仍是同一标识）、`"session"`
（只在内存里，重启即换新）、`"none"`（完全不生成持久标识，也不落盘）。

### 退出与同意

```python
client.public.opt_out()         # 停采 + 清空队列 + 删除本地标识 + 落盘退出标记
client.public.opt_in()          # 撤销退出，生成【新的】标识，不复用退出前那个
client.public.has_opted_out()
client.public.reset_identity()  # 继续采集但换新标识，切断与既往序列的关联
client.public.distinct_id       # 当前标识；未采集状态下为 None
```

`opt_out()` 会**删掉** `distinct_id` 与 `queue`，同时**写入** `opt_out`。退出标记
本身必须落盘，否则重启即失效——存「用户已拒绝」这个事实是执行用户选择所必需的，
不在需要同意的范围内。

面向欧盟用户必须开 `require_consent`：

```python
client = VerhubClient(base_url, "verhub", analytics={"require_consent": True})
client.public.grant_consent()    # 取得同意后开闸
client.public.revoke_consent()   # 撤回，等价于 opt_out 并回到未同意状态
```

开启后在 `grant_consent()` 之前**一个字节都不写、一条都不采**（含匿名标识的生成），
事件直接丢弃而非在内存里暂存。ePrivacy Directive Art.5(3) 要求在设备上写入或读取
信息**之前**取得同意，分析用途不适用「严格必要」例外。同意的取得与举证由接入方
负责，SDK 无从判断某次调用是否已获授权。

Python 侧没有浏览器的 GPC / DNT 信号，因此不提供 `respect_do_not_track`。服务端
另有两道不依赖 SDK 的闸门：请求头 `x-verhub-do-not-track: 1`，以及项目级总开关
`event_collection_enabled`。命中任一都返回 202 但不入库、不计数——这是正常的用户
选择，不是错误，所以不返回 4xx。

### 数据主体权利

```python
client.public.export_my_data()   # 导出本机标识下的全部明细（Art.15 / Art.20）
client.public.delete_my_data()   # 删除（Art.17）
```

两者都可显式传 `distinct_id`。管理端可代为删除：
`client.admin.delete_event_subject(distinct_id)`——用户往往通过客服而不是应用内
按钮提出请求。

删除范围是事件明细与日活去重记录；**小时汇总不删**。它只保存计数、不含任何标识符、
精度为自然小时，无法回溯到具体设备或还原访问序列，属于匿名数据。

## 其他

- 返回值是解析后的 `dict`；`verhub_sdk.models` 里有对应的 `TypedDict`，
  供编辑器补全和 mypy 使用，运行时不做校验也不做拷贝。
- 需要代理、自定义证书或连接池上限时，传入自己的 `httpx.Client`：
  `VerhubClient(base_url, http_client=my_client)`（异步版收 `httpx.AsyncClient`）。
  自带的客户端由你自己关，SDK 的 `close()` 不动它。
- 客户端可作为上下文管理器使用，退出时关闭连接池与后台线程池（异步版用
  `async with`）。

## 从 requests 版升级

SDK 的 HTTP 底座从 `requests` 换成了 [httpx](https://www.python-httpx.org/)，
接口面本身没变，但有三处破坏性变更：

| 变更                   | 旧                           | 新                           |
| ---------------------- | ---------------------------- | ---------------------------- |
| 依赖                   | `requests`                   | `httpx`                      |
| 自定义传输             | `session=requests.Session()` | `http_client=httpx.Client()` |
| `close()` 对自带客户端 | 一并关闭                     | 不动，由调用方自己关         |

`AsyncVerhubClient` 的用法不变，但内部从线程池换成了原生异步；捕获底层异常时注意
`VerhubConnectionError.cause` 现在是 `httpx` 的异常类型（原先是 `requests` 的）。
