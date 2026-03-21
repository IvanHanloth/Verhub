# 常见问题

## Q1: 启动时报数据库连接错误怎么办？

请优先检查 `packages/backend/.env` 中 `DATABASE_URL` 是否可用，并确认数据库实例已启动且账号密码正确。

## Q2: 登录后提示权限不足怎么办？

检查当前账号是否具备对应管理权限，或检查 API Key 的作用范围与权限项是否配置正确。

## Q3: 前端页面请求失败怎么办？

请确认：

- 后端服务健康可用
- 前端环境变量中 API 地址配置正确
- 反向代理路径未被误改

## Q4: Prisma 类型报错与模型不一致怎么办？

在修改 schema 后执行：

```bash
pnpm --filter @workspace/backend prisma:generate
```

然后再运行类型检查。
