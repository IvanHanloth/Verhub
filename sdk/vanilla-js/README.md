# Verhub SDK (纯 JS)

零依赖、零构建的 [Verhub](https://github.com/IvanHanloth/verhub) SDK，给不走打包器的
场景用：网页里直接 `<script>`，或从 CDN / 本地路径 `import`。

接口面与 Python / TypeScript / Rust 版一一对应。方法清单与跨语言对照见
[《SDK 参考》](https://ivanhanloth.github.io/Verhub/reference/sdk)。

> 需要 npm 包、类型声明或 tree-shaking？用
> [`verhub-sdk`](https://www.npmjs.com/package/verhub-sdk)（TypeScript 版），
> 本目录是它的无构建替代品。

## 两个文件

- `verhub-sdk.js` — ES module，`import` 用
- `verhub-sdk.global.js` — 由前者构建产出的 UMD，`<script>` 引入后挂在全局

改动只写在 `verhub-sdk.js`，然后 `node build.mjs` 重新生成 global 版本。

## import 用法

```js
import { VerhubClient } from "./verhub-sdk.js"

// projectKey 绑定项目，之后项目作用域的方法都不用再传它
const client = new VerhubClient({
  baseUrl: "https://verhub.example.com/api/v1",
  projectKey: "verhub",
})
const latest = await client.public.getLatestVersion()
console.log(latest.version)
```

## script 标签用法

```html
<script src="./verhub-sdk.global.js"></script>
<script>
  const client = VerhubClient.create({
    baseUrl: "https://verhub.example.com/api/v1",
    projectKey: "verhub",
  })
  client.public.getLatestVersion().then((v) => console.log(v.version))
</script>
```

`baseUrl` 要带上 `/api/v1` 前缀，也就是浏览器里能直接打开 `/health` 的那个地址。
绑定的项目可事后用 `client.setProjectKey(key)` 更换。

## 命名空间与鉴权

- `client.public` — 公开接口，不需要凭据
- `client.admin` — 管理接口，需要管理员 JWT 或 API Key

`admin` 命名空间在这里同样提供，但**别把管理凭据放进网页**——任何访客都能从
前端代码里读到它。浏览器里请只用 `client.public`；`admin` 留给 Node / Deno / Bun
这类脚本环境。

```js
const client = new VerhubClient({
  baseUrl: "https://verhub.example.com/api/v1",
  projectKey: "verhub",
  token: "vh_xxx", // 仅在服务端脚本里这么做
})
```

### 条款文档

隐私政策与 SDK 合规性文档是**实例级**的，不作用于绑定项目，因此不需要
`projectKey` 也能读，适合直接渲染到网页的「隐私政策」页：

```js
const { data } = await client.public.listTerms()
const policy = await client.public.getTerms("privacy-policy")
document.querySelector("#policy").textContent = policy.content // Markdown
```

## 事件采集

```js
client.public.track("checkout_clicked", { plan: "pro" })
await client.public.flush() // 手动催发
```

`track()` 入队即返回，不阻塞调用方。事件名无需预先在后台登记，服务端第一次收到就
自动建立定义。

浏览器里状态写在 **`localStorage`**，三个键，前缀 `verhub.analytics.<命名空间>.`：

| 键            | 内容                                        |
| ------------- | ------------------------------------------- |
| `distinct_id` | 匿名标识，随机 UUIDv4，**不含任何设备特征** |
| `queue`       | 待发送事件                                  |
| `opt_out`     | 退出标记，值为 `"1"`                        |

命名空间是 `<origin 哈希>-<小写 projectKey>`（origin 只看协议+主机+端口，路径忽略），
所以**同一个 projectKey 部署在两套自部署实例上时互不干扰**——否则共用匿名标识会让统计
串味，共用待发队列更会把事件投递到错误的实例。同一实例同一项目下的两个页面应用如需
各自独立，显式给 `analytics: { namespace: "my-app" }`。

`setProjectKey()` 换绑项目后队列会按新命名空间重建，旧项目攒下的事件留在原键下等补发。

这是整个 SDK 里唯一会在设备上写入数据的能力。隐私模式下配额为 0，写不进去就静默
退回内存，采集本身不受影响。

攒批规则：满 `batchSize`（默认 20，**上限 50**）或每 `flushIntervalMs`（默认 5000）
发一次，谁先到算谁。想让低频功能少上报几次就把间隔拉长，但**攒够 50 条一定会立即
发**，`batchSize` 拦不住。

关标签页时 `setTimeout` 不会再触发，所以另有 `visibilitychange` / `pagehide` +
`navigator.sendBeacon` 兜底把队列送出去。beacon 设不了请求头，平台声明因此改走
请求体——不带的话服务端会从 User-Agent 推断，把浏览器事件算到宿主系统而不是 `web`。

### 退出与同意

```js
client.public.optOut() // 停采 + 清空队列 + 删除本地标识 + 落盘退出标记
client.public.optIn() // 撤销退出，生成【新的】标识
client.public.hasOptedOut()
client.public.resetIdentity() // 继续采集但换新标识

// 面向欧盟用户必须开 requireConsent
new VerhubClient({ baseUrl, projectKey, analytics: { requireConsent: true } })
client.public.grantConsent()
client.public.revokeConsent()
```

退出标记本身要落盘，否则重启即失效——存「用户已拒绝」这个事实是执行用户选择所必需
的，不在需要同意的范围内。

默认尊重 `navigator.globalPrivacyControl` 与 `navigator.doNotTrack`，命中任一即等同
退出（`respectDoNotTrack`，默认开）。

数据主体权利：`client.public.exportMyData()` / `deleteMyData()`。删除范围是事件明细，
小时汇总不删——它只有计数、不含标识符，回溯不到具体设备。

完整说明（存储位置、`persistence` 三档、服务端兜底闸门）见 TypeScript 版 README 的
「事件采集」一节，行为逐条一致。

## 与 TS 版一致的行为

- 客户端绑定 `projectKey`，项目作用域的方法不再逐次传项目参数
- `undefined` 的字段不提交；显式 `null` 提交为 JSON null（更新接口用来置空）
- 默认按环境探测平台**与系统版本**（浏览器记作 `web`、版本留空；Node 里能取到
  Windows `11` / `ubuntu 24.04` 等），经两个 `x-verhub-platform*` 头声明，仅用于统计；
  可用 `setPlatform` / `setPlatformVersion` 事后更新。两项各管各的：显式给了就用给的，
  没给就自己探测；只有 `platform: null` 这个明确的退出声明会连带停掉版本探测。
  两个值都会清洗成能安全进 HTTP 头的形式（非可打印 ASCII 按空白处理、折叠空白、
  按 32 字符截断，洗完为空则不发），免得脏值让 `fetch` 抛 `TypeError` 弄挂请求
- 错误分三类：`VerhubAuthError`（缺凭据的本地前置校验，请求没发出去）、
  `VerhubApiError`（非 2xx）、`VerhubConnectionError`（没到服务端），都继承自
  `VerhubError`
- GET / HEAD 在连接失败与 502/503/504 时默认自动重试 2 次；其余方法不重放。用
  `retries` 调整，传 `0` 关闭
- 支持 `timeoutMs`、`retries`、`headers`、`fetch`、`appIdentifier`、`logger` 等可选项。
  `appIdentifier` 追加到默认 UA 之后（仅服务端运行时有效，浏览器禁改 UA）

```js
try {
  await client.admin.listProjects()
} catch (error) {
  if (error instanceof VerhubAuthError) {
    console.error("忘了设 token，请求没发出去") // 本地前置校验失败
  } else if (error instanceof VerhubApiError) {
    console.error(error.status, error.message)
  }
}
```

> **升级提示（破坏性变更）**：早期版本在缺 token 时抛的是伪造的 `VerhubApiError`
> （status 401），现在改抛 `VerhubAuthError`。
