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

## 错误处理

```ts
import { VerhubApiError, VerhubConnectionError } from "verhub-sdk"

try {
  await client.public.getLatestVersion()
} catch (error) {
  if (error instanceof VerhubApiError) {
    console.error(error.status, error.message, error.body) // 服务端返回非 2xx
  } else if (error instanceof VerhubConnectionError) {
    console.error(error.cause) // 请求没到服务端
  }
}
```

两者都继承自 `VerhubError`。

## 其他选项

```ts
new VerhubClient({
  baseUrl,
  timeoutMs: 5000, // 默认 15000，传 0 表示不超时
  headers: { "x-trace": "1" }, // 附加到每个请求
  fetch: myFetch, // 自定义 fetch 实现
})
```
