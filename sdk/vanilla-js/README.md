# Verhub SDK (vanilla JS)

`VerhubSDK` 在 vanilla JS 版本仅提供公开接口（public API）。

当前版本：`0.1.0`

## 快速开始

```js
import { VerhubSDK } from "./verhub-sdk.js"

const sdk = VerhubSDK.create({ baseUrl: "https://api.example.com/api/v1" })
const project = await sdk.publicApi.getProjectPublicInfo("verhub")
console.log(project)
```

## 通过 script 标签直接使用

```html
<script src="./verhub-sdk.global.js"></script>
<script>
  const sdk = VerhubSDK.create({ baseUrl: "https://api.example.com/api/v1" })
  sdk.publicApi.getLatestPublicVersion("verhub").then(console.log)
</script>
```

## 已实现方法（public）

- getProjectPublicInfo(projectKey)
- listPublicVersions(projectKey, limit, offset)
- getLatestPublicVersion(projectKey)
- listPublicAnnouncements(projectKey, limit, offset)
- getLatestPublicAnnouncement(projectKey)
- createFeedback(projectKey, content, userId, rating, platform)
- createLog(projectKey, level, content, deviceInfo, customData)
- createActionRecord(projectKey, actionId, http, customData)

说明：方法已改为显式参数，不再使用 `payload` 这种泛化入参。
