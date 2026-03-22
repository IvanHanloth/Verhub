# 项目介绍

## 什么是 Verhub

Verhub 是一个自部署的统一多项目版本、公告、反馈与行为日志管理系统，建立软件从发布到回收反馈的完整闭环，帮助团队高效运营与持续改进。

## 核心能力

- 项目管理：维护项目信息，快速生成项目落地页链接
- 版本管理：维护版本信息、下载链接、发布状态（latest / preview）
- 公告管理：统一发布更新公告与通知内容
- 反馈管理：集中收集并追踪用户反馈处理进度
- 日志管理：记录关键行为事件，支持排障与审计

支持从Github快速同步项目与版本数据，提供多语言 SDK（TypeScript/Python/vanilla JS）方便集成。每个项目自带独立落地页展示项目信息、版本历史与公告内容，帮助用户快速了解项目动态。

## 演示

Verhub 项目的版本发布是基于作者部署的Verhub实例的，访问 <https://verhub.hanloth.cn> 查看该站点。
由于已经投入实际使用，不提供后台账号。如有需要请自行部署。

## 技术栈

- 前端：Next.js + React + Tailwind CSS
- 后端：NestJS
- 数据库：PostgreSQL
- ORM：Prisma
- 工程质量：TypeScript + ESLint + Prettier + Husky + lint-staged

## 文档

- 开发文档: <https://ivanhanloth.github.io/Verhub/guide/introduction>
- API 文档: <https://verhub.hanloth.cn/doc> 或自部署后访问 `/doc`查看和调试。

## 仓库结构

```text
.
├─ web/                     # 前端应用（管理后台 + 对外页面）
├─ packages/backend/        # NestJS 后端服务
├─ packages/ui/             # 共享 UI 组件
├─ sdk/                     # 多语言 SDK（TypeScript/Python/vanilla JS）
├─ doc/                     # VitePress 文档站点
└─ .github/workflows/       # CI/CD 工作流
```

## 实际应用

Verhub 已经在多个实际项目中投入使用，帮助团队高效管理版本发布与用户反馈，持续提升软件质量和用户满意度。

- [Bili23 Downloader](https://github.com/ScottSloan/Bili23-Downloader)
- [Boss Key](https://github.com/IvanHanloth/Boss-Key)
- [Verhub](https://github.com/IvanHanloth/Verhub)

## 贡献指南

1. 创建功能分支并保持单次改动聚焦
2. 提交前执行 lint / typecheck / 必要测试
3. 提交 PR 时说明变更目的、影响范围与验证步骤

仓库已启用 Husky + lint-staged，提交时会自动进行基础代码质量校验。

## 鸣谢

感谢 Github Copilot 在开发过程中提供的智能代码补全与建议，极大提升了开发效率和代码质量。

## 许可证

Apache License 2.0
