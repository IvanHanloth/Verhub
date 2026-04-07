# 更新策略与版本判定

本文档说明 Verhub 新版本策略的核心判定逻辑，以及后台如何正确配置。

## 背景

从当前版本开始，Verhub 不再以“版本级 forced 开关”作为主策略，而是采用更可控的三层规则：

- 项目级可选更新范围（optional range）
- 里程碑约束（milestone guard）
- 版本废弃机制（deprecated)

同时，版本号拆分为两类：

- `version`：语义化版本号（展示用，可保留历史风格）
- `comparable_version`：可比较版本号（规则计算用）

## 可比较版本号规范

`comparable_version` 必须匹配：

- 主版本段：`数字(.数字)*`
- 可选预发布段：`-(alpha|beta|rc)(.数字(.数字)*)?`

示例：

- 合法：`1.0.0`、`1.2.3.4`、`2.0.0-alpha`、`2.0.0-beta.3`、`2.0.0-rc.1`
- 非法：`v1.0.0`、`1.0.0-preview.1`、`1.0.x`

比较规则：

- 先比较主版本段，按 `.` 从左到右逐段比较。
- 若主版本相同，稳定版大于预发布版。
- 预发布优先级：`alpha < beta < rc`。
- 同标签下继续比较标签后的数字段。

## 更新判定逻辑

公开接口：`POST /api/v1/public/{projectKey}/versions/check-update`

输入建议：

- 优先传 `current_version`
- 若当前语义化版本无法映射或不标准，再传 `current_comparable_version`
- 若两者同时提交，服务端会优先使用 `current_comparable_version` 进行匹配与判定

输出核心字段：

- `should_update`：是否有更新动作
- `required`：是否必须更新
- `reason_codes`：判定原因数组
- `target_version`：本次建议/要求更新到的目标版本

### 判定顺序（简化）

1. 计算是否存在更高版本（可选带 preview）
2. 判断当前版本是否在项目“可选更新范围”内（范围外触发必更）
3. 判断当前版本是否为废弃版本（废弃版本有更新时必更，优先于可选范围）
4. 判断是否触发里程碑拦截（只要存在更新且当前之后有里程碑，就先升到最早里程碑版本）

## 后台配置方法

## 1. 项目管理页配置范围

在项目管理页面，设置：

- `可选更新范围下限`（optional_update_min_comparable_version）
- `可选更新范围上限`（optional_update_max_comparable_version）

注意这里需要填写的版本号应该是符合可比较版本规范的 `comparable_version`，以确保更新判定逻辑的正确执行。

行为说明：

- 当前版本在范围内：有新版本时可选更新
- 当前版本超出范围：有新版本时强制更新
- 范围下限/上限支持置空，置空后按无边界处理

## 2. 版本管理页配置版本策略

创建/编辑版本时，设置：

- `version`：展示版本号
- `comparable_version`：比较版本号
- `is_milestone`：里程碑标记（布尔），勾选后该版本将作为里程碑节点版本。
- `is_deprecated`：勾选后该版本客户端必须更新至最近里程碑版本或更高版本

强约束：

- `latest` 版本不能被标记为废弃
- 版本在标记为废弃前，必须至少存在一个更高版本，且该版本必须是非预发布、非废弃版本

建议：

- `version` 与 `comparable_version` 分离管理，避免历史命名风格影响策略判断
- 里程碑节点建议选择稳定版本，避免在预发布版本上设置

## 3. 推荐配置实践

- 每个里程碑至少有一个稳定版作为“里程碑封顶版本”
- 对高风险漏洞版本及时标记 `is_deprecated=true`
- 在 CI/CD 发布步骤中同步写入 `comparable_version`

## 模拟更新

为了帮助快速理解更新判定逻辑，管理端版本列表页提供了“模拟更新”功能，填写任意版本号或可比较版本号，即可预览针对该版本的更新判定结果。请查看版本管理页相关说明。

## 常见 reason_codes 参考

- `newer_version_available`：有更高版本可用
- `outside_optional_update_range`：当前版本不在可选更新范围内
- `current_version_deprecated`：当前版本被标记为废弃
- `milestone_guard`：触发里程碑拦截，需先升级到当前里程碑最新
