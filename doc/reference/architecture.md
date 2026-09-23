# 架构概览

## 系统分层

Verhub 采用前后端分层架构：

- 前端层：`web`（Next.js）
- 服务层：`packages/backend`（NestJS）
- 数据层：PostgreSQL + Prisma

## 关键模块

- 认证模块：管理员登录、JWT 会话、API Key
- 项目模块：项目信息与展示配置管理
- 版本模块：版本发布、下载链接、状态标签
- 公告模块：公告内容发布与查询
- 反馈模块：反馈采集与处理流转
- 日志模块：行为日志采集与检索
- 事件模块：用户行为事件采集（schema-on-write，无需预先登记）、小时汇总与漏斗/留存/路径分析
- 文件模块：本机 / WebDAV 文件存储、分片上传、GitHub Release 附件镜像，以及分发域名下不跳转、内容不可变的直链

## 文件分发链路

```
下载者 ─► CDN（分发域名）─► 网关 nginx /f/ ─► 后端 /api/v1/dist/f/... ─► 本机磁盘 / WebDAV
                               └ WebDAV 文件按 4MB 分片缓存
```

直链路径与存储内的对象路径一致，因此也可以让 CDN 跳过源站、直接回源 WebDAV（零带宽模式）。

## 典型请求链路

1. 用户在前端触发操作
2. 前端调用后端 REST API
3. 后端在服务层完成鉴权与业务校验
4. Prisma 持久化到 PostgreSQL
5. 返回结构化响应给前端

## 工程化能力

- Monorepo 管理：`pnpm` + `turbo`
- 统一规范：ESLint + Prettier + TypeScript
- 提交门禁：Husky + lint-staged

更多架构细节可参考仓库根目录 `ARCHITECTURE.md`。
