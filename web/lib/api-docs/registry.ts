import type { ApiEndpointDoc } from "./types"
import { createEndpointSlug } from "./utils"

type EndpointSeed = Omit<ApiEndpointDoc, "id" | "slug">

const endpointsSeed: EndpointSeed[] = [
  {
    module: "Public",
    visibility: "public",
    title: "获取项目公开信息",
    description: "提供项目基础信息，通常用于客户端启动时初始化展示。",
    method: "GET",
    path: "/public/{projectKey}",
    auth: { mode: "none", description: "无需鉴权" },
    pathParams: [
      {
        name: "projectKey",
        type: "string",
        required: true,
        description: "项目标识（不区分大小写）",
        example: "verhub",
      },
    ],
    queryParams: [],
    headers: [],
    responseBody: {
      label: "200 响应",
      language: "json",
      content: `{
  "project_key": "verhub",
  "name": "Verhub",
  "description": "版本管理平台",
  "repo_url": "https://github.com/example/verhub",
  "author": "octocat",
  "author_homepage_url": "https://github.com/octocat",
  "icon_url": "https://avatars.githubusercontent.com/u/1?v=4",
  "website_url": "https://verhub.dev",
  "published_at": 1760000000
}`,
    },
  },
  {
    module: "Public",
    visibility: "public",
    title: "获取公开版本列表",
    description: "面向客户端查询某项目全部公开版本。",
    method: "GET",
    path: "/public/{projectKey}/versions",
    auth: { mode: "none", description: "无需鉴权" },
    pathParams: [
      {
        name: "projectKey",
        type: "string",
        required: true,
        description: "项目标识",
        example: "verhub",
      },
    ],
    queryParams: [
      {
        name: "limit",
        type: "number",
        required: false,
        description: "分页大小",
        example: "20",
      },
      {
        name: "offset",
        type: "number",
        required: false,
        description: "分页偏移",
        example: "0",
      },
    ],
    headers: [],
    responseBody: {
      label: "200 响应",
      language: "json",
      content: `{
  "total": 1,
  "data": [
    {
      "id": "ver-001",
      "version": "1.0.0",
      "comparable_version": "1.0.0",
      "title": "首发版本",
      "download_links": [
        {
          "url": "https://example.com/download/verhub-1.0.0.zip",
          "name": "Windows 包",
          "platform": "windows"
        }
      ],
      "is_latest": true,
      "is_preview": false,
      "milestone": "M1",
      "is_deprecated": false,
      "published_at": 1760000000
    }
  ]
}`,
    },
  },
  {
    module: "Public",
    visibility: "public",
    title: "获取最新公开版本",
    description: "用于客户端启动时快速获取最新稳定版本。",
    method: "GET",
    path: "/public/{projectKey}/versions/latest",
    auth: { mode: "none", description: "无需鉴权" },
    pathParams: [
      {
        name: "projectKey",
        type: "string",
        required: true,
        description: "项目标识",
      },
    ],
    queryParams: [],
    headers: [],
    responseBody: {
      label: "200 响应",
      language: "json",
      content: `{
  "id": "ver-001",
  "version": "1.0.0",
  "comparable_version": "1.0.0",
  "title": "首发版本",
  "is_latest": true,
  "milestone": "M1",
  "is_deprecated": false
}`,
    },
  },
  {
    module: "Public",
    visibility: "public",
    title: "获取最新 preview 版本",
    description: "用于客户端测试通道获取最新预发布版本。",
    method: "GET",
    path: "/public/{projectKey}/versions/latest-preview",
    auth: { mode: "none", description: "无需鉴权" },
    pathParams: [{ name: "projectKey", type: "string", required: true, description: "项目标识" }],
    queryParams: [],
    headers: [],
    responseBody: {
      label: "200 响应",
      language: "json",
      content: `{
  "id": "ver-preview-001",
  "version": "1.2.0-beta.2",
  "comparable_version": "1.2.0-beta.2",
  "is_latest": false,
  "is_preview": true,
  "milestone": "M2",
  "is_deprecated": false
}`,
    },
  },
  {
    module: "Public",
    visibility: "public",
    title: "按版本号获取指定版本信息",
    description: "支持根据语义化版本号读取单个版本详情。",
    method: "GET",
    path: "/public/{projectKey}/versions/by-version/{version}",
    auth: { mode: "none", description: "无需鉴权" },
    pathParams: [
      { name: "projectKey", type: "string", required: true, description: "项目标识" },
      {
        name: "version",
        type: "string",
        required: true,
        description: "语义化版本号（可 URL 编码）",
      },
    ],
    queryParams: [],
    headers: [],
    responseBody: {
      label: "200 响应",
      language: "json",
      content: `{
  "id": "ver-001",
  "version": "v1.20.326-buildA",
  "comparable_version": "1.20.326",
  "is_latest": false,
  "is_preview": false,
  "milestone": "M2",
  "is_deprecated": false
}`,
    },
  },
  {
    module: "Public",
    visibility: "public",
    title: "提交当前版本并检查更新",
    description: "返回是否有更新、是否必须更新、里程碑约束与目标版本。",
    method: "POST",
    path: "/public/{projectKey}/versions/check-update",
    auth: { mode: "none", description: "无需鉴权" },
    pathParams: [{ name: "projectKey", type: "string", required: true, description: "项目标识" }],
    queryParams: [],
    headers: [],
    requestBody: {
      label: "请求体",
      language: "json",
      content: `{
  "current_version": "v1.20.326-buildA",
  "current_comparable_version": "1.20.326",
  "include_preview": false
}`,
    },
    responseBody: {
      label: "200 响应",
      language: "json",
      content: `{
  "should_update": true,
  "required": true,
  "reason_codes": ["outside_optional_update_range", "milestone_guard"],
  "current_version": "v1.20.326-buildA",
  "current_comparable_version": "1.20.326",
  "latest_version": { "version": "2.0.0", "comparable_version": "2.0.0" },
  "latest_preview_version": null,
  "target_version": { "version": "1.99.0", "comparable_version": "1.99.0" },
  "milestone": {
    "current": "M1",
    "latest": "M2",
    "latest_in_current": { "version": "1.99.0", "comparable_version": "1.99.0" }
  }
}`,
    },
  },
  {
    module: "Public",
    visibility: "public",
    title: "获取公开公告列表",
    description: "获取可展示给终端用户的公告列表。",
    method: "GET",
    path: "/public/{projectKey}/announcements",
    auth: { mode: "none", description: "无需鉴权" },
    pathParams: [
      {
        name: "projectKey",
        type: "string",
        required: true,
        description: "项目标识",
      },
    ],
    queryParams: [
      {
        name: "limit",
        type: "number",
        required: false,
        description: "分页大小",
      },
      {
        name: "offset",
        type: "number",
        required: false,
        description: "分页偏移",
      },
    ],
    headers: [],
    responseBody: {
      label: "200 响应",
      language: "json",
      content: `{
  "total": 2,
  "data": [
    {
      "id": "ann-001",
      "title": "服务升级",
      "content": "本周六进行系统维护",
      "is_pinned": true,
      "published_at": 1760000000
    }
  ]
}`,
    },
  },
  {
    module: "Public",
    visibility: "public",
    title: "获取最新公告",
    description: "获取一条最新公告，常用于首页公告位。",
    method: "GET",
    path: "/public/{projectKey}/announcements/latest",
    auth: { mode: "none", description: "无需鉴权" },
    pathParams: [{ name: "projectKey", type: "string", required: true, description: "项目标识" }],
    queryParams: [],
    headers: [],
    responseBody: {
      label: "200 响应",
      language: "json",
      content: `{
  "id": "ann-001",
  "title": "服务升级",
  "content": "本周六进行系统维护",
  "is_pinned": true
}`,
    },
  },
  {
    module: "Public",
    visibility: "public",
    title: "提交用户反馈",
    description: "客户端提交评分与反馈内容。",
    method: "POST",
    path: "/public/{projectKey}/feedbacks",
    auth: { mode: "none", description: "无需鉴权" },
    pathParams: [{ name: "projectKey", type: "string", required: true, description: "项目标识" }],
    queryParams: [],
    headers: [],
    requestBody: {
      label: "请求体",
      language: "json",
      content: `{
  "user_id": "user-1001",
  "rating": 5,
  "content": "体验很好",
  "platform": "ios"
}`,
    },
    responseBody: {
      label: "201 响应",
      language: "json",
      content: `{
  "id": "fb-001",
  "rating": 5,
  "content": "体验很好",
  "created_at": 1760000000
}`,
    },
  },
  {
    module: "Public",
    visibility: "public",
    title: "上报日志",
    description: "客户端上报日志用于排障。",
    method: "POST",
    path: "/public/{projectKey}/logs",
    auth: { mode: "none", description: "无需鉴权" },
    pathParams: [{ name: "projectKey", type: "string", required: true, description: "项目标识" }],
    queryParams: [],
    headers: [],
    requestBody: {
      label: "请求体",
      language: "json",
      content: `{
  "level": 2,
  "content": "Network timeout",
  "device_info": {"model": "iPhone"},
  "custom_data": {"trace_id": "abc-1"}
}`,
    },
    responseBody: {
      label: "201 响应",
      language: "json",
      content: `{
  "id": "log-001",
  "level": 2,
  "created_at": 1760000000
}`,
    },
  },
  {
    module: "Public",
    visibility: "public",
    title: "上报行为记录",
    description: "客户端上报行为埋点记录。",
    method: "POST",
    path: "/public/{projectKey}/actions",
    auth: { mode: "none", description: "无需鉴权" },
    pathParams: [{ name: "projectKey", type: "string", required: true, description: "项目标识" }],
    queryParams: [],
    headers: [],
    requestBody: {
      label: "请求体",
      language: "json",
      content: `{
  "action_id": "action-open-settings",
  "http": {"user_agent": "ios"},
  "custom_data": {"from": "home"}
}`,
    },
    responseBody: {
      label: "201 响应",
      language: "json",
      content: `{
  "action_record_id": "record-001",
  "created_time": 1760000000
}`,
    },
  },
  {
    module: "Projects",
    visibility: "admin",
    title: "创建项目",
    description: "创建新的项目元数据。",
    method: "POST",
    path: "/admin/projects",
    auth: { mode: "bearer", description: "需要 Token（Authorization: Bearer <token>）" },
    pathParams: [],
    queryParams: [],
    headers: [
      { name: "Authorization", type: "string", required: true, description: "Bearer Token" },
    ],
    requestBody: {
      label: "请求体",
      language: "json",
      content: `{
  "project_key": "verhub",
  "name": "Verhub",
  "repo_url": "https://github.com/example/verhub",
  "description": "版本与公告管理",
  "author": "octocat",
  "author_homepage_url": "https://github.com/octocat",
  "icon_url": "https://avatars.githubusercontent.com/u/1?v=4",
  "website_url": "https://verhub.dev",
  "published_at": 1760000000
}`,
    },
    responseBody: {
      label: "201 响应",
      language: "json",
      content: `{
  "project_key": "verhub",
  "name": "Verhub",
  "created_at": 1760000000
}`,
    },
  },
  {
    module: "Projects",
    visibility: "admin",
    title: "删除项目",
    description: "删除项目及其关联管理数据。",
    method: "DELETE",
    path: "/admin/projects/{id}",
    auth: { mode: "bearer", description: "需要 Token（Authorization: Bearer <token>）" },
    pathParams: [
      { name: "id", type: "string", required: true, description: "项目主标识（project_key）" },
    ],
    queryParams: [],
    headers: [
      { name: "Authorization", type: "string", required: true, description: "Bearer Token" },
    ],
    responseBody: {
      label: "200 响应",
      language: "json",
      content: `{
  "success": true
}`,
    },
  },
  {
    module: "Versions",
    visibility: "admin",
    title: "创建版本",
    description: "为指定项目新增版本。",
    method: "POST",
    path: "/admin/projects/{projectKey}/versions",
    auth: { mode: "bearer", description: "需要 Token（Authorization: Bearer <token>）" },
    pathParams: [{ name: "projectKey", type: "string", required: true, description: "项目标识" }],
    queryParams: [],
    headers: [
      { name: "Authorization", type: "string", required: true, description: "Bearer Token" },
    ],
    requestBody: {
      label: "请求体",
      language: "json",
      content: `{
  "version": "1.2.0",
  "comparable_version": "1.2.0",
  "title": "性能优化",
  "content": "优化启动速度",
  "download_links": [
    {
      "url": "https://example.com/download/1.2.0.zip",
      "name": "web.zip",
      "platform": "web"
    }
  ],
  "is_latest": true,
  "is_preview": false,
  "milestone": "M2",
  "is_deprecated": false,
  "published_at": 1760000000
}`,
    },
    responseBody: {
      label: "201 响应",
      language: "json",
      content: `{
  "id": "ver-002",
  "version": "1.2.0",
  "is_latest": true,
  "published_at": 1760000000
}`,
    },
  },
  {
    module: "Versions",
    visibility: "admin",
    title: "更新版本",
    description: "修改版本字段，支持 latest/preview/published_at。",
    method: "PATCH",
    path: "/admin/projects/{projectKey}/versions/{id}",
    auth: { mode: "bearer", description: "需要 Token（Authorization: Bearer <token>）" },
    pathParams: [
      { name: "projectKey", type: "string", required: true, description: "项目标识" },
      { name: "id", type: "string", required: true, description: "版本 ID" },
    ],
    queryParams: [],
    headers: [
      { name: "Authorization", type: "string", required: true, description: "Bearer Token" },
    ],
    requestBody: {
      label: "请求体",
      language: "json",
      content: `{
  "title": "修复崩溃",
  "is_latest": true,
  "published_at": 1760000200
}`,
    },
    responseBody: {
      label: "200 响应",
      language: "json",
      content: `{
  "id": "ver-002",
  "title": "修复崩溃",
  "is_latest": true
}`,
    },
  },
  {
    module: "Versions",
    visibility: "admin",
    title: "删除版本",
    description: "删除指定版本。",
    method: "DELETE",
    path: "/admin/projects/{projectKey}/versions/{id}",
    auth: { mode: "bearer", description: "需要 Token（Authorization: Bearer <token>）" },
    pathParams: [
      { name: "projectKey", type: "string", required: true, description: "项目标识" },
      { name: "id", type: "string", required: true, description: "版本 ID" },
    ],
    queryParams: [],
    headers: [
      { name: "Authorization", type: "string", required: true, description: "Bearer Token" },
    ],
    responseBody: {
      label: "200 响应",
      language: "json",
      content: `{
  "success": true
}`,
    },
  },
  {
    module: "Announcements",
    visibility: "admin",
    title: "新增公告",
    description: "创建对外公告。",
    method: "POST",
    path: "/admin/projects/{projectKey}/announcements",
    auth: { mode: "bearer", description: "需要 Token（Authorization: Bearer <token>）" },
    pathParams: [{ name: "projectKey", type: "string", required: true, description: "项目标识" }],
    queryParams: [],
    headers: [
      { name: "Authorization", type: "string", required: true, description: "Bearer Token" },
    ],
    requestBody: {
      label: "请求体",
      language: "json",
      content: `{
  "title": "系统维护通知",
  "content": "周六凌晨维护",
  "is_pinned": true,
  "author": "ops",
  "published_at": 1760000000
}`,
    },
    responseBody: {
      label: "201 响应",
      language: "json",
      content: `{
  "id": "ann-002",
  "title": "系统维护通知",
  "is_pinned": true
}`,
    },
  },
  {
    module: "Announcements",
    visibility: "admin",
    title: "更新公告",
    description: "编辑指定公告的标题、内容、置顶状态与发布时间。",
    method: "PATCH",
    path: "/admin/projects/{projectKey}/announcements/{id}",
    auth: { mode: "bearer", description: "需要 Token（Authorization: Bearer <token>）" },
    pathParams: [
      { name: "projectKey", type: "string", required: true, description: "项目标识" },
      { name: "id", type: "string", required: true, description: "公告 ID" },
    ],
    queryParams: [],
    headers: [
      { name: "Authorization", type: "string", required: true, description: "Bearer Token" },
    ],
    requestBody: {
      label: "请求体",
      language: "json",
      content: `{
  "title": "系统维护通知（延期）",
  "content": "维护窗口改为 23:00-24:00",
  "is_pinned": false,
  "author": "ops",
  "published_at": 1760000600
}`,
    },
    responseBody: {
      label: "200 响应",
      language: "json",
      content: `{
  "id": "ann-002",
  "title": "系统维护通知（延期）",
  "is_pinned": false
}`,
    },
  },
  {
    module: "Announcements",
    visibility: "admin",
    title: "删除公告",
    description: "删除公告记录。",
    method: "DELETE",
    path: "/admin/projects/{projectKey}/announcements/{id}",
    auth: { mode: "bearer", description: "需要 Token（Authorization: Bearer <token>）" },
    pathParams: [
      { name: "projectKey", type: "string", required: true, description: "项目标识" },
      { name: "id", type: "string", required: true, description: "公告 ID" },
    ],
    queryParams: [],
    headers: [
      { name: "Authorization", type: "string", required: true, description: "Bearer Token" },
    ],
    responseBody: {
      label: "200 响应",
      language: "json",
      content: `{
  "success": true
}`,
    },
  },
  {
    module: "Feedbacks",
    visibility: "admin",
    title: "查询反馈列表",
    description: "按项目分页查询反馈。",
    method: "GET",
    path: "/admin/projects/{projectKey}/feedbacks",
    auth: { mode: "bearer", description: "需要 Token（Authorization: Bearer <token>）" },
    pathParams: [{ name: "projectKey", type: "string", required: true, description: "项目标识" }],
    queryParams: [
      { name: "limit", type: "number", required: false, description: "分页大小" },
      { name: "offset", type: "number", required: false, description: "分页偏移" },
    ],
    headers: [
      { name: "Authorization", type: "string", required: true, description: "Bearer Token" },
    ],
    responseBody: {
      label: "200 响应",
      language: "json",
      content: `{
  "total": 1,
  "data": [
    {
      "id": "fb-001",
      "rating": 5,
      "content": "体验很好",
      "created_at": 1760000000
    }
  ]
}`,
    },
  },
  {
    module: "Feedbacks",
    visibility: "admin",
    title: "编辑反馈",
    description: "编辑指定反馈内容与评分。",
    method: "PATCH",
    path: "/admin/projects/{projectKey}/feedbacks/{id}",
    auth: { mode: "bearer", description: "需要 Token（Authorization: Bearer <token>）" },
    pathParams: [
      { name: "projectKey", type: "string", required: true, description: "项目标识" },
      { name: "id", type: "string", required: true, description: "反馈 ID" },
    ],
    queryParams: [],
    headers: [
      { name: "Authorization", type: "string", required: true, description: "Bearer Token" },
    ],
    requestBody: {
      label: "请求体",
      language: "json",
      content: `{
  "rating": 4,
  "content": "已修复后体验改善",
  "platform": "web"
}`,
    },
    responseBody: {
      label: "200 响应",
      language: "json",
      content: `{
  "id": "fb-001",
  "rating": 4,
  "content": "已修复后体验改善"
}`,
    },
  },
  {
    module: "Feedbacks",
    visibility: "admin",
    title: "删除反馈",
    description: "删除指定反馈记录。",
    method: "DELETE",
    path: "/admin/projects/{projectKey}/feedbacks/{id}",
    auth: { mode: "bearer", description: "需要 Token（Authorization: Bearer <token>）" },
    pathParams: [
      { name: "projectKey", type: "string", required: true, description: "项目标识" },
      { name: "id", type: "string", required: true, description: "反馈 ID" },
    ],
    queryParams: [],
    headers: [
      { name: "Authorization", type: "string", required: true, description: "Bearer Token" },
    ],
    responseBody: {
      label: "200 响应",
      language: "json",
      content: `{
  "success": true
}`,
    },
  },
  {
    module: "Logs",
    visibility: "admin",
    title: "查询日志列表",
    description: "按项目查询日志，支持级别与时间范围筛选。",
    method: "GET",
    path: "/admin/projects/{projectKey}/logs",
    auth: { mode: "bearer", description: "需要 Token（Authorization: Bearer <token>）" },
    pathParams: [{ name: "projectKey", type: "string", required: true, description: "项目标识" }],
    queryParams: [
      { name: "limit", type: "number", required: false, description: "分页大小", example: "20" },
      { name: "offset", type: "number", required: false, description: "分页偏移", example: "0" },
      { name: "level", type: "number", required: false, description: "日志级别 0-3" },
      { name: "start_time", type: "number", required: false, description: "开始时间（Unix 秒）" },
      { name: "end_time", type: "number", required: false, description: "结束时间（Unix 秒）" },
    ],
    headers: [
      { name: "Authorization", type: "string", required: true, description: "Bearer Token" },
    ],
    responseBody: {
      label: "200 响应",
      language: "json",
      content: `{
  "total": 1,
  "data": [
    {
      "id": "log-001",
      "level": 2,
      "content": "Network timeout",
      "created_at": 1760000000
    }
  ]
}`,
    },
  },
  {
    module: "Actions",
    visibility: "admin",
    title: "查询行为定义",
    description: "按项目获取行为定义列表。",
    method: "GET",
    path: "/admin/projects/{projectKey}/actions",
    auth: { mode: "bearer", description: "需要 Token（Authorization: Bearer <token>）" },
    pathParams: [{ name: "projectKey", type: "string", required: true, description: "项目标识" }],
    queryParams: [
      { name: "limit", type: "number", required: false, description: "分页大小", example: "20" },
      { name: "offset", type: "number", required: false, description: "分页偏移", example: "0" },
    ],
    headers: [
      { name: "Authorization", type: "string", required: true, description: "Bearer Token" },
    ],
    responseBody: {
      label: "200 响应",
      language: "json",
      content: `{
  "total": 1,
  "data": [
    {
      "action_id": "action-open-settings",
      "project_key": "verhub",
      "name": "打开设置",
      "description": "用户点击设置入口"
    }
  ]
}`,
    },
  },
  {
    module: "Actions",
    visibility: "admin",
    title: "创建行为定义",
    description: "新增行为埋点定义。",
    method: "POST",
    path: "/admin/projects/actions",
    auth: { mode: "bearer", description: "需要 Token（Authorization: Bearer <token>）" },
    pathParams: [],
    queryParams: [],
    headers: [
      { name: "Authorization", type: "string", required: true, description: "Bearer Token" },
    ],
    requestBody: {
      label: "请求体",
      language: "json",
      content: `{
  "project_key": "verhub",
  "name": "打开设置",
  "description": "用户点击设置入口"
}`,
    },
    responseBody: {
      label: "201 响应",
      language: "json",
      content: `{
  "action_id": "action-open-settings",
  "project_key": "verhub",
  "name": "打开设置"
}`,
    },
  },
  {
    module: "Actions",
    visibility: "admin",
    title: "编辑行为定义",
    description: "更新行为定义名称、描述与扩展字段。",
    method: "PATCH",
    path: "/admin/actions/{action_id}",
    auth: { mode: "bearer", description: "需要 Token（Authorization: Bearer <token>）" },
    pathParams: [{ name: "action_id", type: "string", required: true, description: "行为 ID" }],
    queryParams: [],
    headers: [
      { name: "Authorization", type: "string", required: true, description: "Bearer Token" },
    ],
    requestBody: {
      label: "请求体",
      language: "json",
      content: `{
  "name": "打开设置页",
  "description": "用户点击设置入口并进入设置页"
}`,
    },
    responseBody: {
      label: "200 响应",
      language: "json",
      content: `{
  "action_id": "action-open-settings",
  "name": "打开设置页",
  "description": "用户点击设置入口并进入设置页"
}`,
    },
  },
  {
    module: "Actions",
    visibility: "admin",
    title: "删除行为定义",
    description: "删除行为定义。",
    method: "DELETE",
    path: "/admin/actions/{action_id}",
    auth: { mode: "bearer", description: "需要 Token（Authorization: Bearer <token>）" },
    pathParams: [{ name: "action_id", type: "string", required: true, description: "行为 ID" }],
    queryParams: [],
    headers: [
      { name: "Authorization", type: "string", required: true, description: "Bearer Token" },
    ],
    responseBody: {
      label: "200 响应",
      language: "json",
      content: `{
  "success": true
}`,
    },
  },
]

export const apiEndpointDocs: ApiEndpointDoc[] = endpointsSeed.map((seed) => {
  const slug = createEndpointSlug(seed.method, seed.path)

  return {
    ...seed,
    id: `${seed.method}:${seed.path}`,
    slug,
  }
})

const endpointMap = new Map(apiEndpointDocs.map((item) => [item.slug, item]))

export function listApiEndpointDocs(): ApiEndpointDoc[] {
  return apiEndpointDocs
}

export function listApiModules(): string[] {
  const modules = new Set(apiEndpointDocs.map((item) => item.module))
  return Array.from(modules)
}

export function getApiEndpointDocBySlug(slug: string): ApiEndpointDoc | undefined {
  return endpointMap.get(slug)
}
