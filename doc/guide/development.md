# 开发指南

## 开发原则

- 优先保证 API 字段与前端契约一致
- 通过类型系统降低回归风险
- 每个变更都应具备可验证方式（测试、日志或手工用例）

## Monorepo 协作方式

- 根目录统一安装依赖与执行任务
- 通过 `--filter` 精确定位子包命令
- 通用配置集中在 `packages/eslint-config` 与 `packages/typescript-config`

## 常用开发命令

```bash
# 全仓开发模式
pnpm dev

# 后端测试
pnpm --filter @workspace/backend test

# 前端测试
pnpm --filter web test

# 代码格式化
pnpm format
```

## 数据库与 Prisma

常见流程：

```bash
# 生成 Prisma Client
pnpm --filter @workspace/backend prisma:generate

# 执行迁移
pnpm --filter @workspace/backend prisma:migrate
```

建议：修改 Prisma schema 后先生成客户端，再进行类型检查，避免出现误判错误。

## 代码质量门禁

仓库启用了 Husky + lint-staged。提交前会自动执行 lint 和格式化。

请在提交前主动执行：

```bash
pnpm lint
pnpm typecheck
```

## 分支与提交建议

1. 使用短生命周期功能分支
2. 单次提交聚焦一个目标
3. PR 描述中附带验证步骤与影响范围
