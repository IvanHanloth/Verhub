# 贡献指南

感谢你参与 Verhub 的建设。

本文档用于统一团队的 Git 分支管理、提交规范、Issue/PR 协作流程，确保前后端并行开发有序推进，且代码历史清晰、可追溯。

## 1. 核心分支策略

本项目采用分栈开发、统一合并策略，长期维护以下核心分支：

| 分支名       | 说明                                     | 权限                   |
| :----------- | :--------------------------------------- | :--------------------- |
| main         | 生产分支。仅包含稳定、可随时发布的代码。 | 仅 Git 管理员可合并    |
| frontend/dev | 前端开发集成分支。所有前端功能在此汇总。 | 前端开发者通过 PR 合并 |
| backend/dev  | 后端开发集成分支。所有后端功能在此汇总。 | 后端开发者通过 PR 合并 |
| doc/dev      | 文档开发集成分支。所有文档内容在此汇总。 | 文档开发者通过 PR 合并 |

注意：禁止直接向 main、frontend/dev、backend/dev、doc/dev 推送代码。

## 2. 分支命名规范

开发新功能或修复问题时，必须从对应的 dev 分支创建临时分支。

命名格式：scope/type/description

命名说明：

- scope：frontend 或 backend 或 doc
- type：
  - feat：新功能
  - fix：缺陷修复
  - refactor：代码重构
  - chore：配置或杂项变更
- description：简短英文描述，单词之间使用 - 连接

示例：

- frontend/feat/login-page
- backend/fix/user-api-error
- doc/chore/update-documentation

## 3. Commit 提交规范

所有提交信息必须遵循 Conventional Commits。

格式：type: subject

注意：冒号后必须有一个空格。

常用 type：

| type     | 说明                        | 示例                                      |
| :------- | :-------------------------- | :---------------------------------------- |
| feat     | 新功能                      | feat: add user profile page               |
| fix      | 修复缺陷                    | fix: resolve null pointer in auth service |
| docs     | 文档变更                    | docs: update api documentation            |
| style    | 仅样式或格式调整            | style: format code with prettier          |
| refactor | 非新增功能/非修复的代码优化 | refactor: simplify data processing logic  |
| perf     | 性能优化                    | perf: improve image loading speed         |
| test     | 测试相关                    | test: add unit tests for login component  |
| chore    | 构建、依赖或工具链变更      | chore: update npm dependencies            |

## 4. 标准开发流程

### 步骤 1：同步分支并创建工作分支

前端示例：

```bash
# 1) 切换到前端集成分支并拉取最新
git checkout frontend/dev
git pull origin frontend/dev

# 2) 创建功能分支
git checkout -b frontend/feat/my-new-feature
```

后端示例：

```bash
# 1) 切换到后端集成分支并拉取最新
git checkout backend/dev
git pull origin backend/dev

# 2) 创建功能分支
git checkout -b backend/fix/api-issue
```

### 步骤 2：开发并提交

```bash
git add .
git commit -m "feat: complete user registration form layout"
```

### 步骤 3：推送并发起 Pull Request

```bash
git push origin frontend/feat/my-new-feature
```

随后在 GitHub 创建 Pull Request：

- Source Branch：你的功能分支（如 frontend/feat/xxx）
- Target Branch：对应栈的集成分支（frontend/dev 或 backend/dev）

强制规则：

- 禁止跨栈合并（例如 frontend/\* 合并到 backend/dev）
- 禁止开发者直接向 main 发起 PR

## 5. 发布与集成（Git 管理员）

当一个迭代（Sprint）功能完成并测试通过后，由 Git 管理员执行最终集成：

1. 审核 frontend/dev 与 backend/dev 的代码质量
2. 将 frontend/dev、backend/dev 的稳定变更汇总到集成分支（如 dev）
3. 在集成分支完成最终回归测试
4. 将集成分支合并到 main，打 Tag 并发布版本

## 6. Issue 规范（固定格式）

本仓库使用 GitHub Issue Forms，Issue 必须通过模板创建，不接受自由格式 Issue。

Issue 标题规范：

- 缺陷：`[Bug] 简要描述问题`
- 需求：`[Feature] 简要描述需求`

提交 Issue 前必须确认：

- 已使用最新版本复现或验证
- 已搜索现有 Issue，确认不是重复问题
- 标题和内容符合模板要求

缺陷 Issue 必填信息：

- 系统与运行环境（OS、Node 版本、浏览器）
- 当前使用版本
- 复现步骤
- 期望行为与实际行为
- 错误日志/截图（如有）

需求 Issue 必填信息：

- 需求背景（要解决什么问题）
- 预期方案（希望增加什么能力）
- 备选方案（可选）
- 额外说明（截图、原型、链接，可选）

## 7. Pull Request 规范（固定格式）

PR 必须使用仓库模板，至少包含：

- 变更类型（feat/fix/refactor/chore/docs/test）
- 变更说明
- 影响范围（frontend/backend/docs 等）
- 验证方式与结果
- 风险与回滚方案
- UI 变更截图或录屏（如涉及界面）

## 8. 提交前检查清单

```bash
pnpm lint
pnpm typecheck
pnpm test
```

如果仅修改文档，至少确保文档站可正常构建。

自检项：

- [ ] 是否从正确的 dev 分支创建了工作分支
- [ ] 分支名是否符合 scope/type/description
- [ ] Commit Message 是否符合 type: subject
- [ ] PR 目标分支是否正确（不是 main）
