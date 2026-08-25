# Verhub SDK (TypeScript)

[Verhub](https://github.com/IvanHanloth/verhub) 版本与发布管理平台的官方 TypeScript / JavaScript SDK。

接口面与 Python / Rust / 纯 JS 版一一对应，只是方法名按 JS 习惯写成 camelCase。
完整的方法清单与跨语言对照见[《SDK 参考》](https://ivanhanloth.github.io/Verhub/reference/sdk)。

## 安装

```bash
npm install verhub-sdk
```

同时提供 ESM 与 CJS 产物，自带类型声明。运行时只依赖全局 `fetch`（Node 18+、
现代浏览器、Bun、Deno 都有）；环境里没有时可以自己传一个实现进来。

## 快速开始

```ts
import { VerhubClient } from "verhub-sdk"

// projectKey 绑定项目，之后项目作用域的方法都不用再传它
const client = new VerhubClient({
  baseUrl: "https://verhub.example.com/api/v1",
  projectKey: "verhub",
})

const result = await client.public.checkUpdate({ current_version: "1.1.0" })
if (result.should_update) {
  console.log(result.target_version?.version, result.target_version?.content)
}
```

`baseUrl` 要带上 `/api/v1` 前缀，也就是浏览器里能直接打开 `/health` 的那个地址。

## 两个命名空间

- `client.public` — 公开接口，不需要凭据，客户端 App 直接调用
- `client.admin` — 管理接口，需要管理员 JWT 或 API Key

```ts
const client = new VerhubClient({
  baseUrl: "https://verhub.example.com/api/v1",
  projectKey: "verhub",
  token: "vh_xxx",
})

await client.admin.upsertVersion("v1.2.0", {
  comparable_version: "1.2.0",
  title: "稳定版",
  content: "修复若干问题。",
  is_latest: true,
})
```

凭据与绑定项目都可以事后更换：`client.setToken(token)` / `client.setProjectKey(key)`。
没绑定项目就调项目作用域的方法会抛 `VerhubError`。

> 别把管理凭据打进浏览器产物。要在网页里用 SDK，只用 `client.public`。

### 条款文档

隐私政策与 SDK 合规性文档是**实例级**的，不作用于绑定项目，因此不需要
`projectKey` 也能读：

```ts
for (const doc of (await client.public.listTerms()).data) {
  console.log(doc.slug, doc.title, doc.updated_at)
}

const policy = await client.public.getTerms("privacy-policy")
console.log(policy.content) // Markdown；实例未自定义时是内置正文
```

管理端可以改写正文，只接受管理员 JWT（API Key 会得到 401）：

```ts
await client.admin.updateTermsDocument("privacy-policy", {
  custom: true,
  content: "# 隐私政策\n...",
})
await client.admin.resetTermsDocument("privacy-policy") // 关掉自定义并丢弃草稿
```

## 省略与置空

输入对象里，`undefined` 与 `null` 含义不同：

- 字段不写或为 `undefined` → 不出现在请求里 → 更新接口保持原值
- 字段显式为 `null` → 以 JSON `null` 提交 → 更新接口把该字段置空

```ts
await client.admin.updateVersion("ver-001", { download_url: null }) // 清空
await client.admin.updateVersion("ver-001", { title: "改个标题" }) // 只动标题
```

## 平台与系统版本声明

SDK 默认按运行环境自动探测平台**与系统版本**（Node 里如 Windows `11`、
`ubuntu 24.04`、macOS `14.5.0`；浏览器一律 `web`、版本留空），通过
`x-verhub-platform` / `x-verhub-platform-version` 两个请求头声明，供服务端做来源
统计——这不影响任何接口的返回内容。

```ts
new VerhubClient({ baseUrl, projectKey, platform: "linux", platformVersion: "ubuntu 24.04" })
new VerhubClient({ baseUrl, projectKey, platform: null }) // 完全不声明

client.setPlatform("linux") // 事后更新
client.setPlatformVersion("ubuntu 24.04")
```

两项各管各的：显式给了就用给的，没给就自己探测——指定 `platform` 不影响版本探测。
只有 `platform: null` 会连带停掉版本探测（此时仍可单独给 `platformVersion`）。

版本明细会在存入时清洗成能安全进 HTTP 头的形式：非可打印 ASCII 按空白处理、折叠
空白、按 32 字符截断，洗完为空则不发这个头。用错编码读出来的 `...[�汾 10.0...]`
这类串因此不会让 `fetch` 抛 `TypeError`，把整个请求带下水。

## 错误处理

```ts
import { VerhubApiError, VerhubAuthError, VerhubConnectionError } from "verhub-sdk"

try {
  await client.admin.listProjects()
} catch (error) {
  if (error instanceof VerhubAuthError) {
    console.error("忘了设 token，请求没发出去", error.message) // 本地前置校验失败
  } else if (error instanceof VerhubApiError) {
    console.error(error.status, error.message, error.body) // 服务端返回非 2xx
  } else if (error instanceof VerhubConnectionError) {
    console.error(error.cause) // 请求没到服务端
  }
}
```

三者都继承自 `VerhubError`。`VerhubAuthError` 用于「调 admin 接口却没设凭据」这类
**本地前置校验失败**——请求根本没发出去，与服务端真正拒绝凭据的 `VerhubApiError`
（HTTP 401/403）区分开。

> **升级提示（破坏性变更）**：早期版本在缺 token 时抛的是伪造的 `VerhubApiError`
> （status 401）。现在改抛 `VerhubAuthError`。若你之前靠 `instanceof VerhubApiError`
> 兜这种情况，请补上 `VerhubAuthError`。

## 重试

**GET / HEAD** 在连接失败与 502/503/504 时默认自动重试 2 次并指数退避；其余方法
（含 `checkUpdate` 这类 POST）一律不重放。用 `retries` 调整，传 `0` 关闭。

```ts
new VerhubClient({ baseUrl, projectKey, retries: 3 })
```

## User-Agent

Node 等服务端运行时默认带 UA `verhub-sdk-js/<版本>`（浏览器禁止脚本改写 UA，此项
无效）。想加上自家应用标识做服务端统计，用 `appIdentifier`（保留 SDK 版本信息）：

```ts
new VerhubClient({ baseUrl, projectKey, appIdentifier: "MyApp/1.2" })
// UA: verhub-sdk-js/x.y.z MyApp/1.2
```

## 事件采集

`track()` 入队即返回，不发起网络请求，也不阻塞调用方——埋点写在 UI 事件处理里，
任何一次网络等待都会被用户感知成卡顿。

```ts
client.public.track("checkout_clicked", { plan: "pro" })
await client.public.flush() // 退出前手动催发，避免丢掉最后一批
```

**事件名无需预先在后台登记**：服务端第一次收到就自动建立定义。建议用小写下划线
形式，服务端会归一化为小写，只接受字母、数字、下划线、点、连字符与冒号。

### 攒批与发送时机

| 选项               | 默认      | 说明                              |
| ------------------ | --------- | --------------------------------- |
| `flushIntervalMs`  | `5000`    | 攒批的时间上限                    |
| `batchSize`        | `20`      | 攒够这么多条立即发送，**上限 50** |
| `maxQueueSize`     | `500`     | 队列上限，超出丢最旧的            |
| `sessionTimeoutMs` | `1800000` | 会话空闲多久换新                  |

两个条件谁先到算谁。`batchSize` 会被钳到 50（服务端单批上限
`VERHUB_EVENT_BATCH_MAX`），它同时也是每个请求的分片大小——`flush()` 会按这个尺寸
把整个队列分几次发完。

想让不常用的功能少上报几次，把间隔拉长即可：

```ts
new VerhubClient({
  baseUrl,
  projectKey: "demo",
  analytics: { flushIntervalMs: 24 * 60 * 60 * 1000, maxQueueSize: 2000 },
})
```

> 这里有个硬边界：**攒够 50 条一定会立即发**，`batchSize` 拦不住。所以「24 小时发
> 一次」成立的前提是这段时间内不足 50 条事件。低频功能通常没问题，高频的仍会按量
> 提前发出去。

定时器只在进程活着时有效。进程提前退出不会丢数据——队列是落盘的，下次启动读回来
并排一次发送；浏览器里关标签页还有 `visibilitychange` / `pagehide` +
`navigator.sendBeacon` 兜底。所以拉长间隔的实际语义是「**最长** 24 小时」。

### 本地存储

这是整个 SDK 里**唯一**会在设备上写入数据的能力。其余能力（查询、检查更新、反馈、
日志）仍然一个字节都不落盘。

写入位置按运行环境选：

| 环境    | 位置                                                                  |
| ------- | --------------------------------------------------------------------- |
| 浏览器  | `localStorage`                                                        |
| Windows | `%LOCALAPPDATA%\verhub-sdk\<命名空间>.json`                           |
| macOS   | `~/Library/Application Support/verhub-sdk/<命名空间>.json`            |
| Linux   | `$XDG_STATE_HOME/verhub-sdk/<命名空间>.json`，未设则 `~/.local/state` |

三个键，前缀是 `verhub.analytics.<命名空间>.`：

| 键            | 内容                  |
| ------------- | --------------------- |
| `distinct_id` | 匿名标识，随机 UUIDv4 |
| `queue`       | 待发送事件            |
| `opt_out`     | 退出标记，值为 `"1"`  |

**匿名标识是随机数，不含任何设备特征**，也不读取设备上的既有标识（序列号、MAC、
广告 ID）。它存在的唯一理由是把同一使用者的事件串成序列——单条行为记录没有分析价值，
漏斗与留存必须能组合才算得出来。

#### 多实例、多项目怎么隔离

本地状态按**服务实例地址 + 项目标识**隔离，命名空间是
`<origin 哈希>-<小写 projectKey>`（origin 只看协议+主机+端口，路径忽略）。这一层是
必须的：同一个 `projectKey` 在两套自部署实例上是两批毫不相干的用户，共用匿名标识会让
统计串味，共用待发队列更会把事件投递到错误的实例。

同一实例同一项目下的两个应用如需各自独立，显式给 `namespace`；四个语言的哈希实现逐位
一致，同一实例在任何语言下都落到同一个命名空间。

```ts
new VerhubClient({ baseUrl, projectKey, analytics: { namespace: "my-app" } })
```

桌面端每个命名空间一个文件，写入是「先写临时文件再原子替换」，进程中途退出不会留下
损坏的状态文件。同一命名空间下两个进程同时写仍是后写者赢——事件带幂等键，最坏结果是
重发（服务端去重），不值得为此加跨进程文件锁。

`setProjectKey()` 换绑项目后，队列会按新命名空间重建；旧项目攒下的事件留在它自己的
文件里等下次补发，**不会**被错发进新项目。

拿不到可写位置时（浏览器隐私模式配额为 0、目录不可写）静默退回内存：采集不该因为
存不下标识就整个失效，但也不会假装数据落了盘。

`persistence` 控制落盘程度：

- `"device"`（默认）— 写入本地，重启后仍是同一个标识，留存曲线可跨天成立
- `"session"` — 只在进程内存里，重启即换新，漏斗仍可用但跨天留存算不了
- `"none"` — 完全不生成持久标识，也不落盘

### 退出与同意

```ts
client.public.optOut() // 停止采集 + 清空队列 + 删除本地标识 + 落盘退出标记
client.public.optIn() // 撤销退出，生成【新的】标识，不复用退出前那个
client.public.hasOptedOut()
client.public.resetIdentity() // 继续采集，但换新标识，切断与既往序列的关联
```

`optOut()` 会**删掉** `distinct_id` 与 `queue`，同时**写入** `opt_out`。退出标记本身
必须落盘，否则重启即失效——存「用户已拒绝」这个事实是执行用户选择所必需的，不在
需要同意的范围内。

面向欧盟用户必须开 `requireConsent`：

```ts
new VerhubClient({ baseUrl, projectKey, analytics: { requireConsent: true } })

client.public.grantConsent() // 取得同意后开闸
client.public.revokeConsent() // 撤回，等价于 optOut 并回到未同意状态
```

开启后在 `grantConsent()` 之前**一个字节都不写、一条都不采**（含匿名标识的生成），
事件直接丢弃而非在内存里暂存——暂存等于赌用户稍后会同意。ePrivacy Directive
Art.5(3) 要求在设备上写入或读取信息**之前**取得同意，分析用途不适用「严格必要」
例外。同意的取得与举证由接入方负责，SDK 无从判断某次调用是否已获授权。

浏览器里还会自动尊重 `navigator.globalPrivacyControl` 与 `navigator.doNotTrack`，
命中任一即等同退出，由 `respectDoNotTrack` 控制（默认 `true`）。

服务端另有两道不依赖 SDK 的闸门：请求头 `x-verhub-do-not-track: 1`，以及项目级总
开关 `event_collection_enabled`。命中任一都返回 202 但不入库、不计数、不解析归属地
——这是正常的用户选择，不是错误，所以不返回 4xx。

### 数据主体权利

```ts
await client.public.exportMyData() // 导出本机标识下的全部明细（Art.15 / Art.20）
await client.public.deleteMyData() // 删除（Art.17）
```

两者都可显式传 `distinctId`。管理端可代为删除：`client.admin.deleteEventSubject(id)`
——用户往往通过客服而不是应用内按钮提出请求。

删除范围是事件明细与日活去重记录；**小时汇总不删**。它只保存计数、不含任何标识符、
精度为自然小时，无法回溯到具体设备或还原访问序列，属于匿名数据。

## 其他选项

```ts
new VerhubClient({
  baseUrl,
  timeoutMs: 5000, // 默认 15000，传 0 表示不超时
  headers: { "x-trace": "1" }, // 附加到每个请求
  fetch: myFetch, // 自定义 fetch 实现
  logger: (e) => console.debug(e.method, e.url, e.status), // 调试日志钩子，默认不打
})
```
