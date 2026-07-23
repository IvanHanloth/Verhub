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

## 与 TS 版一致的行为

- 客户端绑定 `projectKey`，项目作用域的方法不再逐次传项目参数
- `undefined` 的字段不提交；显式 `null` 提交为 JSON null（更新接口用来置空）
- 默认按环境探测平台**与系统版本**（浏览器记作 `web`、版本留空；Node 里能取到
  Windows `11` / `ubuntu 24.04` 等），经两个 `x-verhub-platform*` 头声明，仅用于统计；
  可用 `setPlatform` / `setPlatformVersion` 事后更新
- 错误分 `VerhubApiError`（非 2xx）与 `VerhubConnectionError`（没到服务端），
  都继承自 `VerhubError`
- 支持 `timeoutMs`、`headers`、`fetch` 三个可选项

```js
try {
  await client.public.getLatestVersion()
} catch (error) {
  if (error instanceof VerhubApiError) {
    console.error(error.status, error.message)
  }
}
```
