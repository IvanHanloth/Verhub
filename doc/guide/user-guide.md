# 用户指南

本指南面向平台管理员与运营人员。

## 角色说明

- 管理员：维护项目、版本、公告、反馈与日志
- API 调用方：使用 API Key 调用对外接口

## 后台页面说明

后台入口为 `/admin`，左侧菜单包含以下页面：

1. 概览

- 查看项目数、Token 数、版本/公告/反馈/日志统计
- 用于发布前后快速巡检

2. 项目管理

- 新建、编辑、删除项目
- 维护 `project_key`、名称、仓库地址、官网、文档链接、作者、发布时间等
- 项目描述支持 Markdown（GFM）语法，表单可在“编写/预览”间切换
- 在项目列表中可直接打开“项目展示页”链接（`/projects/{project_key}`）

3. 版本管理

- 选择项目后发布版本、编辑版本、删除版本
- 维护语义化版本号、可比较版本号、里程碑、更新内容、下载地址、平台、发布时间
- 更新内容支持 Markdown（GFM）语法，可直接粘贴 GitHub Release 正文
- 支持 latest/preview、废弃标记等发布策略

4. 公告管理

- 选择项目后发布公告
- 支持置顶、发布时间与正文内容维护
- 正文支持 Markdown（GFM）语法；展示页仅显示摘要，点击“查看全文”弹窗查看完整内容

5. 行为管理

- 维护行为定义（动作名称、描述、扩展字段）
- 查看客户端上报的行为记录，用于运营分析
- 每条记录附带来源 IP、地区、平台与 User-Agent，`http` / `custom_data` 以可折叠 JSON 展示

6. 反馈管理

- 查看用户反馈、评分、平台信息
- 每条反馈附带来源 IP 与解析出的地区
- 跟进处理状态并沉淀处理结果

7. 日志管理

- 按项目、级别、时间范围筛选日志
- 列表默认折叠，展开后可见来源 IP、地区、平台，以及以树形展开的 `device_info` / `custom_data`
- 用于故障排查和审计复盘

8. Token 管理

- 创建、轮换、撤销 API Key
- 设置权限范围、项目范围、过期时间

9. 管理员设置

- 修改管理员账号与密码
- 保存后需要重新登录

## 常见操作流程

## 1. 新建项目

### 手动创建

1. 登录后台
2. 进入项目管理
3. 填写项目 key、名称、仓库地址等信息

### 从 GitHub 获取项目信息

1. 登录后台
2. 进入项目管理
3. 在“仓库地址”字段中输入 GitHub 仓库地址（如 `https://github.com/IvanHanloth/Verhub`）
4. 点击“从 GitHub 获取项目信息”按钮，系统会自动拉取仓库信息并填充项目名称、作者、官网等字段，用户可根据需要进行编辑后保存。

## 2. 发布版本

### 手动发布

1. 选择指定项目
2. 填写版本号、发布说明、下载链接
3. 根据需求设置 `latest` 或 `preview`

### 从 Github 获取版本

1. 选择指定项目，如果项目已绑定 GitHub 仓库，则会显示“从 GitHub Release 获取”按钮
2. 如直接点击“从 GitHub Release 获取”，会自动拉取最新的 Release 作为版本草稿
3. 如输入版本号后点击“从 GitHub Release 获取”，会尝试拉取指定版本号的 Release 作为版本草稿，若该版本不存在则会提示错误
4. 获取到的版本草稿会自动填充版本信息与发布说明、设置 latest/preview 状态，用户可根据需要进行编辑后发布

### 从 Github 导入历史版本

1. 选择指定项目，如果项目已绑定 GitHub 仓库，则会显示“从 GitHub 导入历史版本”按钮
2. 点击按钮后，将会自动拉取并入库该项目在 GitHub 上的所有 Release 版本，用户可在版本列表中查看并编辑这些版本信息。注意，如果获取到的版本号已存在则会被跳过以避免覆盖现有版本。

### 通过 GitHub Webhook 自动同步

配置一次之后，GitHub 上发布或编辑 Release 会自动写回 Verhub，不需要再手动点“获取版本”。

配置步骤：

1. 在项目管理页点击目标项目的“编辑”，在弹窗底部找到「GitHub Release Webhook」
2. 点击“重新生成 Secret”，复制弹出的 secret。**关闭弹窗后无法再次查看**，只保留末四位用于区分
3. 复制上方的 Payload URL
4. 到 GitHub 仓库 Settings → Webhooks → Add webhook，填入 Payload URL 与 secret，Content type 选 `application/json`，事件选择 “Let me select individual events” 并只勾选 **Releases**
5. 保存后 GitHub 会发一次 ping，在 Recent Deliveries 里看到 200 即接通

若仓库上已经配置过 webhook，可以直接把原有 secret 填进“手动填写 secret”保存，不必改动 GitHub 侧配置。

同步规则：

- 只处理 `release` 事件的 `published` / `released` / `prereleased` / `created` / `edited` 动作
- **版本号已存在时按 GitHub 的内容覆盖**：这意味着在后台手工改过的标题、说明会被下一次 Release 编辑覆盖回去。需要长期保留的自定义内容，请改用手动发布而不是 webhook 同步
- `deleted` / `unpublished` 不会删除 Verhub 里的版本，避免客户端拿到的下载地址突然消失；需要下架请到后台手动删除
- 草稿（draft）Release 会被跳过；`nightly`、`2024-06-01` 这类无法解析为可比较版本号的 tag 也会被跳过，返回 `ignored` 并注明原因
- `prerelease` 会写成预览版本，不会抢占 latest；正式版本只有在版本号不低于当前 latest 时才会接管 latest，因此编辑旧 Release 不会把 latest 拉回旧版本
- 附件（assets）会写入下载链接；没有附件时回落到源码包地址。若 CI 是「先建 Release 再传附件」，首次推送可能拿不到附件，等附件上传后编辑一次 Release 即可补齐

安全说明：

- 该接口不接受管理员 JWT 或 API Key，唯一凭据是 secret 对应的 `X-Hub-Signature-256` 签名
- 未配置 secret 的项目会拒绝所有推送
- 反向代理不得改写请求体，否则签名校验必然失败

## 更新策略与判定逻辑

公开更新接口：

- `GET /api/v1/public/{projectKey}/versions/by-version/{version}`（支持语义化版本号与可比较版本号）
- `GET /api/v1/public/{projectKey}/versions/latest-preview`
- `POST /api/v1/public/{projectKey}/versions/check-update`

判定核心：

1. 比较当前版本与目标版本（按 `comparable_version`）
2. 检查是否超出项目级可选更新范围
3. 检查当前版本是否被废弃（废弃版本有更新时必更）
4. 检查是否触发里程碑拦截（存在里程碑时先升到最早里程碑版本）

参数优先级：

- `current_version` 与 `current_comparable_version` 同时提交时，服务端优先使用 `current_comparable_version`

判定结果通过以下字段返回：

- `should_update`
- `required`
- `reason_codes`
- `target_version`

## 后台配置方法（重点）

## 1. 项目管理页配置“可选更新范围”

在项目表单中配置：

- 可选更新范围下限（`optional_update_min_comparable_version`）
- 可选更新范围上限（`optional_update_max_comparable_version`）

说明：

- 当前版本在范围内：可以提示更新但不强制
- 当前版本不在范围内：遇到新版本将触发必更
- 支持将范围下限/上限清空并保存

## 2. 版本管理页配置“版本策略”

在版本表单中配置：

- `version`：展示版本号
- `comparable_version`：用于比较的版本号
- `is_milestone`：里程碑标记
- `is_deprecated`：是否废弃（勾选后该版本必更）

建议：

- 版本发布时同时维护 `version` 与 `comparable_version`
- 仅在关键升级节点版本上勾选 `is_milestone`，勾选后用户必须先升级到该里程碑版本才能继续后续更新
- 废弃版本需配合公告说明升级理由与目标版本

## 3. 发布公告

1. 进入公告管理
2. 绑定项目并编辑正文
3. 发布后前台与 API 可见

## 4. 处理反馈

1. 进入反馈管理
2. 按状态筛选待处理项
3. 更新状态并记录处理结论

## 5. 看统计大屏

统计大屏按项目展示公开接口的调用情况：

- **请求趋势 / 活跃度日历**：时间按你浏览器所在时区呈现，是给你看的绝对时间轴。
- **访问热力图**：「星期 × 小时」按**每条请求的来源当地时区**折叠，回答的是「用户在他们当地几点活跃」。中国来源精确按 UTC+8，跨时区国家（美/俄等）取代表时区近似，无法定位来源的按你的浏览器时区兜底。它与请求趋势口径不同是有意为之：一个看用户作息节律，一个看你这边的绝对走势。
- **客户端版本分布**、**来源地区**：右上角可在柱状图与饼状图之间切换。饼图最多画 8 块，其余归入「其他」——再多就看不出差别了。
- **来源地区**：由调用方 IP 解析得到。「未知」是无法定位的地址（也包括后端未开启出网解析时的全部请求），「内网/本机」是私有网段调用，两者都不会被送去外部解析服务。右侧为**中国省级热力地图**，按省份请求量着色，鼠标悬停看省名与占比；国内来源精确到省（依据行政区划码聚合，不受各解析服务省市命名差异影响）。

统计只做小时级聚合，不保存单条请求，保留时长在项目管理里按项目配置。

## API Key 使用建议

API API Key 可用于**全部管理接口**，与管理员登录后拿到的 JWT 等价。调用时放在 `Authorization: Bearer` 里即可：

```bash
curl -X PUT "https://api.example.com/api/v1/admin/projects/demo/versions/by-version/1.2.3" \
  -H "Authorization: Bearer vh_xxx" \
  -H "Content-Type: application/json" \
  -d '{"title":"Release 1.2.3","is_latest":true}'
```

能访问哪些接口由 Key 的权限（scope）和项目范围决定：读接口需要 `<资源>:read`，写接口需要 `<资源>:write`，**写权限不包含读权限**。两个例外要知道：

- 创建、轮换、撤销 API Key 这类凭据管理操作只能由管理员登录后进行，不能用 API Key 调用——否则一个 Key 就能换出权限更大的 Key。
- `X-API-Key` 请求头仍然可用（老集成不受影响），但新接入建议统一用 `Authorization: Bearer`。

详见开发指南的「管理接口认证方式」。

- 为不同系统生成独立 Key，便于追踪与撤销
- 设置合理过期时间，避免长期暴露风险
- 仅授予必要权限与项目范围
- 定期轮换 Key 并监控使用情况

## 安全与审计建议

1. 定期轮换敏感凭据
2. 监控异常请求频率
3. 对关键管理操作保留审计记录
