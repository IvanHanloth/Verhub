// 本文件由 scripts/generate-api-docs.mjs 自动生成，请勿手工编辑。
// 数据源：verhub.openapi.yaml —— 修改接口契约后执行 `pnpm api:sync` 重新生成。

import type { OpenApiDocument } from "./openapi-types"

export const openApiDocument: OpenApiDocument = {
  openapi: "3.1.0",
  info: {
    title: "Verhub API",
    version: "1.2.0",
    description:
      "Verhub 后端接口契约（与当前 NestJS Controller + DTO 保持一致）。\n基础路径统一为 /api/v1。\n",
  },
  servers: [
    {
      url: "/api/v1",
      description: "默认 API 前缀",
    },
  ],
  tags: [
    {
      name: "Health",
    },
    {
      name: "Auth",
    },
    {
      name: "Projects",
    },
    {
      name: "Versions",
    },
    {
      name: "Announcements",
    },
    {
      name: "Feedbacks",
    },
    {
      name: "Logs",
    },
    {
      name: "Actions",
    },
    {
      name: "Statistics",
    },
    {
      name: "Webhooks",
    },
    {
      name: "GitHubApp",
    },
    {
      name: "Terms",
    },
  ],
  paths: {
    "/health": {
      get: {
        tags: ["Health"],
        summary: "健康检查",
        responses: {
          "200": {
            description: "服务可用",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/HealthResponse",
                },
              },
            },
          },
        },
      },
    },
    "/auth/login": {
      post: {
        tags: ["Auth"],
        summary: "管理员登录",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/LoginDto",
              },
            },
          },
        },
        responses: {
          "201": {
            description: "登录成功",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/LoginResponse",
                },
              },
            },
          },
          "401": {
            description: "用户名或密码错误",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse",
                },
              },
            },
          },
        },
      },
    },
    "/auth/status": {
      get: {
        tags: ["Auth"],
        summary: "Auth 模块状态",
        responses: {
          "200": {
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ModuleStatusResponse",
                },
              },
            },
          },
        },
      },
    },
    "/auth/me": {
      get: {
        tags: ["Auth"],
        summary: "获取当前管理员信息",
        security: [
          {
            BearerAuth: [],
          },
        ],
        responses: {
          "200": {
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/AdminProfileResponse",
                },
              },
            },
          },
          "401": {
            $ref: "#/components/responses/Unauthorized",
          },
        },
      },
    },
    "/auth/admin-profile": {
      get: {
        tags: ["Auth"],
        summary: "获取管理员资料",
        security: [
          {
            BearerAuth: [],
          },
        ],
        responses: {
          "200": {
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/AdminProfileResponse",
                },
              },
            },
          },
          "401": {
            $ref: "#/components/responses/Unauthorized",
          },
        },
      },
      patch: {
        tags: ["Auth"],
        summary: "更新管理员资料",
        security: [
          {
            BearerAuth: [],
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/UpdateAdminProfileDto",
              },
            },
          },
        },
        responses: {
          "200": {
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/AdminProfileResponse",
                },
              },
            },
          },
          "401": {
            $ref: "#/components/responses/Unauthorized",
          },
        },
      },
    },
    "/auth/password": {
      patch: {
        tags: ["Auth"],
        summary: "修改管理员密码",
        security: [
          {
            BearerAuth: [],
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/ChangePasswordDto",
              },
            },
          },
        },
        responses: {
          "200": {
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/DeleteSuccessResponse",
                },
              },
            },
          },
          "401": {
            $ref: "#/components/responses/Unauthorized",
          },
        },
      },
    },
    "/auth/account": {
      patch: {
        tags: ["Auth"],
        summary: "修改管理员账号（用户名）",
        security: [
          {
            BearerAuth: [],
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/UpdateAdminAccountDto",
              },
            },
          },
        },
        responses: {
          "200": {
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/DeleteSuccessResponse",
                },
              },
            },
          },
          "401": {
            $ref: "#/components/responses/Unauthorized",
          },
          "409": {
            description: "用户名冲突",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse",
                },
              },
            },
          },
        },
      },
    },
    "/auth/api-scopes": {
      get: {
        tags: ["Auth"],
        summary: "获取可用的 API 作用域列表",
        security: [
          {
            BearerAuth: [],
          },
        ],
        responses: {
          "200": {
            description: "获取可用作用域列表及默认值",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ListApiScopesResponse",
                },
              },
            },
          },
          "401": {
            $ref: "#/components/responses/Unauthorized",
          },
        },
      },
    },
    "/auth/tokens": {
      get: {
        tags: ["Auth"],
        summary: "获取长期 Token 列表",
        security: [
          {
            BearerAuth: [],
          },
        ],
        responses: {
          "200": {
            content: {
              "application/json": {
                schema: {
                  type: "array",
                  items: {
                    $ref: "#/components/schemas/ApiTokenItem",
                  },
                },
              },
            },
          },
          "401": {
            $ref: "#/components/responses/Unauthorized",
          },
        },
      },
      post: {
        tags: ["Auth"],
        summary: "创建长期 Token",
        security: [
          {
            BearerAuth: [],
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/CreateApiTokenDto",
              },
            },
          },
        },
        responses: {
          "201": {
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/CreateApiTokenResponse",
                },
              },
            },
          },
          "401": {
            $ref: "#/components/responses/Unauthorized",
          },
        },
      },
    },
    "/auth/api-keys": {
      get: {
        tags: ["Auth"],
        summary: "获取长期 Token 列表（包装响应）",
        security: [
          {
            BearerAuth: [],
          },
        ],
        responses: {
          "200": {
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ApiTokenListResponse",
                },
              },
            },
          },
          "401": {
            $ref: "#/components/responses/Unauthorized",
          },
        },
      },
      post: {
        tags: ["Auth"],
        summary: "创建长期 Token（包装响应）",
        security: [
          {
            BearerAuth: [],
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/CreateApiTokenDto",
              },
            },
          },
        },
        responses: {
          "201": {
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/CreateApiTokenResponse",
                },
              },
            },
          },
          "401": {
            $ref: "#/components/responses/Unauthorized",
          },
        },
      },
    },
    "/auth/tokens/{id}": {
      parameters: [
        {
          $ref: "#/components/parameters/EntityId",
        },
      ],
      patch: {
        tags: ["Auth"],
        summary: "在线更新长期 Token（权限/范围/有效期，token 值不变）",
        security: [
          {
            BearerAuth: [],
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/UpdateApiTokenDto",
              },
            },
          },
        },
        responses: {
          "200": {
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/UpdateApiTokenResponse",
                },
              },
            },
          },
          "401": {
            $ref: "#/components/responses/Unauthorized",
          },
          "404": {
            $ref: "#/components/responses/NotFound",
          },
        },
      },
      delete: {
        tags: ["Auth"],
        summary: "撤销长期 Token",
        security: [
          {
            BearerAuth: [],
          },
        ],
        responses: {
          "200": {
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/DeleteSuccessResponse",
                },
              },
            },
          },
          "401": {
            $ref: "#/components/responses/Unauthorized",
          },
          "404": {
            $ref: "#/components/responses/NotFound",
          },
        },
      },
    },
    "/auth/tokens/{id}/rotate": {
      parameters: [
        {
          $ref: "#/components/parameters/EntityId",
        },
      ],
      post: {
        tags: ["Auth"],
        summary: "轮转长期 Token（支持旧 token 宽限期）",
        security: [
          {
            BearerAuth: [],
          },
        ],
        requestBody: {
          required: false,
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/RotateApiTokenDto",
              },
            },
          },
        },
        responses: {
          "201": {
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/RotateApiTokenResponse",
                },
              },
            },
          },
          "401": {
            $ref: "#/components/responses/Unauthorized",
          },
          "404": {
            $ref: "#/components/responses/NotFound",
          },
        },
      },
    },
    "/auth/api-keys/{id}": {
      parameters: [
        {
          $ref: "#/components/parameters/EntityId",
        },
      ],
      patch: {
        tags: ["Auth"],
        summary: "在线更新长期 Token（包装响应，token 值不变）",
        security: [
          {
            BearerAuth: [],
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/UpdateApiTokenDto",
              },
            },
          },
        },
        responses: {
          "200": {
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/UpdateApiTokenResponse",
                },
              },
            },
          },
          "401": {
            $ref: "#/components/responses/Unauthorized",
          },
          "404": {
            $ref: "#/components/responses/NotFound",
          },
        },
      },
      delete: {
        tags: ["Auth"],
        summary: "撤销长期 Token（包装响应）",
        security: [
          {
            BearerAuth: [],
          },
        ],
        responses: {
          "200": {
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/DeleteSuccessResponse",
                },
              },
            },
          },
          "401": {
            $ref: "#/components/responses/Unauthorized",
          },
          "404": {
            $ref: "#/components/responses/NotFound",
          },
        },
      },
    },
    "/auth/api-keys/{id}/rotate": {
      parameters: [
        {
          $ref: "#/components/parameters/EntityId",
        },
      ],
      post: {
        tags: ["Auth"],
        summary: "轮转长期 Token（包装响应，支持旧 token 宽限期）",
        security: [
          {
            BearerAuth: [],
          },
        ],
        requestBody: {
          required: false,
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/RotateApiTokenDto",
              },
            },
          },
        },
        responses: {
          "201": {
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/RotateApiTokenResponse",
                },
              },
            },
          },
          "401": {
            $ref: "#/components/responses/Unauthorized",
          },
          "404": {
            $ref: "#/components/responses/NotFound",
          },
        },
      },
    },
    "/admin/projects": {
      get: {
        tags: ["Projects"],
        summary: "获取项目列表",
        security: [
          {
            BearerAuth: [],
          },
          {
            ApiKeyAuth: [],
          },
        ],
        parameters: [
          {
            $ref: "#/components/parameters/Limit",
          },
          {
            $ref: "#/components/parameters/Offset",
          },
        ],
        responses: {
          "200": {
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ProjectListResponse",
                },
              },
            },
          },
          "401": {
            $ref: "#/components/responses/Unauthorized",
          },
        },
      },
      post: {
        tags: ["Projects"],
        summary: "创建项目",
        description: "创建新的项目元数据。",
        "x-verhub-doc": true,
        security: [
          {
            BearerAuth: [],
          },
          {
            ApiKeyAuth: [],
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/CreateProjectDto",
              },
            },
          },
        },
        responses: {
          "201": {
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ProjectItem",
                },
              },
            },
          },
          "401": {
            $ref: "#/components/responses/Unauthorized",
          },
          "409": {
            description: "project_key 冲突",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse",
                },
              },
            },
          },
        },
      },
    },
    "/admin/projects/statistics": {
      get: {
        tags: ["Projects"],
        summary: "获取项目统计信息",
        security: [
          {
            BearerAuth: [],
          },
          {
            ApiKeyAuth: [],
          },
        ],
        responses: {
          "200": {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["count"],
                  properties: {
                    count: {
                      type: "integer",
                    },
                  },
                },
              },
            },
          },
          "401": {
            $ref: "#/components/responses/Unauthorized",
          },
        },
      },
    },
    "/admin/projects/github-repo-preview": {
      get: {
        tags: ["Projects"],
        summary: "从 GitHub 仓库地址预览项目信息",
        security: [
          {
            BearerAuth: [],
          },
          {
            ApiKeyAuth: [],
          },
        ],
        parameters: [
          {
            name: "repo_url",
            in: "query",
            required: true,
            schema: {
              type: "string",
              format: "uri",
              maxLength: 512,
            },
          },
        ],
        responses: {
          "200": {
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/GithubRepoProjectPreview",
                },
              },
            },
          },
          "401": {
            $ref: "#/components/responses/Unauthorized",
          },
          "404": {
            $ref: "#/components/responses/NotFound",
          },
        },
      },
    },
    "/admin/projects/{projectKey}": {
      parameters: [
        {
          $ref: "#/components/parameters/ProjectKeyByPath",
        },
      ],
      get: {
        tags: ["Projects"],
        summary: "获取单个项目",
        security: [
          {
            BearerAuth: [],
          },
          {
            ApiKeyAuth: [],
          },
        ],
        responses: {
          "200": {
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ProjectItem",
                },
              },
            },
          },
          "401": {
            $ref: "#/components/responses/Unauthorized",
          },
          "404": {
            $ref: "#/components/responses/NotFound",
          },
        },
      },
      patch: {
        tags: ["Projects"],
        summary: "更新项目",
        description:
          "更新项目字段。若变更 project_key（改名），旧 key 会被自动登记为别名并继续 指向本项目——旧 key 下的内容仍可透明访问。新 key 不能与任何现有项目或别名冲突。",
        security: [
          {
            BearerAuth: [],
          },
          {
            ApiKeyAuth: [],
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/UpdateProjectDto",
              },
            },
          },
        },
        responses: {
          "200": {
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ProjectItem",
                },
              },
            },
          },
          "401": {
            $ref: "#/components/responses/Unauthorized",
          },
          "404": {
            $ref: "#/components/responses/NotFound",
          },
          "409": {
            description: "project_key 冲突",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse",
                },
              },
            },
          },
        },
      },
      delete: {
        tags: ["Projects"],
        summary: "删除项目",
        description: "删除项目及其关联管理数据。",
        "x-verhub-doc": true,
        security: [
          {
            BearerAuth: [],
          },
          {
            ApiKeyAuth: [],
          },
        ],
        responses: {
          "200": {
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/DeleteSuccessResponse",
                },
              },
            },
          },
          "401": {
            $ref: "#/components/responses/Unauthorized",
          },
          "404": {
            $ref: "#/components/responses/NotFound",
          },
        },
      },
    },
    "/admin/projects/{projectKey}/aliases": {
      parameters: [
        {
          $ref: "#/components/parameters/ProjectKeyByPath",
        },
      ],
      get: {
        tags: ["Projects"],
        summary: "列出项目别名",
        description:
          "列出该项目改名后保留的旧 Project Key（别名）。以别名访问项目的公共与 管理接口都会透明命中当前项目，别名因此是旧 key 的跳转来源。",
        "x-verhub-doc": true,
        security: [
          {
            BearerAuth: [],
          },
          {
            ApiKeyAuth: [],
          },
        ],
        responses: {
          "200": {
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ProjectAliasListResponse",
                },
              },
            },
          },
          "401": {
            $ref: "#/components/responses/Unauthorized",
          },
          "404": {
            $ref: "#/components/responses/NotFound",
          },
        },
      },
    },
    "/admin/projects/{projectKey}/aliases/{alias}": {
      parameters: [
        {
          $ref: "#/components/parameters/ProjectKeyByPath",
        },
        {
          name: "alias",
          in: "path",
          required: true,
          schema: {
            type: "string",
          },
          description: "要删除的别名（旧 Project Key）。",
        },
      ],
      delete: {
        tags: ["Projects"],
        summary: "删除项目别名",
        description:
          "删除一个别名。删除后旧 key 不再指向本项目，此后以它访问会返回 404， 且该 key 重新变为可用的 Project Key。",
        "x-verhub-doc": true,
        security: [
          {
            BearerAuth: [],
          },
          {
            ApiKeyAuth: [],
          },
        ],
        responses: {
          "200": {
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/DeleteSuccessResponse",
                },
              },
            },
          },
          "401": {
            $ref: "#/components/responses/Unauthorized",
          },
          "404": {
            $ref: "#/components/responses/NotFound",
          },
        },
      },
    },
    "/admin/projects/{projectKey}/github-webhook": {
      parameters: [
        {
          $ref: "#/components/parameters/ProjectKeyByPath",
        },
      ],
      get: {
        tags: ["Webhooks"],
        summary: "查询 GitHub Release Webhook 配置",
        description:
          "返回该项目的 GitHub Release Webhook 配置状态与需要填入 GitHub 的 Payload 路径。\n出于安全考虑只返回 secret 末 6 位提示，完整 secret 仅在设置或重新生成时返回一次。\n",
        "x-verhub-doc": true,
        security: [
          {
            BearerAuth: [],
          },
          {
            ApiKeyAuth: [],
          },
        ],
        responses: {
          "200": {
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/GithubWebhookSettings",
                },
              },
            },
          },
          "401": {
            $ref: "#/components/responses/Unauthorized",
          },
          "404": {
            $ref: "#/components/responses/NotFound",
          },
        },
      },
      put: {
        tags: ["Webhooks"],
        summary: "设置 GitHub Release Webhook Secret",
        description:
          "手动填入 secret，用于仓库上已经配置好 webhook 的场景。\n完整 secret 在本次响应中返回，之后不再可读。\n",
        "x-verhub-doc": true,
        security: [
          {
            BearerAuth: [],
          },
          {
            ApiKeyAuth: [],
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/SetGithubWebhookSecretDto",
              },
            },
          },
        },
        responses: {
          "200": {
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/GithubWebhookSecretRevealed",
                },
              },
            },
          },
          "400": {
            $ref: "#/components/responses/BadRequest",
          },
          "401": {
            $ref: "#/components/responses/Unauthorized",
          },
          "404": {
            $ref: "#/components/responses/NotFound",
          },
        },
      },
      delete: {
        tags: ["Webhooks"],
        summary: "清除 GitHub Release Webhook Secret",
        description: "清除后该项目的 webhook 接收端点会拒绝所有推送。",
        "x-verhub-doc": true,
        security: [
          {
            BearerAuth: [],
          },
          {
            ApiKeyAuth: [],
          },
        ],
        responses: {
          "200": {
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/GithubWebhookSettings",
                },
              },
            },
          },
          "401": {
            $ref: "#/components/responses/Unauthorized",
          },
          "404": {
            $ref: "#/components/responses/NotFound",
          },
        },
      },
    },
    "/admin/projects/{projectKey}/github-webhook/regenerate": {
      parameters: [
        {
          $ref: "#/components/parameters/ProjectKeyByPath",
        },
      ],
      post: {
        tags: ["Webhooks"],
        summary: "重新生成 GitHub Release Webhook Secret",
        description:
          "生成一个新的随机 secret 并覆盖原值，完整 secret 仅在本次响应中返回一次。\n旧 secret 立即失效，需要同步更新 GitHub 仓库上的 webhook 配置。\n",
        "x-verhub-doc": true,
        security: [
          {
            BearerAuth: [],
          },
          {
            ApiKeyAuth: [],
          },
        ],
        responses: {
          "200": {
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/GithubWebhookSecretRevealed",
                },
              },
            },
          },
          "401": {
            $ref: "#/components/responses/Unauthorized",
          },
          "404": {
            $ref: "#/components/responses/NotFound",
          },
        },
      },
    },
    "/webhooks/github/{projectKey}": {
      parameters: [
        {
          $ref: "#/components/parameters/ProjectKeyByPath",
        },
      ],
      post: {
        tags: ["Webhooks"],
        summary: "接收 GitHub Release Webhook 推送",
        description:
          "供 GitHub 仓库 Webhook 直接调用，不使用管理员 JWT 或 API Key，\n唯一凭据是项目上配置的 secret（`X-Hub-Signature-256` HMAC-SHA256 校验）。\n\n- 仅处理 `release` 事件的 `published` / `released` / `prereleased` / `created` / `edited` 动作\n- `deleted` / `unpublished` 不会删除已有版本，需人工在后台处理\n- 草稿（draft）release、无法解析为可比较版本号的 tag 会被跳过并返回 `ignored`\n- 版本号已存在时按 GitHub 推送内容覆盖，不存在时创建\n- 直接使用推送 payload 中的 release 数据，不再回查 GitHub API\n",
        "x-verhub-doc": true,
        security: [
          {
            GithubSignatureAuth: [],
          },
        ],
        parameters: [
          {
            name: "X-GitHub-Event",
            in: "header",
            required: true,
            description: "GitHub 事件名，仅 `release` 会触发同步，`ping` 返回 pong",
            example: "release",
            schema: {
              type: "string",
            },
          },
          {
            name: "X-GitHub-Delivery",
            in: "header",
            required: false,
            description: "GitHub 投递 ID，仅用于日志关联",
            schema: {
              type: "string",
            },
          },
        ],
        requestBody: {
          required: true,
          description: "GitHub release 事件原始负载",
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/GithubReleaseEventPayload",
              },
            },
          },
        },
        responses: {
          "200": {
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/GithubWebhookDeliveryResult",
                },
              },
            },
          },
          "401": {
            description: "签名缺失或校验失败",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse",
                },
              },
            },
          },
          "403": {
            description: "项目未配置 webhook secret",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse",
                },
              },
            },
          },
          "404": {
            $ref: "#/components/responses/NotFound",
          },
        },
      },
    },
    "/admin/github-app": {
      get: {
        tags: ["GitHubApp"],
        summary: "查询实例级 GitHub App 配置",
        description:
          "返回 GitHub App 凭据的配置状态（私钥永不回读，仅返回 SHA-256 指纹）、\n已启用的功能列表与实例级反馈转发模板。仅接受管理员 JWT，不开放给 API Key。\n",
        "x-verhub-doc": true,
        security: [
          {
            BearerAuth: [],
          },
        ],
        responses: {
          "200": {
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/GithubAppConfigView",
                },
              },
            },
          },
          "401": {
            $ref: "#/components/responses/Unauthorized",
          },
        },
      },
      put: {
        tags: ["GitHubApp"],
        summary: "更新实例级 GitHub App 配置",
        description:
          "部分更新：只修改请求中出现的字段。`private_key` / `webhook_secret` 传空字符串表示清除。\n私钥以 AES-256-GCM 加密落库，密钥派生自实例的 JWT_SECRET。\n\n各功能所需的 GitHub App 权限：\n- `feedback_issue`（反馈转发 Issue）：Repository permissions → Issues: Read and write\n- `comment_commands`（评论命令触发工作流）：Repository permissions → Actions: Read and write，\n  并在 App 设置中订阅 Issue comment 事件、配置 Webhook URL 与 secret\n",
        "x-verhub-doc": true,
        security: [
          {
            BearerAuth: [],
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/UpdateGithubAppConfigDto",
              },
            },
          },
        },
        responses: {
          "200": {
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/GithubAppConfigView",
                },
              },
            },
          },
          "400": {
            $ref: "#/components/responses/BadRequest",
          },
          "401": {
            $ref: "#/components/responses/Unauthorized",
          },
        },
      },
      delete: {
        tags: ["GitHubApp"],
        summary: "清空实例级 GitHub App 配置",
        description: "清除凭据、功能开关与模板。项目级相关开关随即失效（active=false）。",
        "x-verhub-doc": true,
        security: [
          {
            BearerAuth: [],
          },
        ],
        responses: {
          "200": {
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/GithubAppConfigView",
                },
              },
            },
          },
          "401": {
            $ref: "#/components/responses/Unauthorized",
          },
        },
      },
    },
    "/admin/projects/{projectKey}/github-integration": {
      parameters: [
        {
          $ref: "#/components/parameters/ProjectKeyByPath",
        },
      ],
      get: {
        tags: ["GitHubApp"],
        summary: "查询项目级 GitHub 集成配置",
        description:
          "返回项目的 GitHub App 功能配置。`*_active` 字段是综合实例配置得出的实际生效状态：\n项目开关打开但实例功能未启用/凭据不全时为 false。\n",
        "x-verhub-doc": true,
        security: [
          {
            BearerAuth: [],
          },
          {
            ApiKeyAuth: [],
          },
        ],
        responses: {
          "200": {
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ProjectGithubIntegrationView",
                },
              },
            },
          },
          "401": {
            $ref: "#/components/responses/Unauthorized",
          },
          "404": {
            $ref: "#/components/responses/NotFound",
          },
        },
      },
      put: {
        tags: ["GitHubApp"],
        summary: "更新项目级 GitHub 集成配置",
        description:
          "部分更新：只修改请求中出现的字段。打开某项功能要求实例级已启用对应功能且已配置仓库，\n否则返回 400。清空 `repo_full_name` 会连带关闭依赖仓库的开关。\n\n`feedback_issue_enabled` 只表示「允许转发」：是否转发由提交者在\n`POST /public/{projectKey}/feedbacks` 里用 `forward_to_github` 逐条选择。\n只有选了转发的提交才要求携带 `contact` 并受单 IP 转发限流约束。\n",
        "x-verhub-doc": true,
        security: [
          {
            BearerAuth: [],
          },
          {
            ApiKeyAuth: [],
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/UpdateProjectGithubIntegrationDto",
              },
            },
          },
        },
        responses: {
          "200": {
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ProjectGithubIntegrationView",
                },
              },
            },
          },
          "400": {
            $ref: "#/components/responses/BadRequest",
          },
          "401": {
            $ref: "#/components/responses/Unauthorized",
          },
          "404": {
            $ref: "#/components/responses/NotFound",
          },
        },
      },
    },
    "/admin/projects/{projectKey}/github-integration/repo-template": {
      parameters: [
        {
          $ref: "#/components/parameters/ProjectKeyByPath",
        },
      ],
      get: {
        tags: ["GitHubApp"],
        summary: "预览仓库中的反馈 Issue 模板",
        description:
          "按项目已保存的 `feedback_issue_template_repo_path` 拉取目标仓库里的模板文件并解析。\n文件可带 `---` front matter 声明 `title` 与 `labels`，其余内容作为正文；\n没有 front matter 时整个文件即正文，标题退回内置模板。\n\n需要 GitHub App 的 Repository permissions → Contents: Read-only 权限。\n拉取失败不会返回 4xx/5xx，而是把原因放在 `error` 字段里返回 200。\n",
        "x-verhub-doc": true,
        security: [
          {
            BearerAuth: [],
          },
          {
            ApiKeyAuth: [],
          },
        ],
        parameters: [
          {
            in: "query",
            name: "refresh",
            required: false,
            schema: {
              type: "string",
              enum: ["true", "1"],
            },
            description: "传入后先作废服务端缓存再重新拉取",
          },
        ],
        responses: {
          "200": {
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/FeedbackIssueRepoTemplatePreview",
                },
              },
            },
          },
          "401": {
            $ref: "#/components/responses/Unauthorized",
          },
          "404": {
            $ref: "#/components/responses/NotFound",
          },
        },
      },
    },
    "/webhooks/github-app": {
      post: {
        tags: ["GitHubApp"],
        summary: "接收 GitHub App 事件推送",
        description:
          "GitHub App 的实例级事件入口（配置在 App 设置的 Webhook URL）。\n以实例级 GitHub App webhook secret 做 `X-Hub-Signature-256` HMAC-SHA256 校验。\n\n当前仅消费 `issue_comment` 的 `created` 动作：评论首行形如\n`/verhub-<命令名> <参数>` 时，按仓库路由到配置了该仓库且开启评论命令的项目，\n校验评论者的 author_association / 用户白名单后触发对应 workflow_dispatch。\n",
        "x-verhub-doc": true,
        security: [
          {
            GithubSignatureAuth: [],
          },
        ],
        parameters: [
          {
            name: "X-GitHub-Event",
            in: "header",
            required: true,
            description: "GitHub 事件名，仅 `issue_comment` 会被消费，`ping` 返回 pong",
            example: "issue_comment",
            schema: {
              type: "string",
            },
          },
          {
            name: "X-GitHub-Delivery",
            in: "header",
            required: false,
            description: "GitHub 投递 ID，仅用于日志关联",
            schema: {
              type: "string",
            },
          },
        ],
        requestBody: {
          required: true,
          description: "GitHub issue_comment 事件原始负载",
          content: {
            "application/json": {
              schema: {
                type: "object",
                additionalProperties: true,
              },
            },
          },
        },
        responses: {
          "200": {
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/GithubAppWebhookResult",
                },
              },
            },
          },
          "401": {
            description: "签名缺失或校验失败",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse",
                },
              },
            },
          },
          "403": {
            description: "实例未配置 GitHub App webhook secret",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse",
                },
              },
            },
          },
        },
      },
    },
    "/admin/projects/_status": {
      get: {
        tags: ["Projects"],
        summary: "Projects 模块状态",
        security: [
          {
            BearerAuth: [],
          },
          {
            ApiKeyAuth: [],
          },
        ],
        responses: {
          "200": {
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ModuleStatusResponse",
                },
              },
            },
          },
          "401": {
            $ref: "#/components/responses/Unauthorized",
          },
        },
      },
    },
    "/admin/projects/{projectKey}/versions": {
      parameters: [
        {
          $ref: "#/components/parameters/ProjectKeyByPath",
        },
      ],
      get: {
        tags: ["Versions"],
        summary: "获取版本列表",
        security: [
          {
            BearerAuth: [],
          },
          {
            ApiKeyAuth: [],
          },
        ],
        parameters: [
          {
            $ref: "#/components/parameters/Limit",
          },
          {
            $ref: "#/components/parameters/Offset",
          },
        ],
        responses: {
          "200": {
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/VersionListResponse",
                },
              },
            },
          },
          "401": {
            $ref: "#/components/responses/Unauthorized",
          },
          "404": {
            $ref: "#/components/responses/NotFound",
          },
        },
      },
      post: {
        tags: ["Versions"],
        summary: "创建版本",
        description: "为指定项目新增版本。",
        "x-verhub-doc": true,
        security: [
          {
            BearerAuth: [],
          },
          {
            ApiKeyAuth: [],
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/CreateVersionDto",
              },
            },
          },
        },
        responses: {
          "201": {
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/VersionItem",
                },
              },
            },
          },
          "401": {
            $ref: "#/components/responses/Unauthorized",
          },
          "404": {
            $ref: "#/components/responses/NotFound",
          },
          "409": {
            description: "同项目 version 冲突",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse",
                },
              },
            },
          },
        },
      },
    },
    "/admin/projects/{projectKey}/versions/github-release-preview": {
      parameters: [
        {
          $ref: "#/components/parameters/ProjectKeyByPath",
        },
      ],
      get: {
        tags: ["Versions"],
        summary: "从 GitHub Release 预填版本草稿",
        security: [
          {
            BearerAuth: [],
          },
          {
            ApiKeyAuth: [],
          },
        ],
        parameters: [
          {
            name: "tag",
            in: "query",
            required: false,
            schema: {
              type: "string",
              maxLength: 128,
            },
          },
        ],
        responses: {
          "200": {
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/GithubReleaseVersionPreview",
                },
              },
            },
          },
          "400": {
            $ref: "#/components/responses/BadRequest",
          },
          "401": {
            $ref: "#/components/responses/Unauthorized",
          },
          "404": {
            $ref: "#/components/responses/NotFound",
          },
        },
      },
    },
    "/admin/projects/{projectKey}/versions/github-release-import": {
      parameters: [
        {
          $ref: "#/components/parameters/ProjectKeyByPath",
        },
      ],
      post: {
        tags: ["Versions"],
        summary: "从 GitHub Release 导入历史版本",
        security: [
          {
            BearerAuth: [],
          },
          {
            ApiKeyAuth: [],
          },
        ],
        responses: {
          "200": {
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/VersionImportResult",
                },
              },
            },
          },
          "400": {
            $ref: "#/components/responses/BadRequest",
          },
          "401": {
            $ref: "#/components/responses/Unauthorized",
          },
          "404": {
            $ref: "#/components/responses/NotFound",
          },
        },
      },
    },
    "/admin/projects/{projectKey}/versions/by-version/{version}": {
      parameters: [
        {
          $ref: "#/components/parameters/ProjectKeyByPath",
        },
        {
          name: "version",
          in: "path",
          required: true,
          description: "目标版本号，按 version 字段精确匹配",
          schema: {
            type: "string",
            maxLength: 64,
          },
        },
      ],
      put: {
        tags: ["Versions"],
        summary: "按版本号创建或更新版本（支持管理员 JWT 或 API Key）",
        description:
          "幂等发布端点：项目下不存在该版本号时创建，已存在则就地更新， 调用方无需先查出版本 id。API Key 需要 `versions:write` scope。\n",
        security: [
          {
            BearerAuth: [],
          },
          {
            ApiKeyAuth: [],
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/UpsertVersionDto",
              },
            },
          },
        },
        responses: {
          "200": {
            description: "已有版本被更新",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/VersionItem",
                },
              },
            },
          },
          "201": {
            description: "版本被创建",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/VersionItem",
                },
              },
            },
          },
          "400": {
            $ref: "#/components/responses/BadRequest",
          },
          "401": {
            $ref: "#/components/responses/Unauthorized",
          },
          "404": {
            $ref: "#/components/responses/NotFound",
          },
        },
      },
    },
    "/admin/projects/{projectKey}/versions/{id}": {
      parameters: [
        {
          $ref: "#/components/parameters/ProjectKeyByPath",
        },
        {
          $ref: "#/components/parameters/EntityId",
        },
      ],
      get: {
        tags: ["Versions"],
        summary: "获取单个版本",
        security: [
          {
            BearerAuth: [],
          },
          {
            ApiKeyAuth: [],
          },
        ],
        responses: {
          "200": {
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/VersionItem",
                },
              },
            },
          },
          "401": {
            $ref: "#/components/responses/Unauthorized",
          },
          "404": {
            $ref: "#/components/responses/NotFound",
          },
        },
      },
      patch: {
        tags: ["Versions"],
        summary: "更新版本",
        description: "修改版本字段，支持 latest/preview/published_at。",
        "x-verhub-doc": true,
        security: [
          {
            BearerAuth: [],
          },
          {
            ApiKeyAuth: [],
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/UpdateVersionDto",
              },
            },
          },
        },
        responses: {
          "200": {
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/VersionItem",
                },
              },
            },
          },
          "401": {
            $ref: "#/components/responses/Unauthorized",
          },
          "404": {
            $ref: "#/components/responses/NotFound",
          },
          "409": {
            description: "同项目 version 冲突",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse",
                },
              },
            },
          },
        },
      },
      delete: {
        tags: ["Versions"],
        summary: "删除版本",
        description: "删除指定版本。",
        "x-verhub-doc": true,
        security: [
          {
            BearerAuth: [],
          },
          {
            ApiKeyAuth: [],
          },
        ],
        responses: {
          "200": {
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/DeleteSuccessResponse",
                },
              },
            },
          },
          "401": {
            $ref: "#/components/responses/Unauthorized",
          },
          "404": {
            $ref: "#/components/responses/NotFound",
          },
        },
      },
    },
    "/admin/projects/{projectKey}/versions/_status": {
      parameters: [
        {
          $ref: "#/components/parameters/ProjectKeyByPath",
        },
      ],
      get: {
        tags: ["Versions"],
        summary: "Versions 模块状态",
        security: [
          {
            BearerAuth: [],
          },
          {
            ApiKeyAuth: [],
          },
        ],
        responses: {
          "200": {
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ModuleStatusResponse",
                },
              },
            },
          },
          "401": {
            $ref: "#/components/responses/Unauthorized",
          },
        },
      },
    },
    "/admin/projects/versions": {
      post: {
        tags: ["Versions"],
        summary: "通过 project_key 创建版本（兼容路径）",
        security: [
          {
            BearerAuth: [],
          },
          {
            ApiKeyAuth: [],
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/CreateProjectVersionDto",
              },
            },
          },
        },
        responses: {
          "201": {
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/VersionItem",
                },
              },
            },
          },
          "401": {
            $ref: "#/components/responses/Unauthorized",
          },
          "404": {
            $ref: "#/components/responses/NotFound",
          },
        },
      },
    },
    "/admin/versions/{version_id}": {
      parameters: [
        {
          name: "version_id",
          in: "path",
          required: true,
          schema: {
            type: "string",
          },
        },
      ],
      get: {
        tags: ["Versions"],
        summary: "按版本ID获取版本（兼容路径）",
        security: [
          {
            BearerAuth: [],
          },
          {
            ApiKeyAuth: [],
          },
        ],
        responses: {
          "200": {
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/VersionItem",
                },
              },
            },
          },
          "401": {
            $ref: "#/components/responses/Unauthorized",
          },
          "404": {
            $ref: "#/components/responses/NotFound",
          },
        },
      },
      patch: {
        tags: ["Versions"],
        summary: "按版本ID更新版本（兼容路径）",
        security: [
          {
            BearerAuth: [],
          },
          {
            ApiKeyAuth: [],
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/UpdateVersionDto",
              },
            },
          },
        },
        responses: {
          "200": {
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/VersionItem",
                },
              },
            },
          },
          "401": {
            $ref: "#/components/responses/Unauthorized",
          },
          "404": {
            $ref: "#/components/responses/NotFound",
          },
          "409": {
            description: "同项目 version 冲突",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse",
                },
              },
            },
          },
        },
      },
      delete: {
        tags: ["Versions"],
        summary: "按版本ID删除版本（兼容路径）",
        security: [
          {
            BearerAuth: [],
          },
          {
            ApiKeyAuth: [],
          },
        ],
        responses: {
          "200": {
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/DeleteSuccessResponse",
                },
              },
            },
          },
          "401": {
            $ref: "#/components/responses/Unauthorized",
          },
          "404": {
            $ref: "#/components/responses/NotFound",
          },
        },
      },
    },
    "/admin/versions/statistics": {
      get: {
        tags: ["Versions"],
        summary: "获取版本统计信息",
        security: [
          {
            BearerAuth: [],
          },
          {
            ApiKeyAuth: [],
          },
        ],
        responses: {
          "200": {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: [
                    "total_versions",
                    "total_projects",
                    "forced_versions",
                    "latest_version_time",
                    "first_version_time",
                  ],
                  properties: {
                    total_versions: {
                      type: "integer",
                    },
                    total_projects: {
                      type: "integer",
                    },
                    forced_versions: {
                      type: "integer",
                    },
                    latest_version_time: {
                      type: ["integer", "null"],
                    },
                    first_version_time: {
                      type: ["integer", "null"],
                    },
                  },
                },
              },
            },
          },
          "401": {
            $ref: "#/components/responses/Unauthorized",
          },
        },
      },
    },
    "/admin/projects/{projectKey}/announcements": {
      parameters: [
        {
          $ref: "#/components/parameters/ProjectKeyByPath",
        },
      ],
      get: {
        tags: ["Announcements"],
        summary: "获取公告列表",
        security: [
          {
            BearerAuth: [],
          },
          {
            ApiKeyAuth: [],
          },
        ],
        parameters: [
          {
            $ref: "#/components/parameters/Limit",
          },
          {
            $ref: "#/components/parameters/Offset",
          },
        ],
        responses: {
          "200": {
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/AnnouncementListResponse",
                },
              },
            },
          },
          "401": {
            $ref: "#/components/responses/Unauthorized",
          },
          "404": {
            $ref: "#/components/responses/NotFound",
          },
        },
      },
      post: {
        tags: ["Announcements"],
        summary: "新增公告",
        description: "创建对外公告。",
        "x-verhub-doc": true,
        security: [
          {
            BearerAuth: [],
          },
          {
            ApiKeyAuth: [],
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/CreateAnnouncementDto",
              },
            },
          },
        },
        responses: {
          "201": {
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/AnnouncementItem",
                },
              },
            },
          },
          "401": {
            $ref: "#/components/responses/Unauthorized",
          },
          "404": {
            $ref: "#/components/responses/NotFound",
          },
        },
      },
    },
    "/admin/projects/{projectKey}/announcements/{id}": {
      parameters: [
        {
          $ref: "#/components/parameters/ProjectKeyByPath",
        },
        {
          $ref: "#/components/parameters/EntityId",
        },
      ],
      get: {
        tags: ["Announcements"],
        summary: "获取单条公告",
        security: [
          {
            BearerAuth: [],
          },
          {
            ApiKeyAuth: [],
          },
        ],
        responses: {
          "200": {
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/AnnouncementItem",
                },
              },
            },
          },
          "401": {
            $ref: "#/components/responses/Unauthorized",
          },
          "404": {
            $ref: "#/components/responses/NotFound",
          },
        },
      },
      patch: {
        tags: ["Announcements"],
        summary: "更新公告",
        description: "编辑指定公告的标题、内容、置顶状态与发布时间。",
        "x-verhub-doc": true,
        security: [
          {
            BearerAuth: [],
          },
          {
            ApiKeyAuth: [],
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/UpdateAnnouncementDto",
              },
            },
          },
        },
        responses: {
          "200": {
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/AnnouncementItem",
                },
              },
            },
          },
          "401": {
            $ref: "#/components/responses/Unauthorized",
          },
          "404": {
            $ref: "#/components/responses/NotFound",
          },
        },
      },
      delete: {
        tags: ["Announcements"],
        summary: "删除公告",
        description: "删除公告记录。",
        "x-verhub-doc": true,
        security: [
          {
            BearerAuth: [],
          },
          {
            ApiKeyAuth: [],
          },
        ],
        responses: {
          "200": {
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/DeleteSuccessResponse",
                },
              },
            },
          },
          "401": {
            $ref: "#/components/responses/Unauthorized",
          },
          "404": {
            $ref: "#/components/responses/NotFound",
          },
        },
      },
    },
    "/admin/projects/{projectKey}/announcements/_status": {
      parameters: [
        {
          $ref: "#/components/parameters/ProjectKeyByPath",
        },
      ],
      get: {
        tags: ["Announcements"],
        summary: "Announcements 模块状态",
        security: [
          {
            BearerAuth: [],
          },
          {
            ApiKeyAuth: [],
          },
        ],
        responses: {
          "200": {
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ModuleStatusResponse",
                },
              },
            },
          },
          "401": {
            $ref: "#/components/responses/Unauthorized",
          },
        },
      },
    },
    "/admin/projects/announcements": {
      post: {
        tags: ["Announcements"],
        summary: "通过 project_key 创建公告（兼容路径）",
        security: [
          {
            BearerAuth: [],
          },
          {
            ApiKeyAuth: [],
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/CreateProjectAnnouncementDto",
              },
            },
          },
        },
        responses: {
          "201": {
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/AnnouncementItem",
                },
              },
            },
          },
          "401": {
            $ref: "#/components/responses/Unauthorized",
          },
          "404": {
            $ref: "#/components/responses/NotFound",
          },
        },
      },
    },
    "/admin/announcements/{announcement_id}": {
      parameters: [
        {
          name: "announcement_id",
          in: "path",
          required: true,
          schema: {
            type: "string",
          },
        },
      ],
      patch: {
        tags: ["Announcements"],
        summary: "按公告ID更新公告（兼容路径）",
        security: [
          {
            BearerAuth: [],
          },
          {
            ApiKeyAuth: [],
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/UpdateAnnouncementDto",
              },
            },
          },
        },
        responses: {
          "200": {
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/AnnouncementItem",
                },
              },
            },
          },
          "401": {
            $ref: "#/components/responses/Unauthorized",
          },
          "404": {
            $ref: "#/components/responses/NotFound",
          },
        },
      },
      delete: {
        tags: ["Announcements"],
        summary: "按公告ID删除公告（兼容路径）",
        security: [
          {
            BearerAuth: [],
          },
          {
            ApiKeyAuth: [],
          },
        ],
        responses: {
          "200": {
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/DeleteSuccessResponse",
                },
              },
            },
          },
          "401": {
            $ref: "#/components/responses/Unauthorized",
          },
          "404": {
            $ref: "#/components/responses/NotFound",
          },
        },
      },
    },
    "/admin/announcements/statistics": {
      get: {
        tags: ["Announcements"],
        summary: "获取公告统计信息",
        security: [
          {
            BearerAuth: [],
          },
          {
            ApiKeyAuth: [],
          },
        ],
        responses: {
          "200": {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["count", "pinned_count"],
                  properties: {
                    count: {
                      type: "integer",
                    },
                    pinned_count: {
                      type: "integer",
                    },
                  },
                },
              },
            },
          },
          "401": {
            $ref: "#/components/responses/Unauthorized",
          },
        },
      },
    },
    "/admin/projects/{projectKey}/feedbacks": {
      parameters: [
        {
          $ref: "#/components/parameters/ProjectKeyByPath",
        },
      ],
      get: {
        tags: ["Feedbacks"],
        summary: "查询反馈列表",
        description:
          "按项目分页查询反馈。默认不返回已隐藏的反馈，`include_hidden=true` 时一并返回。",
        "x-verhub-doc": true,
        security: [
          {
            BearerAuth: [],
          },
          {
            ApiKeyAuth: [],
          },
        ],
        parameters: [
          {
            $ref: "#/components/parameters/Limit",
          },
          {
            $ref: "#/components/parameters/Offset",
          },
          {
            name: "include_hidden",
            in: "query",
            required: false,
            schema: {
              type: "boolean",
              default: false,
            },
            description: "是否连已隐藏的反馈一起返回。",
          },
        ],
        responses: {
          "200": {
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/FeedbackListResponse",
                },
              },
            },
          },
          "401": {
            $ref: "#/components/responses/Unauthorized",
          },
          "404": {
            $ref: "#/components/responses/NotFound",
          },
        },
      },
      post: {
        tags: ["Feedbacks"],
        summary: "后台手动新增反馈",
        description:
          "后台补录渠道外收集到的反馈。与客户端提交端点不同：不做重复抑制，也不写入 ip / user_agent / 地理位置等来源字段（这些只在真实客户端上报时才有意义）。",
        "x-verhub-doc": true,
        security: [
          {
            BearerAuth: [],
          },
          {
            ApiKeyAuth: [],
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/CreateFeedbackDto",
              },
            },
          },
        },
        responses: {
          "201": {
            description: "创建成功",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/FeedbackItem",
                },
              },
            },
          },
          "401": {
            $ref: "#/components/responses/Unauthorized",
          },
          "404": {
            $ref: "#/components/responses/NotFound",
          },
        },
      },
    },
    "/admin/projects/{projectKey}/feedbacks/{id}": {
      parameters: [
        {
          $ref: "#/components/parameters/ProjectKeyByPath",
        },
        {
          $ref: "#/components/parameters/EntityId",
        },
      ],
      get: {
        tags: ["Feedbacks"],
        summary: "获取单条反馈",
        security: [
          {
            BearerAuth: [],
          },
          {
            ApiKeyAuth: [],
          },
        ],
        responses: {
          "200": {
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/FeedbackItem",
                },
              },
            },
          },
          "401": {
            $ref: "#/components/responses/Unauthorized",
          },
          "404": {
            $ref: "#/components/responses/NotFound",
          },
        },
      },
      patch: {
        tags: ["Feedbacks"],
        summary: "编辑反馈",
        description: "编辑指定反馈内容与评分。",
        "x-verhub-doc": true,
        security: [
          {
            BearerAuth: [],
          },
          {
            ApiKeyAuth: [],
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/UpdateFeedbackDto",
              },
            },
          },
        },
        responses: {
          "200": {
            description: "更新后的反馈",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/FeedbackItem",
                },
              },
            },
          },
          "401": {
            $ref: "#/components/responses/Unauthorized",
          },
          "404": {
            $ref: "#/components/responses/NotFound",
          },
        },
      },
      delete: {
        tags: ["Feedbacks"],
        summary: "删除反馈",
        description: "删除指定反馈记录。",
        "x-verhub-doc": true,
        security: [
          {
            BearerAuth: [],
          },
          {
            ApiKeyAuth: [],
          },
        ],
        responses: {
          "200": {
            description: "删除成功",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/DeleteSuccessResponse",
                },
              },
            },
          },
          "401": {
            $ref: "#/components/responses/Unauthorized",
          },
          "404": {
            $ref: "#/components/responses/NotFound",
          },
        },
      },
    },
    "/admin/feedbacks/statistics": {
      get: {
        tags: ["Feedbacks"],
        summary: "获取反馈统计信息",
        security: [
          {
            BearerAuth: [],
          },
          {
            ApiKeyAuth: [],
          },
        ],
        responses: {
          "200": {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["count", "rate_count", "rate_avg"],
                  properties: {
                    count: {
                      type: "integer",
                    },
                    rate_count: {
                      type: "integer",
                    },
                    rate_avg: {
                      type: ["number", "null"],
                    },
                  },
                },
              },
            },
          },
          "401": {
            $ref: "#/components/responses/Unauthorized",
          },
        },
      },
    },
    "/admin/feedbacks/{feedback_id}": {
      parameters: [
        {
          name: "feedback_id",
          in: "path",
          required: true,
          schema: {
            type: "string",
          },
        },
      ],
      patch: {
        tags: ["Feedbacks"],
        summary: "按反馈ID更新反馈（兼容路径）",
        security: [
          {
            BearerAuth: [],
          },
          {
            ApiKeyAuth: [],
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/UpdateFeedbackDto",
              },
            },
          },
        },
        responses: {
          "200": {
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/FeedbackItem",
                },
              },
            },
          },
          "401": {
            $ref: "#/components/responses/Unauthorized",
          },
          "404": {
            $ref: "#/components/responses/NotFound",
          },
        },
      },
      delete: {
        tags: ["Feedbacks"],
        summary: "按反馈ID删除反馈（兼容路径）",
        security: [
          {
            BearerAuth: [],
          },
          {
            ApiKeyAuth: [],
          },
        ],
        responses: {
          "200": {
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/DeleteSuccessResponse",
                },
              },
            },
          },
          "401": {
            $ref: "#/components/responses/Unauthorized",
          },
          "404": {
            $ref: "#/components/responses/NotFound",
          },
        },
      },
    },
    "/feedbacks/_status": {
      get: {
        tags: ["Feedbacks"],
        summary: "Feedbacks 模块状态",
        responses: {
          "200": {
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ModuleStatusResponse",
                },
              },
            },
          },
        },
      },
    },
    "/admin/terms/documents": {
      get: {
        tags: ["Terms"],
        summary: "列出条款文档设置",
        description:
          "返回全部条款文档的设置视图（含生效正文、自定义草稿与内置原文）。\n条款接口仅接受管理员 JWT，不开放给 API Key：条款是站点对外的法律声明，\n改动影响每一个访问者。\n",
        "x-verhub-doc": true,
        security: [
          {
            BearerAuth: [],
          },
        ],
        responses: {
          "200": {
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/TermsDocumentConfigListResponse",
                },
              },
            },
          },
          "401": {
            $ref: "#/components/responses/Unauthorized",
          },
        },
      },
    },
    "/admin/terms/documents/{slug}": {
      parameters: [
        {
          $ref: "#/components/parameters/TermsSlugByPath",
        },
      ],
      get: {
        tags: ["Terms"],
        summary: "查询单份条款文档设置",
        "x-verhub-doc": true,
        security: [
          {
            BearerAuth: [],
          },
        ],
        responses: {
          "200": {
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/TermsDocumentConfigView",
                },
              },
            },
          },
          "401": {
            $ref: "#/components/responses/Unauthorized",
          },
          "404": {
            $ref: "#/components/responses/NotFound",
          },
        },
      },
      put: {
        tags: ["Terms"],
        summary: "更新条款文档",
        description:
          "部分更新：只修改请求中出现的字段。`custom` 关闭时 `content` 仍会保存为草稿，\n重新打开即可继续编辑；`content` 传空字符串表示清除草稿。\n",
        "x-verhub-doc": true,
        security: [
          {
            BearerAuth: [],
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/UpdateTermsDocumentDto",
              },
            },
          },
        },
        responses: {
          "200": {
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/TermsDocumentConfigView",
                },
              },
            },
          },
          "400": {
            $ref: "#/components/responses/BadRequest",
          },
          "401": {
            $ref: "#/components/responses/Unauthorized",
          },
          "404": {
            $ref: "#/components/responses/NotFound",
          },
        },
      },
      delete: {
        tags: ["Terms"],
        summary: "恢复内置条款正文",
        description: "关闭自定义开关并丢弃草稿，前台随即回到内置正文。",
        "x-verhub-doc": true,
        security: [
          {
            BearerAuth: [],
          },
        ],
        responses: {
          "200": {
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/TermsDocumentConfigView",
                },
              },
            },
          },
          "401": {
            $ref: "#/components/responses/Unauthorized",
          },
          "404": {
            $ref: "#/components/responses/NotFound",
          },
        },
      },
    },
    "/public/terms": {
      get: {
        tags: ["Terms"],
        summary: "列出条款文档",
        description: "返回全部条款文档的标题与最后更新时间，不含正文，供前台在文档之间导航。",
        "x-verhub-doc": true,
        responses: {
          "200": {
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/TermsDocumentListResponse",
                },
              },
            },
          },
        },
      },
    },
    "/public/terms/{slug}": {
      parameters: [
        {
          $ref: "#/components/parameters/TermsSlugByPath",
        },
      ],
      get: {
        tags: ["Terms"],
        summary: "获取条款文档正文",
        description:
          "返回当前生效的正文（Markdown）。实例未自定义时返回内置正文，\n因此已登记的文档任何时候都有正文可读。\n",
        "x-verhub-doc": true,
        responses: {
          "200": {
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/TermsDocumentView",
                },
              },
            },
          },
          "404": {
            $ref: "#/components/responses/NotFound",
          },
        },
      },
    },
    "/public/{projectKey}": {
      parameters: [
        {
          $ref: "#/components/parameters/ProjectKeyByPath",
        },
        {
          $ref: "#/components/parameters/ClientPlatformHeader",
        },
        {
          $ref: "#/components/parameters/ClientPlatformVersionHeader",
        },
        {
          $ref: "#/components/parameters/ClientPlatformQuery",
        },
        {
          $ref: "#/components/parameters/ClientPlatformVersionQuery",
        },
      ],
      get: {
        tags: ["Projects"],
        summary: "获取项目公开信息",
        description: "提供项目基础信息，通常用于客户端启动时初始化展示。",
        "x-verhub-doc": true,
        responses: {
          "200": {
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ProjectItem",
                },
              },
            },
          },
          "404": {
            $ref: "#/components/responses/NotFound",
          },
        },
      },
    },
    "/public/{projectKey}/versions": {
      parameters: [
        {
          $ref: "#/components/parameters/ProjectKeyByPath",
        },
        {
          $ref: "#/components/parameters/ClientPlatformHeader",
        },
        {
          $ref: "#/components/parameters/ClientPlatformVersionHeader",
        },
        {
          $ref: "#/components/parameters/ClientPlatformQuery",
        },
        {
          $ref: "#/components/parameters/ClientPlatformVersionQuery",
        },
      ],
      get: {
        tags: ["Versions"],
        summary: "获取公开版本列表",
        description: "面向客户端查询某项目全部公开版本，按发布时间从新到旧排序。",
        "x-verhub-doc": true,
        parameters: [
          {
            $ref: "#/components/parameters/Limit",
          },
          {
            $ref: "#/components/parameters/Offset",
          },
        ],
        responses: {
          "200": {
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/VersionListResponse",
                },
              },
            },
          },
          "404": {
            $ref: "#/components/responses/NotFound",
          },
        },
      },
    },
    "/public/{projectKey}/versions/latest": {
      parameters: [
        {
          $ref: "#/components/parameters/ProjectKeyByPath",
        },
        {
          $ref: "#/components/parameters/ClientPlatformHeader",
        },
        {
          $ref: "#/components/parameters/ClientPlatformVersionHeader",
        },
        {
          $ref: "#/components/parameters/ClientPlatformQuery",
        },
        {
          $ref: "#/components/parameters/ClientPlatformVersionQuery",
        },
      ],
      get: {
        tags: ["Versions"],
        summary: "获取最新公开版本",
        description: "用于客户端启动时快速获取最新稳定版本。",
        "x-verhub-doc": true,
        responses: {
          "200": {
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/VersionItem",
                },
              },
            },
          },
          "404": {
            $ref: "#/components/responses/NotFound",
          },
        },
      },
    },
    "/public/{projectKey}/versions/latest-preview": {
      parameters: [
        {
          $ref: "#/components/parameters/ProjectKeyByPath",
        },
        {
          $ref: "#/components/parameters/ClientPlatformHeader",
        },
        {
          $ref: "#/components/parameters/ClientPlatformVersionHeader",
        },
        {
          $ref: "#/components/parameters/ClientPlatformQuery",
        },
        {
          $ref: "#/components/parameters/ClientPlatformVersionQuery",
        },
      ],
      get: {
        tags: ["Versions"],
        summary: "获取最新 preview 版本",
        description: "用于客户端测试通道获取最新预发布版本；没有预发布版本时返回 null。",
        "x-verhub-doc": true,
        responses: {
          "200": {
            content: {
              "application/json": {
                schema: {
                  oneOf: [
                    {
                      $ref: "#/components/schemas/VersionItem",
                    },
                    {
                      type: "null",
                    },
                  ],
                },
              },
            },
          },
          "404": {
            $ref: "#/components/responses/NotFound",
          },
        },
      },
    },
    "/public/{projectKey}/versions/by-version/{version}": {
      parameters: [
        {
          $ref: "#/components/parameters/ProjectKeyByPath",
        },
        {
          $ref: "#/components/parameters/ClientPlatformHeader",
        },
        {
          $ref: "#/components/parameters/ClientPlatformVersionHeader",
        },
        {
          $ref: "#/components/parameters/ClientPlatformQuery",
        },
        {
          $ref: "#/components/parameters/ClientPlatformVersionQuery",
        },
        {
          name: "version",
          in: "path",
          required: true,
          schema: {
            type: "string",
          },
          description: "语义化版本号或可比较版本号（可 URL 编码）",
        },
      ],
      get: {
        tags: ["Versions"],
        summary: "按版本号获取指定版本信息",
        description: "支持根据语义化版本号或可比较版本号读取单个版本详情。",
        "x-verhub-doc": true,
        responses: {
          "200": {
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/VersionItem",
                },
              },
            },
          },
          "404": {
            $ref: "#/components/responses/NotFound",
          },
        },
      },
    },
    "/public/{projectKey}/versions/check-update": {
      parameters: [
        {
          $ref: "#/components/parameters/ProjectKeyByPath",
        },
        {
          $ref: "#/components/parameters/ClientPlatformHeader",
        },
        {
          $ref: "#/components/parameters/ClientPlatformVersionHeader",
        },
      ],
      post: {
        tags: ["Versions"],
        summary: "提交当前版本并检查更新",
        description:
          "提交客户端当前版本，返回是否有更新、是否必须更新、里程碑约束与目标版本。 请求体须提交 current_version 与 current_comparable_version 中的至少一个： 仅提交 current_version 时依赖该版本已在服务端登记且配置了 comparable_version， 否则应改为（或同时）提交 current_comparable_version。详见 CheckVersionUpdateDto。",
        "x-verhub-doc": true,
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/CheckVersionUpdateDto",
              },
            },
          },
        },
        responses: {
          "200": {
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/CheckVersionUpdateResponse",
                },
              },
            },
          },
          "400": {
            $ref: "#/components/responses/BadRequest",
          },
          "404": {
            $ref: "#/components/responses/NotFound",
          },
        },
      },
    },
    "/public/{projectKey}/announcements": {
      parameters: [
        {
          $ref: "#/components/parameters/ProjectKeyByPath",
        },
        {
          $ref: "#/components/parameters/ClientPlatformHeader",
        },
        {
          $ref: "#/components/parameters/ClientPlatformVersionHeader",
        },
        {
          $ref: "#/components/parameters/ClientPlatformQuery",
        },
        {
          $ref: "#/components/parameters/ClientPlatformVersionQuery",
        },
      ],
      get: {
        tags: ["Announcements"],
        summary: "获取公开公告列表",
        description: "获取可展示给终端用户的公告列表。",
        "x-verhub-doc": true,
        parameters: [
          {
            $ref: "#/components/parameters/Limit",
          },
          {
            $ref: "#/components/parameters/Offset",
          },
          {
            name: "platform",
            in: "query",
            required: false,
            schema: {
              $ref: "#/components/schemas/Platform",
            },
            description: "平台过滤（仅返回该平台或全平台公告）",
          },
        ],
        responses: {
          "200": {
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/AnnouncementListResponse",
                },
              },
            },
          },
          "404": {
            $ref: "#/components/responses/NotFound",
          },
        },
      },
    },
    "/public/{projectKey}/announcements/latest": {
      parameters: [
        {
          $ref: "#/components/parameters/ProjectKeyByPath",
        },
        {
          $ref: "#/components/parameters/ClientPlatformHeader",
        },
        {
          $ref: "#/components/parameters/ClientPlatformVersionHeader",
        },
        {
          $ref: "#/components/parameters/ClientPlatformQuery",
        },
        {
          $ref: "#/components/parameters/ClientPlatformVersionQuery",
        },
      ],
      get: {
        tags: ["Announcements"],
        summary: "获取最新公告",
        description: "获取一条最新公告，常用于首页公告位。",
        "x-verhub-doc": true,
        parameters: [
          {
            name: "platform",
            in: "query",
            required: false,
            schema: {
              $ref: "#/components/schemas/Platform",
            },
            description: "平台过滤（仅返回该平台或全平台公告）",
          },
        ],
        responses: {
          "200": {
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/AnnouncementItem",
                },
              },
            },
          },
          "404": {
            $ref: "#/components/responses/NotFound",
          },
        },
      },
    },
    "/public/{projectKey}/feedbacks": {
      parameters: [
        {
          $ref: "#/components/parameters/ProjectKeyByPath",
        },
        {
          $ref: "#/components/parameters/ClientPlatformHeader",
        },
        {
          $ref: "#/components/parameters/ClientPlatformVersionHeader",
        },
      ],
      post: {
        tags: ["Feedbacks"],
        summary: "提交用户反馈",
        description:
          "客户端提交评分与反馈内容。服务端会额外记录调用方 IP、User-Agent 与解析出的地区；\n未声明 platform 时按 User-Agent 推断。短时间内（默认 60 秒，可用\nVERHUB_DEDUP_WINDOW_SECONDS 调整）同一调用方提交完全相同的内容会被判为重复提交，\n直接返回已存在的那条记录而不新建。\n\n`forward_to_github` 由提交者逐条选择，默认 false。传 true 时：\n- 项目必须已开放转发（见 `GET /public/{projectKey}/feedbacks/options`），否则 400；\n- `contact` 必填，缺失时 400（SDK 在本地就会拒绝，请求不会发出）；\n- 受单 IP 转发限流约束（默认每小时 3 次，`VERHUB_GITHUB_FORWARD_RATE_LIMIT` 可调），\n  超额返回 429；\n- Issue 建成功才记录这条反馈：GitHub 侧失败时返回 503 且服务端不留任何记录，\n  客户端可提示用户稍后重试或去掉转发再提交。\n\n转发成功的记录会带上 `forwarded_to_github`、`github_issue_number` 与\n`github_issue_url`。上述错误 SDK 均原样透传给客户端处理。\n",
        "x-verhub-doc": true,
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/CreateFeedbackDto",
              },
            },
          },
        },
        responses: {
          "201": {
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/FeedbackItem",
                },
              },
            },
          },
          "400": {
            $ref: "#/components/responses/BadRequest",
          },
          "404": {
            $ref: "#/components/responses/NotFound",
          },
          "429": {
            description: "转发请求超出单 IP 限流",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse",
                },
              },
            },
          },
          "503": {
            description: "GitHub Issue 创建失败，该反馈未被记录",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse",
                },
              },
            },
          },
        },
      },
    },
    "/public/{projectKey}/feedbacks/options": {
      parameters: [
        {
          $ref: "#/components/parameters/ProjectKeyByPath",
        },
      ],
      get: {
        tags: ["Feedbacks"],
        summary: "查询反馈提交选项",
        description:
          "客户端据此决定要不要在反馈表单里显示「转发到 GitHub Issue」的勾选框，\n以及勾选后是否把联系方式标成必填。项目未开放转发时两个字段都是 false。\n",
        "x-verhub-doc": true,
        responses: {
          "200": {
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/PublicFeedbackOptions",
                },
              },
            },
          },
          "404": {
            $ref: "#/components/responses/NotFound",
          },
        },
      },
    },
    "/admin/projects/{projectKey}/stats/requests/overview": {
      parameters: [
        {
          $ref: "#/components/parameters/ProjectKeyByPath",
        },
      ],
      get: {
        tags: ["Statistics"],
        summary: "查询接口请求统计概览",
        description:
          "按项目返回指定时间范围内的公开接口请求总数，以及按接口、平台、地区的分组汇总。未指定时间范围时默认统计最近 7 天。",
        "x-verhub-doc": true,
        security: [
          {
            BearerAuth: [],
          },
          {
            ApiKeyAuth: [],
          },
        ],
        parameters: [
          {
            $ref: "#/components/parameters/StartTime",
          },
          {
            $ref: "#/components/parameters/EndTime",
          },
        ],
        responses: {
          "200": {
            description: "统计概览",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/RequestStatsOverview",
                },
              },
            },
          },
          "400": {
            description: "参数错误（如 start_time > end_time）",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse",
                },
              },
            },
          },
          "401": {
            $ref: "#/components/responses/Unauthorized",
          },
        },
      },
    },
    "/admin/projects/{projectKey}/stats/requests/timeseries": {
      parameters: [
        {
          $ref: "#/components/parameters/ProjectKeyByPath",
        },
      ],
      get: {
        tags: ["Statistics"],
        summary: "查询接口请求时间序列",
        description:
          "按小时或按天返回请求数序列。统计始终以小时为最小粒度存储，granularity=day 时在查询阶段汇总；范围内无请求的时间桶以 0 返回，便于直接绘制曲线。granularity=day 时按 tz_offset_minutes 所指时区的午夜切分，返回的 bucket 即该本地日开始的时刻。",
        "x-verhub-doc": true,
        security: [
          {
            BearerAuth: [],
          },
          {
            ApiKeyAuth: [],
          },
        ],
        parameters: [
          {
            $ref: "#/components/parameters/StartTime",
          },
          {
            $ref: "#/components/parameters/EndTime",
          },
          {
            $ref: "#/components/parameters/TzOffsetMinutes",
          },
          {
            name: "granularity",
            in: "query",
            schema: {
              type: "string",
              enum: ["hour", "day"],
              default: "hour",
            },
          },
          {
            name: "endpoint",
            in: "query",
            description: "仅统计指定接口，省略则统计全部接口",
            schema: {
              $ref: "#/components/schemas/PublicEndpoint",
            },
          },
          {
            name: "group_by",
            in: "query",
            description:
              "额外按维度拆出多条序列（响应的 `series`），用于堆叠面积图。\n总量 `data` 不受影响，始终返回。只开放低基数的枚举维度：\n自由文本维度拆出来的序列数没有上界。\n",
            schema: {
              type: "string",
              enum: ["endpoint", "platform"],
            },
          },
        ],
        responses: {
          "200": {
            description: "请求数时间序列",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/RequestStatsTimeseries",
                },
              },
            },
          },
          "400": {
            description: "参数错误（如 start_time > end_time）",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse",
                },
              },
            },
          },
          "401": {
            $ref: "#/components/responses/Unauthorized",
          },
        },
      },
    },
    "/admin/projects/{projectKey}/stats/requests/version-adoption": {
      parameters: [
        {
          $ref: "#/components/parameters/ProjectKeyByPath",
        },
      ],
      get: {
        tags: ["Statistics"],
        summary: "查询版本采纳曲线",
        description:
          "各客户端版本的上报量随时间变化，用于看新版本推广得多快、旧版本退得多干净。只返回区间内总量最大的 limit 个版本；被截掉的尾巴不单独成序列，用 client-versions 的 total 减去各序列即可还原。",
        "x-verhub-doc": true,
        security: [
          {
            BearerAuth: [],
          },
          {
            ApiKeyAuth: [],
          },
        ],
        parameters: [
          {
            $ref: "#/components/parameters/StartTime",
          },
          {
            $ref: "#/components/parameters/EndTime",
          },
          {
            $ref: "#/components/parameters/TzOffsetMinutes",
          },
          {
            name: "granularity",
            in: "query",
            description: "聚合粒度，默认按天",
            schema: {
              type: "string",
              enum: ["hour", "day"],
              default: "day",
            },
          },
          {
            name: "limit",
            in: "query",
            description: "最多返回多少条版本序列",
            schema: {
              type: "integer",
              minimum: 1,
              maximum: 20,
              default: 6,
            },
          },
        ],
        responses: {
          "200": {
            description: "版本采纳曲线",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/VersionAdoptionStats",
                },
              },
            },
          },
          "400": {
            description: "参数错误（如 start_time > end_time）",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse",
                },
              },
            },
          },
          "401": {
            $ref: "#/components/responses/Unauthorized",
          },
        },
      },
    },
    "/admin/projects/{projectKey}/stats/logs": {
      parameters: [
        {
          $ref: "#/components/parameters/ProjectKeyByPath",
        },
      ],
      get: {
        tags: ["Statistics"],
        summary: "查询日志等级分布",
        description:
          "范围内该项目各等级的日志条数。四个等级恒定返回（含 0 条的）——「这个范围内一条 ERROR 都没有」本身就是要传达的信息。",
        "x-verhub-doc": true,
        security: [
          {
            BearerAuth: [],
          },
          {
            ApiKeyAuth: [],
          },
        ],
        parameters: [
          {
            $ref: "#/components/parameters/StartTime",
          },
          {
            $ref: "#/components/parameters/EndTime",
          },
        ],
        responses: {
          "200": {
            description: "日志等级分布",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/LogLevelStats",
                },
              },
            },
          },
          "400": {
            description: "参数错误（如 start_time > end_time）",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse",
                },
              },
            },
          },
          "401": {
            $ref: "#/components/responses/Unauthorized",
          },
        },
      },
    },
    "/admin/projects/{projectKey}/stats/feedbacks": {
      parameters: [
        {
          $ref: "#/components/parameters/ProjectKeyByPath",
        },
      ],
      get: {
        tags: ["Statistics"],
        summary: "查询反馈评分分布",
        description:
          "范围内该项目的评分直方图与平均分。档位固定 1..5，缺档也会返回 0。未打分的反馈计入 unrated，不并入任何档位：混进 1 星会让平均分变成谎话，丢掉又会让 total 对不上反馈列表条数。",
        "x-verhub-doc": true,
        security: [
          {
            BearerAuth: [],
          },
          {
            ApiKeyAuth: [],
          },
        ],
        parameters: [
          {
            $ref: "#/components/parameters/StartTime",
          },
          {
            $ref: "#/components/parameters/EndTime",
          },
        ],
        responses: {
          "200": {
            description: "反馈评分分布",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/FeedbackRatingStats",
                },
              },
            },
          },
          "400": {
            description: "参数错误（如 start_time > end_time）",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse",
                },
              },
            },
          },
          "401": {
            $ref: "#/components/responses/Unauthorized",
          },
        },
      },
    },
    "/admin/projects/{projectKey}/stats/requests/client-versions": {
      parameters: [
        {
          $ref: "#/components/parameters/ProjectKeyByPath",
        },
      ],
      get: {
        tags: ["Statistics"],
        summary: "查询客户端版本分布",
        description:
          "统计客户端调用 check-update 时上报的 current_version，按上报次数降序返回，用于判断线上最主流的版本。版本号按客户端原文记录，未发布过的版本也会如实出现。",
        "x-verhub-doc": true,
        security: [
          {
            BearerAuth: [],
          },
          {
            ApiKeyAuth: [],
          },
        ],
        parameters: [
          {
            $ref: "#/components/parameters/StartTime",
          },
          {
            $ref: "#/components/parameters/EndTime",
          },
          {
            name: "limit",
            in: "query",
            description: "最多返回多少个版本，其余计入长尾",
            schema: {
              type: "integer",
              minimum: 1,
              maximum: 100,
              default: 15,
            },
          },
        ],
        responses: {
          "200": {
            description: "客户端版本分布",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ClientVersionStats",
                },
              },
            },
          },
          "400": {
            description: "参数错误（如 start_time > end_time）",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse",
                },
              },
            },
          },
          "401": {
            $ref: "#/components/responses/Unauthorized",
          },
        },
      },
    },
    "/admin/projects/{projectKey}/stats/requests/platform-versions": {
      parameters: [
        {
          $ref: "#/components/parameters/ProjectKeyByPath",
        },
      ],
      get: {
        tags: ["Statistics"],
        summary: "查询客户端系统版本分布",
        description:
          "统计调用方的操作系统版本，按次数降序返回，用于判断还有多少用户停留在旧系统上。与「客户端版本分布」的区别：那张表回答装的是本产品哪个版本，这张回答跑在什么系统上。平台取显式声明或 User-Agent 推断，版本明细取 platform_version（也接受混写在 platform 里的形式，服务端会拆开）。未上报版本的流量落在 platform_version 为空串的桶里，照常计入 total。",
        "x-verhub-doc": true,
        security: [
          {
            BearerAuth: [],
          },
          {
            ApiKeyAuth: [],
          },
        ],
        parameters: [
          {
            $ref: "#/components/parameters/StartTime",
          },
          {
            $ref: "#/components/parameters/EndTime",
          },
          {
            name: "limit",
            in: "query",
            description: "最多返回多少个系统版本桶，其余计入长尾",
            schema: {
              type: "integer",
              minimum: 1,
              maximum: 200,
              default: 30,
            },
          },
        ],
        responses: {
          "200": {
            description: "客户端系统版本分布",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/PlatformVersionStats",
                },
              },
            },
          },
          "400": {
            description: "参数错误（如 start_time > end_time）",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse",
                },
              },
            },
          },
          "401": {
            $ref: "#/components/responses/Unauthorized",
          },
        },
      },
    },
    "/admin/projects/{projectKey}/stats/requests/heatmap": {
      parameters: [
        {
          $ref: "#/components/parameters/ProjectKeyByPath",
        },
      ],
      get: {
        tags: ["Statistics"],
        summary: "查询请求活跃度热力图",
        description:
          "把范围内的请求量折叠到「星期 × 小时」网格上，用于观察用户在其当地一周内的访问高峰时段。固定返回 168 个格子，无流量的格子为 0。折叠按每条请求的来源当地时区进行（由国家码推定，中国精确为 UTC+8，跨时区国家取代表时区近似）；tz_offset_minutes 仅作无法定位来源（UNKNOWN/LOCAL/表外国家）时的兜底，省略即按 UTC 兜底。",
        "x-verhub-doc": true,
        security: [
          {
            BearerAuth: [],
          },
          {
            ApiKeyAuth: [],
          },
        ],
        parameters: [
          {
            $ref: "#/components/parameters/StartTime",
          },
          {
            $ref: "#/components/parameters/EndTime",
          },
          {
            $ref: "#/components/parameters/TzOffsetMinutes",
          },
        ],
        responses: {
          "200": {
            description: "活跃度热力图",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/RequestStatsHeatmap",
                },
              },
            },
          },
          "400": {
            description: "参数错误（如 start_time > end_time）",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse",
                },
              },
            },
          },
          "401": {
            $ref: "#/components/responses/Unauthorized",
          },
        },
      },
    },
    "/admin/projects/{projectKey}/logs": {
      parameters: [
        {
          $ref: "#/components/parameters/ProjectKeyByPath",
        },
      ],
      get: {
        tags: ["Logs"],
        summary: "查询日志列表",
        description: "按项目查询日志，支持级别与时间范围筛选。",
        "x-verhub-doc": true,
        security: [
          {
            BearerAuth: [],
          },
          {
            ApiKeyAuth: [],
          },
        ],
        parameters: [
          {
            $ref: "#/components/parameters/Limit",
          },
          {
            $ref: "#/components/parameters/Offset",
          },
          {
            $ref: "#/components/parameters/StartTime",
          },
          {
            $ref: "#/components/parameters/EndTime",
          },
          {
            $ref: "#/components/parameters/LogLevel",
          },
        ],
        responses: {
          "200": {
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/LogListResponse",
                },
              },
            },
          },
          "400": {
            description: "参数错误（如 start_time > end_time）",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse",
                },
              },
            },
          },
          "401": {
            $ref: "#/components/responses/Unauthorized",
          },
          "404": {
            $ref: "#/components/responses/NotFound",
          },
        },
      },
      post: {
        tags: ["Logs"],
        summary: "后台手动新增日志",
        description:
          "后台补录一条日志。与客户端上报端点不同：不做重复抑制，也不写入 ip / user_agent / 地理位置等来源字段，platform 与 platform_version 由请求体显式指定。",
        "x-verhub-doc": true,
        security: [
          {
            BearerAuth: [],
          },
          {
            ApiKeyAuth: [],
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/CreateLogDto",
              },
            },
          },
        },
        responses: {
          "201": {
            description: "创建成功",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/LogItem",
                },
              },
            },
          },
          "401": {
            $ref: "#/components/responses/Unauthorized",
          },
          "404": {
            $ref: "#/components/responses/NotFound",
          },
        },
      },
    },
    "/admin/logs/statistics": {
      get: {
        tags: ["Logs"],
        summary: "获取日志统计信息",
        security: [
          {
            BearerAuth: [],
          },
          {
            ApiKeyAuth: [],
          },
        ],
        responses: {
          "200": {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["count", "debug_count", "info_count", "warning_count", "error_count"],
                  properties: {
                    count: {
                      type: "integer",
                    },
                    debug_count: {
                      type: "integer",
                    },
                    info_count: {
                      type: "integer",
                    },
                    warning_count: {
                      type: "integer",
                    },
                    error_count: {
                      type: "integer",
                    },
                  },
                },
              },
            },
          },
          "401": {
            $ref: "#/components/responses/Unauthorized",
          },
        },
      },
    },
    "/public/{projectKey}/logs": {
      parameters: [
        {
          $ref: "#/components/parameters/ProjectKeyByPath",
        },
        {
          $ref: "#/components/parameters/ClientPlatformHeader",
        },
        {
          $ref: "#/components/parameters/ClientPlatformVersionHeader",
        },
      ],
      post: {
        tags: ["Logs"],
        summary: "上报日志",
        description:
          "客户端上报日志用于排障。服务端会额外记录调用方 IP、User-Agent、由 UA 推断的平台与解析出的地区。短时间内（默认 60 秒，可用 VERHUB_DEDUP_WINDOW_SECONDS 调整）同一调用方上报完全相同的日志会被判为重复上报，直接返回已存在的那条记录而不新建——崩溃重试循环因此不会淹没列表。",
        "x-verhub-doc": true,
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/UploadLogDto",
              },
            },
          },
        },
        responses: {
          "201": {
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/LogItem",
                },
              },
            },
          },
          "400": {
            description: "参数错误（如非法日志级别）",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse",
                },
              },
            },
          },
          "404": {
            $ref: "#/components/responses/NotFound",
          },
        },
      },
    },
    "/logs/_status": {
      get: {
        tags: ["Logs"],
        summary: "Logs 模块状态",
        responses: {
          "200": {
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ModuleStatusResponse",
                },
              },
            },
          },
        },
      },
    },
    "/admin/projects/{projectKey}/actions": {
      parameters: [
        {
          $ref: "#/components/parameters/ProjectKeyByPath",
        },
      ],
      get: {
        tags: ["Actions"],
        summary: "查询行为定义",
        description: "按项目获取行为定义列表。",
        "x-verhub-doc": true,
        security: [
          {
            BearerAuth: [],
          },
          {
            ApiKeyAuth: [],
          },
        ],
        parameters: [
          {
            $ref: "#/components/parameters/Limit",
          },
          {
            $ref: "#/components/parameters/Offset",
          },
        ],
        responses: {
          "200": {
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ActionListResponse",
                },
              },
            },
          },
          "401": {
            $ref: "#/components/responses/Unauthorized",
          },
          "404": {
            $ref: "#/components/responses/NotFound",
          },
        },
      },
    },
    "/admin/projects/actions": {
      post: {
        tags: ["Actions"],
        summary: "创建行为定义",
        description: "新增行为埋点定义。",
        "x-verhub-doc": true,
        security: [
          {
            BearerAuth: [],
          },
          {
            ApiKeyAuth: [],
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/CreateActionDto",
              },
            },
          },
        },
        responses: {
          "201": {
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ActionItem",
                },
              },
            },
          },
          "401": {
            $ref: "#/components/responses/Unauthorized",
          },
          "404": {
            $ref: "#/components/responses/NotFound",
          },
        },
      },
    },
    "/admin/actions/{action_id}": {
      parameters: [
        {
          name: "action_id",
          in: "path",
          required: true,
          schema: {
            type: "string",
          },
        },
      ],
      get: {
        tags: ["Actions"],
        summary: "获取行为分类下的行为记录",
        security: [
          {
            BearerAuth: [],
          },
          {
            ApiKeyAuth: [],
          },
        ],
        parameters: [
          {
            $ref: "#/components/parameters/Limit",
          },
          {
            $ref: "#/components/parameters/Offset",
          },
        ],
        responses: {
          "200": {
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ActionRecordListResponse",
                },
              },
            },
          },
          "401": {
            $ref: "#/components/responses/Unauthorized",
          },
          "404": {
            $ref: "#/components/responses/NotFound",
          },
        },
      },
      patch: {
        tags: ["Actions"],
        summary: "编辑行为定义",
        description: "更新行为定义名称、描述与扩展字段。",
        "x-verhub-doc": true,
        security: [
          {
            BearerAuth: [],
          },
          {
            ApiKeyAuth: [],
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/UpdateActionDto",
              },
            },
          },
        },
        responses: {
          "200": {
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ActionItem",
                },
              },
            },
          },
          "401": {
            $ref: "#/components/responses/Unauthorized",
          },
          "404": {
            $ref: "#/components/responses/NotFound",
          },
        },
      },
      delete: {
        tags: ["Actions"],
        summary: "删除行为定义",
        description: "删除行为定义。",
        "x-verhub-doc": true,
        security: [
          {
            BearerAuth: [],
          },
          {
            ApiKeyAuth: [],
          },
        ],
        responses: {
          "200": {
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/DeleteSuccessResponse",
                },
              },
            },
          },
          "401": {
            $ref: "#/components/responses/Unauthorized",
          },
          "404": {
            $ref: "#/components/responses/NotFound",
          },
        },
      },
    },
    "/admin/actions/record/{action_record_id}": {
      parameters: [
        {
          name: "action_record_id",
          in: "path",
          required: true,
          schema: {
            type: "string",
          },
        },
      ],
      get: {
        tags: ["Actions"],
        summary: "获取单条行为记录",
        security: [
          {
            BearerAuth: [],
          },
          {
            ApiKeyAuth: [],
          },
        ],
        responses: {
          "200": {
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ActionRecordItem",
                },
              },
            },
          },
          "401": {
            $ref: "#/components/responses/Unauthorized",
          },
          "404": {
            $ref: "#/components/responses/NotFound",
          },
        },
      },
    },
    "/admin/actions/statistics": {
      get: {
        tags: ["Actions"],
        summary: "获取行为分类统计",
        security: [
          {
            BearerAuth: [],
          },
          {
            ApiKeyAuth: [],
          },
        ],
        responses: {
          "200": {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["count"],
                  properties: {
                    count: {
                      type: "integer",
                    },
                  },
                },
              },
            },
          },
          "401": {
            $ref: "#/components/responses/Unauthorized",
          },
        },
      },
    },
    "/admin/actions/record/statistics": {
      get: {
        tags: ["Actions"],
        summary: "获取行为记录统计",
        security: [
          {
            BearerAuth: [],
          },
          {
            ApiKeyAuth: [],
          },
        ],
        responses: {
          "200": {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["count"],
                  properties: {
                    count: {
                      type: "integer",
                    },
                  },
                },
              },
            },
          },
          "401": {
            $ref: "#/components/responses/Unauthorized",
          },
        },
      },
    },
    "/public/{projectKey}/actions": {
      parameters: [
        {
          $ref: "#/components/parameters/ProjectKeyByPath",
        },
        {
          $ref: "#/components/parameters/ClientPlatformHeader",
        },
        {
          $ref: "#/components/parameters/ClientPlatformVersionHeader",
        },
      ],
      post: {
        tags: ["Actions"],
        summary: "上报行为记录",
        description:
          "客户端上报行为埋点记录。服务端会额外记录调用方 IP、User-Agent、平台与解析出的地区。短时间内（默认 60 秒，可用 VERHUB_DEDUP_WINDOW_SECONDS 调整）同一调用方上报同一 action 且 custom_data 完全相同会被判为重复上报，直接返回已存在的那条记录而不新建。",
        "x-verhub-doc": true,
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/CreateActionRecordDto",
              },
            },
          },
        },
        responses: {
          "201": {
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ActionRecordItem",
                },
              },
            },
          },
          "404": {
            $ref: "#/components/responses/NotFound",
          },
        },
      },
    },
    "/actions/_status": {
      get: {
        tags: ["Actions"],
        summary: "Actions 模块状态",
        responses: {
          "200": {
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ModuleStatusResponse",
                },
              },
            },
          },
        },
      },
    },
  },
  components: {
    securitySchemes: {
      BearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
        description:
          "Authorization: Bearer <凭据>。管理员 JWT（POST /auth/login 获取，默认 2 小时过期） 与 API Key（vh_ 前缀，长期有效）在所有 /admin/* 接口上等价，任一有效即放行； 服务端按凭据形态自动识别。/auth/* 下的凭据管理接口只接受管理员 JWT。\n",
      },
      ApiKeyAuth: {
        type: "apiKey",
        in: "header",
        name: "x-api-key",
        description:
          "传 API Key 的兼容别名，等价于把同一个 Key 放进 Authorization: Bearer； 新接入建议统一用 BearerAuth。API Key 按 scope 授权：读接口需要 <资源>:read， 写接口需要 <资源>:write，写权限不隐含读权限；资源为 projects / versions / announcements / feedbacks / logs / actions，另有 stats:read 用于请求统计接口。 scope 或项目范围不匹配返回 401。\n",
      },
      GithubSignatureAuth: {
        type: "apiKey",
        in: "header",
        name: "X-Hub-Signature-256",
        description:
          "GitHub Webhook 的 HMAC-SHA256 签名，形如 sha256=<hex>，密钥是项目上配置的 webhook secret。签名覆盖请求体原始字节，服务端按原样字节重算比对， 因此代理层不得改写请求体。这是 webhook 接收端点唯一的凭据， 不接受管理员 JWT 或 API Key。\n",
      },
    },
    parameters: {
      Limit: {
        name: "limit",
        in: "query",
        required: false,
        description: "分页大小",
        example: 20,
        schema: {
          type: "integer",
          minimum: 1,
          maximum: 100,
          default: 20,
        },
      },
      Offset: {
        name: "offset",
        in: "query",
        required: false,
        description: "分页偏移",
        example: 0,
        schema: {
          type: "integer",
          minimum: 0,
          default: 0,
        },
      },
      ProjectKeyByPath: {
        name: "projectKey",
        in: "path",
        required: true,
        description: "项目主键 project_key（大小写不敏感）",
        example: "verhub",
        schema: {
          type: "string",
        },
      },
      TermsSlugByPath: {
        name: "slug",
        in: "path",
        required: true,
        description: "条款文档标识，取值见 TermsDocumentSlug",
        example: "privacy-policy",
        schema: {
          $ref: "#/components/schemas/TermsDocumentSlug",
        },
      },
      ClientPlatformHeader: {
        name: "x-verhub-platform",
        in: "header",
        required: false,
        description:
          "客户端平台声明，仅用于请求统计，不影响接口返回内容。\n识别优先级：本请求头 > query 参数 `platform` > 请求体 `platform` 字段 > User-Agent 推断。\n取值大小写不敏感，无法识别时统计为 OTHERS。\n具体系统版本请用 `x-verhub-platform-version` 单独提交；若把版本混在本字段里\n（如 `Windows 11`、`ubuntu 24.04`），服务端会拆开，平台与版本分别入库。\n建议 SDK 显式声明本请求头：服务端调用的 User-Agent 往往不可靠。\n",
        example: "windows",
        schema: {
          $ref: "#/components/schemas/Platform",
        },
      },
      ClientPlatformVersionHeader: {
        name: "x-verhub-platform-version",
        in: "header",
        required: false,
        description:
          "客户端系统版本明细，仅用于请求统计，不影响接口返回内容。\n自由文本，如 `11`、`ubuntu 24.04`、`26`；超过 32 字符视为无效直接丢弃。\n识别优先级：本请求头 > query 参数 `platform_version` > 请求体 `platform_version`\n字段 > 从 `platform` 中拆出的版本 > User-Agent 推断。\n",
        example: "11",
        schema: {
          type: "string",
          maxLength: 32,
        },
      },
      ClientPlatformQuery: {
        name: "platform",
        in: "query",
        required: false,
        description:
          "客户端平台声明（等价于 `x-verhub-platform` 请求头，优先级低于请求头）。\n仅用于请求统计，不影响接口返回内容。\n",
        schema: {
          $ref: "#/components/schemas/Platform",
        },
      },
      ClientPlatformVersionQuery: {
        name: "platform_version",
        in: "query",
        required: false,
        description:
          "客户端系统版本明细（等价于 `x-verhub-platform-version` 请求头，优先级低于请求头）。\n仅用于请求统计，不影响接口返回内容。\n",
        schema: {
          type: "string",
          maxLength: 32,
        },
      },
      EntityId: {
        name: "id",
        in: "path",
        required: true,
        description: "记录主键 id",
        example: "ver-001",
        schema: {
          type: "string",
        },
      },
      StartTime: {
        name: "start_time",
        in: "query",
        required: false,
        schema: {
          type: "integer",
          minimum: 0,
        },
        description: "Unix 时间戳（秒）",
        example: 1760000000,
      },
      EndTime: {
        name: "end_time",
        in: "query",
        required: false,
        schema: {
          type: "integer",
          minimum: 0,
        },
        description: "Unix 时间戳（秒）",
        example: 1762000000,
      },
      TzOffsetMinutes: {
        name: "tz_offset_minutes",
        in: "query",
        required: false,
        schema: {
          type: "integer",
          minimum: -840,
          maximum: 900,
          default: 0,
        },
        description:
          "相对 UTC 的分钟偏移，即浏览器的 `-new Date().getTimezoneOffset()`。\n统计桶按 UTC 小时存储，但「几点最忙」问的是受众的墙上时间，因此\n「星期 × 小时」与「按天」的折叠都以该偏移为准。省略时为 0（等同 UTC）。\n",
        example: 480,
      },
      LogLevel: {
        name: "level",
        in: "query",
        required: false,
        schema: {
          type: "integer",
          minimum: 0,
          maximum: 3,
        },
        description: "0=debug, 1=info, 2=warn, 3=error",
      },
    },
    responses: {
      Unauthorized: {
        description: "未认证或令牌非法",
        content: {
          "application/json": {
            schema: {
              $ref: "#/components/schemas/ErrorResponse",
            },
          },
        },
      },
      NotFound: {
        description: "资源不存在",
        content: {
          "application/json": {
            schema: {
              $ref: "#/components/schemas/ErrorResponse",
            },
          },
        },
      },
      BadRequest: {
        description: "请求参数错误",
        content: {
          "application/json": {
            schema: {
              $ref: "#/components/schemas/ErrorResponse",
            },
          },
        },
      },
    },
    schemas: {
      ModuleStatusResponse: {
        type: "object",
        required: ["module", "implemented"],
        properties: {
          module: {
            type: "string",
          },
          implemented: {
            type: "boolean",
          },
        },
        example: {
          module: "versions",
          implemented: true,
        },
      },
      DeleteSuccessResponse: {
        type: "object",
        required: ["success"],
        properties: {
          success: {
            type: "boolean",
          },
        },
        example: {
          success: true,
        },
      },
      HealthResponse: {
        type: "object",
        required: ["status", "timestamp"],
        properties: {
          status: {
            type: "string",
            example: "ok",
          },
          timestamp: {
            type: "integer",
            format: "int64",
          },
        },
        example: {
          status: "ok",
          timestamp: 1760000000,
        },
      },
      ErrorResponse: {
        type: "object",
        properties: {
          statusCode: {
            type: "integer",
          },
          message: {
            oneOf: [
              {
                type: "string",
              },
              {
                type: "array",
                items: {
                  type: "string",
                },
              },
            ],
          },
          error: {
            type: "string",
          },
        },
      },
      LoginDto: {
        type: "object",
        required: ["username", "password"],
        properties: {
          username: {
            type: "string",
            maxLength: 64,
          },
          password: {
            type: "string",
            minLength: 6,
            maxLength: 128,
          },
        },
      },
      LoginResponse: {
        type: "object",
        required: ["access_token", "expires_in", "user"],
        properties: {
          access_token: {
            type: "string",
          },
          expires_in: {
            type: "integer",
            description: "JWT 剩余秒数",
          },
          user: {
            $ref: "#/components/schemas/AuthUser",
          },
        },
      },
      AuthUser: {
        type: "object",
        required: ["id", "username", "role", "must_change_password"],
        properties: {
          id: {
            type: "string",
          },
          username: {
            type: "string",
            maxLength: 64,
          },
          role: {
            type: "string",
            enum: ["ADMIN"],
          },
          must_change_password: {
            type: "boolean",
          },
        },
      },
      AdminProfileResponse: {
        $ref: "#/components/schemas/AuthUser",
      },
      UpdateAdminProfileDto: {
        type: "object",
        required: ["current_password"],
        properties: {
          current_password: {
            type: "string",
            minLength: 6,
            maxLength: 128,
          },
          username: {
            type: "string",
            maxLength: 64,
          },
          new_password: {
            type: "string",
            minLength: 6,
            maxLength: 128,
          },
        },
      },
      ChangePasswordDto: {
        type: "object",
        required: ["current_password", "new_password"],
        properties: {
          current_password: {
            type: "string",
            minLength: 6,
            maxLength: 128,
          },
          new_password: {
            type: "string",
            minLength: 6,
            maxLength: 128,
          },
        },
      },
      UpdateAdminAccountDto: {
        type: "object",
        required: ["current_password", "username"],
        properties: {
          current_password: {
            type: "string",
            minLength: 6,
            maxLength: 128,
          },
          username: {
            type: "string",
            maxLength: 64,
          },
        },
      },
      CreateApiTokenDto: {
        type: "object",
        required: ["name"],
        properties: {
          name: {
            type: "string",
            maxLength: 64,
          },
          scopes: {
            type: "array",
            items: {
              type: "string",
              maxLength: 64,
            },
          },
          expires_in_days: {
            type: "integer",
            minimum: 1,
            maximum: 365,
          },
          never_expires: {
            type: "boolean",
            default: false,
          },
          all_projects: {
            type: "boolean",
            default: true,
          },
          project_ids: {
            type: "array",
            items: {
              type: "string",
            },
          },
        },
      },
      ApiTokenListResponse: {
        type: "object",
        required: ["data"],
        properties: {
          data: {
            type: "array",
            items: {
              $ref: "#/components/schemas/ApiTokenItem",
            },
          },
        },
      },
      ApiTokenItem: {
        type: "object",
        required: [
          "id",
          "name",
          "scopes",
          "all_projects",
          "project_ids",
          "is_active",
          "created_at",
          "expires_at",
          "revoked_at",
          "last_used_at",
        ],
        properties: {
          id: {
            type: "string",
          },
          name: {
            type: "string",
          },
          scopes: {
            type: "array",
            items: {
              type: "string",
            },
          },
          all_projects: {
            type: "boolean",
          },
          project_ids: {
            type: "array",
            items: {
              type: "string",
            },
          },
          is_active: {
            type: "boolean",
          },
          created_at: {
            type: "integer",
            format: "int64",
          },
          expires_at: {
            type: ["integer", "null"],
            format: "int64",
          },
          revoked_at: {
            type: ["integer", "null"],
            format: "int64",
          },
          last_used_at: {
            type: ["integer", "null"],
            format: "int64",
          },
          previous_key_expires_at: {
            type: ["integer", "null"],
            format: "int64",
          },
        },
      },
      CreateApiTokenResponse: {
        type: "object",
        required: [
          "id",
          "name",
          "token",
          "scopes",
          "all_projects",
          "project_ids",
          "expires_at",
          "created_at",
        ],
        properties: {
          id: {
            type: "string",
          },
          name: {
            type: "string",
          },
          token: {
            type: "string",
          },
          scopes: {
            type: "array",
            items: {
              type: "string",
            },
          },
          all_projects: {
            type: "boolean",
          },
          project_ids: {
            type: "array",
            items: {
              type: "string",
            },
          },
          expires_at: {
            type: ["integer", "null"],
            format: "int64",
          },
          created_at: {
            type: "integer",
            format: "int64",
          },
        },
      },
      UpdateApiTokenDto: {
        type: "object",
        properties: {
          name: {
            type: "string",
            maxLength: 64,
          },
          scopes: {
            type: "array",
            items: {
              type: "string",
              maxLength: 64,
            },
          },
          expires_in_days: {
            type: "integer",
            minimum: 1,
            maximum: 365,
          },
          never_expires: {
            type: "boolean",
          },
          all_projects: {
            type: "boolean",
          },
          project_ids: {
            type: "array",
            items: {
              type: "string",
            },
          },
        },
      },
      UpdateApiTokenResponse: {
        type: "object",
        required: [
          "id",
          "name",
          "scopes",
          "all_projects",
          "project_ids",
          "expires_at",
          "created_at",
        ],
        properties: {
          id: {
            type: "string",
          },
          name: {
            type: "string",
          },
          scopes: {
            type: "array",
            items: {
              type: "string",
            },
          },
          all_projects: {
            type: "boolean",
          },
          project_ids: {
            type: "array",
            items: {
              type: "string",
            },
          },
          expires_at: {
            type: ["integer", "null"],
            format: "int64",
          },
          created_at: {
            type: "integer",
            format: "int64",
          },
        },
      },
      RotateApiTokenDto: {
        type: "object",
        properties: {
          grace_period_minutes: {
            type: "integer",
            minimum: 0,
            maximum: 10080,
          },
        },
      },
      RotateApiTokenResponse: {
        type: "object",
        required: ["id", "token", "grace_period_minutes", "previous_key_expires_at"],
        properties: {
          id: {
            type: "string",
          },
          token: {
            type: "string",
          },
          grace_period_minutes: {
            type: "integer",
          },
          previous_key_expires_at: {
            type: ["integer", "null"],
            format: "int64",
          },
        },
      },
      ListApiScopesResponse: {
        type: "object",
        required: ["data", "default"],
        properties: {
          data: {
            type: "array",
            items: {
              type: "string",
            },
            description: "所有可用的 API 作用域列表",
          },
          default: {
            type: "array",
            items: {
              type: "string",
            },
            description: "创建 Token 时的默认作用域",
          },
        },
      },
      CreateProjectDto: {
        type: "object",
        required: ["project_key", "name"],
        properties: {
          project_key: {
            type: "string",
            maxLength: 64,
          },
          name: {
            type: "string",
            maxLength: 128,
          },
          repo_url: {
            type: "string",
            maxLength: 512,
          },
          description: {
            type: "string",
            maxLength: 2048,
          },
          author: {
            type: "string",
            maxLength: 128,
          },
          author_homepage_url: {
            type: "string",
            format: "uri",
            maxLength: 512,
          },
          icon_url: {
            type: "string",
            format: "uri",
            maxLength: 1024,
          },
          website_url: {
            type: "string",
            format: "uri",
            maxLength: 512,
          },
          docs_url: {
            type: "string",
            format: "uri",
            maxLength: 512,
          },
          published_at: {
            type: "integer",
            format: "int64",
          },
          optional_update_min_comparable_version: {
            type: "string",
            maxLength: 64,
            description: "项目级可选更新范围下限（可比较版本号）",
          },
          optional_update_max_comparable_version: {
            type: "string",
            maxLength: 64,
            description: "项目级可选更新范围上限（可比较版本号）",
          },
          stats_retention_days: {
            type: "integer",
            minimum: 1,
            maximum: 365,
            default: 365,
            description: "接口请求统计保留时长（天），超出部分每日自动清理",
          },
        },
        example: {
          project_key: "verhub",
          name: "Verhub",
          repo_url: "https://github.com/example/verhub",
          description: "版本与公告管理",
          author: "octocat",
          author_homepage_url: "https://github.com/octocat",
          icon_url: "https://avatars.githubusercontent.com/u/1?v=4",
          website_url: "https://verhub.dev",
          docs_url: "https://docs.verhub.dev",
          published_at: 1760000000,
        },
      },
      UpdateProjectDto: {
        type: "object",
        properties: {
          project_key: {
            type: "string",
            maxLength: 64,
          },
          name: {
            type: "string",
            maxLength: 128,
          },
          repo_url: {
            type: "string",
            maxLength: 512,
          },
          description: {
            type: "string",
            maxLength: 2048,
          },
          author: {
            type: "string",
            maxLength: 128,
          },
          author_homepage_url: {
            type: "string",
            format: "uri",
            maxLength: 512,
          },
          icon_url: {
            type: "string",
            format: "uri",
            maxLength: 1024,
          },
          website_url: {
            type: "string",
            format: "uri",
            maxLength: 512,
          },
          docs_url: {
            type: "string",
            format: "uri",
            maxLength: 512,
          },
          published_at: {
            type: "integer",
            format: "int64",
          },
          optional_update_min_comparable_version: {
            type: "string",
            maxLength: 64,
          },
          optional_update_max_comparable_version: {
            type: "string",
            maxLength: 64,
          },
          stats_retention_days: {
            type: "integer",
            minimum: 1,
            maximum: 365,
            default: 365,
            description: "接口请求统计保留时长（天），超出部分每日自动清理",
          },
        },
        example: {
          name: "Verhub",
          description: "版本与公告管理",
          optional_update_min_comparable_version: "1.0.0",
          optional_update_max_comparable_version: "1.9.9",
          stats_retention_days: 180,
        },
      },
      ProjectItem: {
        type: "object",
        required: [
          "id",
          "project_key",
          "name",
          "repo_url",
          "description",
          "author",
          "author_homepage_url",
          "icon_url",
          "website_url",
          "docs_url",
          "published_at",
          "optional_update_min_comparable_version",
          "optional_update_max_comparable_version",
          "stats_retention_days",
          "aliases",
          "created_at",
          "updated_at",
        ],
        properties: {
          id: {
            type: "string",
          },
          project_key: {
            type: "string",
          },
          name: {
            type: "string",
          },
          repo_url: {
            type: ["string", "null"],
          },
          description: {
            type: ["string", "null"],
          },
          author: {
            type: ["string", "null"],
          },
          author_homepage_url: {
            type: ["string", "null"],
          },
          icon_url: {
            type: ["string", "null"],
          },
          website_url: {
            type: ["string", "null"],
          },
          docs_url: {
            type: ["string", "null"],
          },
          published_at: {
            type: ["integer", "null"],
            format: "int64",
          },
          optional_update_min_comparable_version: {
            type: ["string", "null"],
          },
          optional_update_max_comparable_version: {
            type: ["string", "null"],
          },
          stats_retention_days: {
            type: "integer",
            description: "接口请求统计保留时长（天）",
          },
          aliases: {
            type: "array",
            items: {
              type: "string",
            },
            description:
              "项目改名后保留的旧 Project Key（别名），按新到旧排序。以其中任一别名访问 项目的公共与管理接口，都会透明命中当前项目。",
          },
          created_at: {
            type: "integer",
            format: "int64",
          },
          updated_at: {
            type: "integer",
            format: "int64",
          },
        },
        example: {
          id: "verhub",
          project_key: "verhub",
          name: "Verhub",
          description: "版本管理平台",
          repo_url: "https://github.com/example/verhub",
          author: "octocat",
          author_homepage_url: "https://github.com/octocat",
          icon_url: "https://avatars.githubusercontent.com/u/1?v=4",
          website_url: "https://verhub.dev",
          docs_url: "https://docs.verhub.dev",
          published_at: 1760000000,
          optional_update_min_comparable_version: "1.0.0",
          optional_update_max_comparable_version: "1.9.9",
          stats_retention_days: 365,
          aliases: ["verhub-old"],
          created_at: 1760000000,
          updated_at: 1760000000,
        },
      },
      ProjectAliasItem: {
        type: "object",
        required: ["alias", "created_at"],
        properties: {
          alias: {
            type: "string",
            description: "旧 Project Key。",
          },
          created_at: {
            type: "integer",
            format: "int64",
            description: "该别名登记时间（改名发生时），Unix 秒。",
          },
        },
        example: {
          alias: "verhub-old",
          created_at: 1760000000,
        },
      },
      ProjectAliasListResponse: {
        type: "object",
        required: ["data"],
        properties: {
          data: {
            type: "array",
            items: {
              $ref: "#/components/schemas/ProjectAliasItem",
            },
          },
        },
        example: {
          data: [
            {
              alias: "verhub-old",
              created_at: 1760000000,
            },
          ],
        },
      },
      GithubWebhookSettings: {
        type: "object",
        required: [
          "enabled",
          "payload_path",
          "content_type",
          "secret_hint",
          "secret_length",
          "secret_updated_at",
        ],
        properties: {
          enabled: {
            type: "boolean",
            description: "是否已配置 secret；为 false 时接收端点拒绝所有推送",
          },
          payload_path: {
            type: "string",
            description: "需要填入 GitHub Webhook 的 Payload URL 路径（相对于部署域名）",
          },
          content_type: {
            type: "string",
            enum: ["application/json"],
            description: "GitHub Webhook 必须选择的 Content type",
          },
          secret_hint: {
            type: ["string", "null"],
            description: "secret 末 6 位，用于区分不同 secret，未配置时为 null",
          },
          secret_length: {
            type: ["integer", "null"],
            description: "已存 secret 的字符数，供管理端渲染与真实长度一致的星号掩码",
          },
          secret_updated_at: {
            type: ["integer", "null"],
            format: "int64",
            description: "secret 最近一次设置时间（Unix 秒）",
          },
        },
        example: {
          enabled: true,
          payload_path: "/api/v1/webhooks/github/verhub",
          content_type: "application/json",
          secret_hint: "7ba3f9",
          secret_length: 54,
          secret_updated_at: 1760000000,
        },
      },
      GithubWebhookSecretRevealed: {
        allOf: [
          {
            $ref: "#/components/schemas/GithubWebhookSettings",
          },
          {
            type: "object",
            required: ["secret"],
            properties: {
              secret: {
                type: "string",
                description: "完整 secret，仅在设置或重新生成时返回一次，请立即填入 GitHub",
              },
            },
            example: {
              secret: "whsec_5b1c9e0f8d2a47b6c3e18f04a7d95c2be6134af80d5e7cb9",
            },
          },
        ],
      },
      SetGithubWebhookSecretDto: {
        type: "object",
        required: ["secret"],
        properties: {
          secret: {
            type: "string",
            minLength: 16,
            maxLength: 256,
            description: "GitHub Webhook 表单里填写的 secret 原文，前后空白会被去除",
          },
        },
        example: {
          secret: "whsec_5b1c9e0f8d2a47b6c3e18f04a7d95c2be6134af80d5e7cb9",
        },
      },
      GithubReleaseEventPayload: {
        type: "object",
        description:
          "GitHub `release` 事件负载，字段与 GitHub REST Release 资源一致。\n此处只列出会被读取的字段，其余字段原样忽略。\n",
        properties: {
          action: {
            type: "string",
            description: "事件动作",
            enum: [
              "published",
              "released",
              "prereleased",
              "created",
              "edited",
              "deleted",
              "unpublished",
            ],
          },
          release: {
            type: "object",
            properties: {
              tag_name: {
                type: "string",
                description: "Git tag，前缀 `v` 会被去除后作为版本号",
              },
              name: {
                type: "string",
                description: "Release 标题，超过 128 字符会被截断",
              },
              body: {
                type: "string",
                description: "Release 说明，超过 4096 字符会被截断",
              },
              draft: {
                type: "boolean",
                description: "草稿 release 会被跳过",
              },
              prerelease: {
                type: "boolean",
                description: "为 true 时写入 is_preview 且不会占用 is_latest",
              },
              published_at: {
                type: "string",
                format: "date-time",
              },
              html_url: {
                type: "string",
                format: "uri",
              },
              zipball_url: {
                type: "string",
                format: "uri",
              },
              assets: {
                type: "array",
                description: "附件列表，最多取前 32 个作为 download_links",
                items: {
                  type: "object",
                  properties: {
                    name: {
                      type: "string",
                    },
                    browser_download_url: {
                      type: "string",
                      format: "uri",
                    },
                  },
                },
              },
            },
          },
          repository: {
            type: "object",
            properties: {
              full_name: {
                type: "string",
              },
            },
          },
        },
        example: {
          action: "published",
          release: {
            tag_name: "v1.4.0",
            name: "Verhub 1.4.0",
            body: "新增 GitHub Release Webhook 同步",
            draft: false,
            prerelease: false,
            published_at: "2026-07-21T10:00:00Z",
            html_url: "https://github.com/example/verhub/releases/tag/v1.4.0",
            assets: [
              {
                name: "verhub-1.4.0-win-x64.zip",
                browser_download_url:
                  "https://github.com/example/verhub/releases/download/v1.4.0/verhub-1.4.0-win-x64.zip",
              },
            ],
          },
          repository: {
            full_name: "example/verhub",
          },
        },
      },
      GithubWebhookDeliveryResult: {
        type: "object",
        required: ["status"],
        properties: {
          status: {
            type: "string",
            enum: ["synced", "ignored", "pong"],
            description: "synced 表示已写入版本，ignored 表示按规则跳过，pong 为 ping 事件应答",
          },
          reason: {
            type: "string",
            enum: [
              "unsupported_event",
              "unsupported_action",
              "missing_release",
              "draft_release",
              "missing_tag",
              "unparsable_version",
            ],
            description: "仅在 status 为 ignored 时返回",
          },
          event: {
            type: "string",
          },
          action: {
            type: "string",
          },
          version: {
            type: "string",
          },
          created: {
            type: "boolean",
            description: "true 表示新建版本，false 表示覆盖了已有版本",
          },
        },
        example: {
          status: "synced",
          event: "release",
          action: "published",
          version: "1.4.0",
          created: true,
        },
      },
      GithubAppFeature: {
        type: "string",
        description: "可启用的 GitHub App 功能标识",
        enum: ["feedback_issue", "comment_commands"],
      },
      GithubAppConfigView: {
        type: "object",
        required: [
          "configured",
          "app_id",
          "has_private_key",
          "private_key_fingerprint",
          "private_key_updated_at",
          "has_webhook_secret",
          "webhook_secret_hint",
          "webhook_secret_length",
          "webhook_secret_updated_at",
          "webhook_payload_path",
          "enabled_features",
          "feedback_issue_custom_template",
          "feedback_issue_title_template",
          "feedback_issue_body_template",
          "builtin_feedback_issue_title_template",
          "builtin_feedback_issue_body_template",
          "feedback_issue_template_variables",
          "updated_at",
        ],
        properties: {
          configured: {
            type: "boolean",
            description: "App ID 与私钥均已配置。false 时任何功能都不会实际生效。",
          },
          app_id: {
            type: ["string", "null"],
          },
          has_private_key: {
            type: "boolean",
          },
          private_key_fingerprint: {
            type: ["string", "null"],
            description: "私钥的 SHA-256 指纹前 16 位，用于区分是否换过钥匙；私钥本身永不回读。",
          },
          private_key_updated_at: {
            type: ["integer", "null"],
          },
          has_webhook_secret: {
            type: "boolean",
          },
          webhook_secret_hint: {
            type: ["string", "null"],
            description: "webhook secret 末 6 位",
          },
          webhook_secret_length: {
            type: ["integer", "null"],
            description: "已存 secret 的字符数，供管理端渲染与真实长度一致的星号掩码",
          },
          webhook_secret_updated_at: {
            type: ["integer", "null"],
          },
          webhook_payload_path: {
            type: "string",
            description: "配置到 GitHub App 设置里的 Webhook URL 路径（相对部署公网源）",
          },
          enabled_features: {
            type: "array",
            items: {
              $ref: "#/components/schemas/GithubAppFeature",
            },
          },
          feedback_issue_custom_template: {
            type: "boolean",
            description: "关闭时忽略下面两个模板字段，实例缺省即内置模板",
          },
          feedback_issue_title_template: {
            type: ["string", "null"],
            description: "反馈转发 Issue 的实例级标题模板；项目级模板优先",
          },
          feedback_issue_body_template: {
            type: ["string", "null"],
          },
          builtin_feedback_issue_title_template: {
            type: "string",
            description: "内置标题模板原文，供管理端作为「自定义模板」输入框的初值",
          },
          builtin_feedback_issue_body_template: {
            type: "string",
            description: "内置正文模板原文。内置正文不含评分。",
          },
          feedback_issue_template_variables: {
            type: "array",
            description: "模板可用变量名清单",
            items: {
              type: "string",
            },
          },
          updated_at: {
            type: ["integer", "null"],
          },
        },
        example: {
          configured: true,
          app_id: "123456",
          has_private_key: true,
          private_key_fingerprint: "8f4e2a1b9c0d7e6f",
          private_key_updated_at: 1760000000,
          has_webhook_secret: true,
          webhook_secret_hint: "4mx9k2",
          webhook_secret_length: 32,
          webhook_secret_updated_at: 1760000000,
          webhook_payload_path: "/api/v1/webhooks/github-app",
          enabled_features: ["feedback_issue"],
          feedback_issue_custom_template: false,
          feedback_issue_title_template: null,
          feedback_issue_body_template: null,
          builtin_feedback_issue_title_template: "[用户反馈] {{content_head}}",
          builtin_feedback_issue_body_template: "## 反馈内容\n\n{{content}}\n",
          feedback_issue_template_variables: ["project_key", "content", "contact"],
          updated_at: 1760000000,
        },
      },
      UpdateGithubAppConfigDto: {
        type: "object",
        description:
          "部分更新：只修改出现的字段。`private_key` / `webhook_secret` 传空字符串表示清除。",
        properties: {
          app_id: {
            type: "string",
            maxLength: 32,
          },
          private_key: {
            type: "string",
            maxLength: 16384,
            description: "GitHub App 私钥（PEM 原文），只写不读，加密落库",
          },
          webhook_secret: {
            type: "string",
            maxLength: 256,
            description: "App 级 webhook secret，用于 /webhooks/github-app 验签",
          },
          enabled_features: {
            type: "array",
            items: {
              $ref: "#/components/schemas/GithubAppFeature",
            },
          },
          feedback_issue_custom_template: {
            type: "boolean",
            description: "关闭时下面两个模板字段被忽略，实例缺省回到内置模板",
          },
          feedback_issue_title_template: {
            type: "string",
            maxLength: 256,
          },
          feedback_issue_body_template: {
            type: "string",
            maxLength: 8192,
          },
        },
        example: {
          app_id: "123456",
          private_key: "-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----",
          enabled_features: ["feedback_issue", "comment_commands"],
        },
      },
      TermsDocumentSlug: {
        type: "string",
        enum: ["privacy-policy", "sdk-compliance"],
        description:
          "条款文档标识。\n- `privacy-policy`：隐私政策\n- `sdk-compliance`：SDK 合规性文档\n",
      },
      TermsDocumentSummary: {
        type: "object",
        required: ["slug", "title", "summary", "source", "updated_at"],
        properties: {
          slug: {
            $ref: "#/components/schemas/TermsDocumentSlug",
          },
          title: {
            type: "string",
          },
          summary: {
            type: "string",
            description: "一句话说明，用于文档间导航",
          },
          source: {
            type: "string",
            enum: ["builtin", "custom"],
            description: "builtin 表示实例未自定义，返回的是内置正文",
          },
          updated_at: {
            type: "integer",
            description: "正文最后修订时间（Unix 秒）；内置正文取内置版本的修订时间",
          },
        },
      },
      TermsDocumentView: {
        allOf: [
          {
            $ref: "#/components/schemas/TermsDocumentSummary",
          },
          {
            type: "object",
            required: ["content"],
            properties: {
              content: {
                type: "string",
                description: "生效的正文（Markdown）",
              },
            },
          },
        ],
      },
      TermsDocumentListResponse: {
        type: "object",
        required: ["data"],
        properties: {
          data: {
            type: "array",
            items: {
              $ref: "#/components/schemas/TermsDocumentSummary",
            },
          },
        },
      },
      TermsDocumentConfigView: {
        type: "object",
        required: [
          "slug",
          "title",
          "summary",
          "custom",
          "content",
          "custom_content",
          "custom_updated_at",
          "builtin_content",
          "builtin_updated_at",
          "updated_at",
          "placeholders",
        ],
        properties: {
          slug: {
            $ref: "#/components/schemas/TermsDocumentSlug",
          },
          title: {
            type: "string",
          },
          summary: {
            type: "string",
          },
          custom: {
            type: "boolean",
            description: "关闭时前台展示内置正文，草稿仍留在库里",
          },
          content: {
            type: "string",
            description: "当前对外生效的正文",
          },
          custom_content: {
            type: ["string", "null"],
            description: "库里保存的自定义草稿，从未编辑过为 null",
          },
          custom_updated_at: {
            type: ["integer", "null"],
          },
          builtin_content: {
            type: "string",
            description: "内置正文原文，用作「恢复内置正文」的初值",
          },
          builtin_updated_at: {
            type: "integer",
          },
          updated_at: {
            type: ["integer", "null"],
          },
          placeholders: {
            type: "array",
            description:
              "内置正文里待填的占位符，按出现顺序。替换在管理端完成，库里只存替换后的成品",
            items: {
              $ref: "#/components/schemas/TermsPlaceholder",
            },
          },
        },
      },
      TermsPlaceholder: {
        type: "object",
        required: ["key", "label", "hint", "example", "required"],
        properties: {
          key: {
            type: "string",
            description: "正文中的写法为 {{key}}",
            example: "operator_name",
          },
          label: {
            type: "string",
            description: "填空表单的字段名",
          },
          hint: {
            type: "string",
            description: "填写要求",
          },
          example: {
            type: "string",
            description: "预填值",
          },
          required: {
            type: "boolean",
            description: "false 表示留空也允许发布",
          },
        },
      },
      TermsDocumentConfigListResponse: {
        type: "object",
        required: ["data"],
        properties: {
          data: {
            type: "array",
            items: {
              $ref: "#/components/schemas/TermsDocumentConfigView",
            },
          },
        },
      },
      UpdateTermsDocumentDto: {
        type: "object",
        description: "部分更新：只修改出现的字段。`content` 传空字符串表示清除草稿。",
        properties: {
          custom: {
            type: "boolean",
          },
          content: {
            type: "string",
            maxLength: 65536,
            description: "自定义正文（Markdown）",
          },
        },
        example: {
          custom: true,
          content: "# 隐私政策\n\n...\n",
        },
      },
      FeedbackIssueTemplateSource: {
        type: "string",
        enum: ["inherit", "custom", "repo"],
        description:
          "反馈转发 Issue 的模板来源。\n- `inherit`：跟随实例级模板（实例未自定义时即内置模板）\n- `custom`：使用本项目 `feedback_issue_*_template` 字段\n- `repo`：读目标仓库里的模板文件，内容带缓存定期重取\n",
      },
      FeedbackIssueRepoTemplatePreview: {
        type: "object",
        required: [
          "path",
          "ref",
          "fetched_at",
          "title_template",
          "body_template",
          "labels",
          "error",
        ],
        properties: {
          path: {
            type: "string",
          },
          ref: {
            type: ["string", "null"],
          },
          fetched_at: {
            type: ["integer", "null"],
          },
          title_template: {
            type: ["string", "null"],
          },
          body_template: {
            type: ["string", "null"],
          },
          labels: {
            type: "array",
            description: "模板文件 front matter 里声明的标签，优先于项目上单独配置的标签",
            items: {
              type: "string",
            },
          },
          error: {
            type: ["string", "null"],
            description: "拉取失败的原因，成功时为 null",
          },
        },
        example: {
          path: ".github/verhub-feedback-issue.md",
          ref: "main",
          fetched_at: 1760000000,
          title_template: "[用户反馈] {{content_head}}",
          body_template: "## 反馈内容\n\n{{content}}\n",
          labels: ["feedback"],
          error: null,
        },
      },
      PublicFeedbackOptions: {
        type: "object",
        required: ["project_key", "github_forward_available", "contact_required_for_forward"],
        properties: {
          project_key: {
            type: "string",
          },
          github_forward_available: {
            type: "boolean",
            description: "本项目当前是否接受把反馈转发成 GitHub Issue",
          },
          contact_required_for_forward: {
            type: "boolean",
            description: "选择转发时联系方式是否必填；转发不可用时恒为 false",
          },
        },
        example: {
          project_key: "verhub",
          github_forward_available: true,
          contact_required_for_forward: true,
        },
      },
      GithubCommandDefinition: {
        type: "object",
        required: ["name", "workflow", "ref"],
        properties: {
          name: {
            type: "string",
            pattern: "^[a-z0-9][a-z0-9-]{0,31}$",
            description: "命令名，不含 /verhub- 前缀",
          },
          workflow: {
            type: "string",
            maxLength: 128,
            description: "workflow 文件名（如 release.yml）或数字 ID",
          },
          ref: {
            type: "string",
            maxLength: 128,
            description: "workflow_dispatch 的目标分支/标签",
          },
          input: {
            type: "string",
            description: "参数写入 workflow inputs 的键名，缺省 args",
          },
        },
        example: {
          name: "release",
          workflow: "release.yml",
          ref: "main",
          input: "version",
        },
      },
      ProjectGithubIntegrationView: {
        type: "object",
        required: [
          "project_key",
          "repo_full_name",
          "feedback_issue_enabled",
          "feedback_issue_active",
          "feedback_issue_template_source",
          "feedback_issue_template_repo_path",
          "feedback_issue_template_repo_ref",
          "feedback_issue_title_template",
          "feedback_issue_body_template",
          "feedback_issue_labels",
          "comment_commands_enabled",
          "comment_commands_active",
          "command_allowed_associations",
          "command_allowed_users",
          "commands",
          "updated_at",
        ],
        properties: {
          project_key: {
            type: "string",
          },
          repo_full_name: {
            type: ["string", "null"],
          },
          feedback_issue_enabled: {
            type: "boolean",
            description: "只表示「允许转发」；是否转发由提交者逐条选择",
          },
          feedback_issue_active: {
            type: "boolean",
            description: "综合实例配置后的实际生效状态",
          },
          feedback_issue_template_source: {
            $ref: "#/components/schemas/FeedbackIssueTemplateSource",
          },
          feedback_issue_template_repo_path: {
            type: ["string", "null"],
            description: "source=repo 时模板文件在目标仓库中的路径",
          },
          feedback_issue_template_repo_ref: {
            type: ["string", "null"],
            description: "读取模板文件使用的分支/标签，留空取仓库默认分支",
          },
          feedback_issue_title_template: {
            type: ["string", "null"],
          },
          feedback_issue_body_template: {
            type: ["string", "null"],
          },
          feedback_issue_labels: {
            type: "array",
            items: {
              type: "string",
            },
          },
          comment_commands_enabled: {
            type: "boolean",
          },
          comment_commands_active: {
            type: "boolean",
          },
          command_allowed_associations: {
            type: "array",
            items: {
              type: "string",
            },
          },
          command_allowed_users: {
            type: "array",
            items: {
              type: "string",
            },
          },
          commands: {
            type: "array",
            items: {
              $ref: "#/components/schemas/GithubCommandDefinition",
            },
          },
          updated_at: {
            type: ["integer", "null"],
          },
        },
        example: {
          project_key: "verhub",
          repo_full_name: "acme/app",
          feedback_issue_enabled: true,
          feedback_issue_active: true,
          feedback_issue_template_source: "inherit",
          feedback_issue_template_repo_path: null,
          feedback_issue_template_repo_ref: null,
          feedback_issue_title_template: null,
          feedback_issue_body_template: null,
          feedback_issue_labels: ["feedback"],
          comment_commands_enabled: true,
          comment_commands_active: true,
          command_allowed_associations: ["OWNER", "MEMBER", "COLLABORATOR"],
          command_allowed_users: [],
          commands: [
            {
              name: "release",
              workflow: "release.yml",
              ref: "main",
              input: "version",
            },
          ],
          updated_at: 1760000000,
        },
      },
      UpdateProjectGithubIntegrationDto: {
        type: "object",
        description:
          "部分更新：只修改出现的字段。`repo_full_name` 传空字符串表示清除并连带关闭依赖开关。",
        properties: {
          repo_full_name: {
            type: "string",
            maxLength: 140,
            pattern: "^$|^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$",
          },
          feedback_issue_enabled: {
            type: "boolean",
          },
          feedback_issue_template_source: {
            $ref: "#/components/schemas/FeedbackIssueTemplateSource",
          },
          feedback_issue_template_repo_path: {
            type: "string",
            maxLength: 256,
            pattern: "^$|^(?!/)(?!.*\\.\\.)[\\w./-]+$",
            description: "source=repo 时必填，仓库内的相对路径",
          },
          feedback_issue_template_repo_ref: {
            type: "string",
            maxLength: 128,
          },
          feedback_issue_title_template: {
            type: "string",
            maxLength: 256,
          },
          feedback_issue_body_template: {
            type: "string",
            maxLength: 8192,
          },
          feedback_issue_labels: {
            type: "array",
            maxItems: 8,
            items: {
              type: "string",
              maxLength: 64,
            },
          },
          comment_commands_enabled: {
            type: "boolean",
          },
          command_allowed_associations: {
            type: "array",
            items: {
              type: "string",
              enum: [
                "OWNER",
                "MEMBER",
                "COLLABORATOR",
                "CONTRIBUTOR",
                "FIRST_TIME_CONTRIBUTOR",
                "FIRST_TIMER",
                "MANNEQUIN",
                "NONE",
              ],
            },
          },
          command_allowed_users: {
            type: "array",
            maxItems: 32,
            items: {
              type: "string",
              maxLength: 64,
            },
          },
          commands: {
            type: "array",
            maxItems: 16,
            items: {
              $ref: "#/components/schemas/GithubCommandDefinition",
            },
          },
        },
        example: {
          repo_full_name: "acme/app",
          feedback_issue_enabled: true,
          feedback_issue_labels: ["feedback"],
        },
      },
      GithubAppWebhookResult: {
        type: "object",
        required: ["status"],
        properties: {
          status: {
            type: "string",
            enum: ["dispatched", "ignored", "pong"],
            description:
              "dispatched 表示已触发 workflow，ignored 表示按规则跳过，pong 为 ping 应答",
          },
          reason: {
            type: "string",
            enum: [
              "unsupported_event",
              "unsupported_action",
              "feature_disabled",
              "missing_repository",
              "no_command",
              "repo_not_configured",
              "author_not_allowed",
              "unknown_command",
            ],
            description: "仅在 status 为 ignored 时返回",
          },
          event: {
            type: "string",
          },
          command: {
            type: "string",
          },
          project_key: {
            type: "string",
          },
          workflow: {
            type: "string",
          },
        },
        example: {
          status: "dispatched",
          event: "issue_comment",
          command: "release",
          project_key: "verhub",
          workflow: "release.yml",
        },
      },
      PublicEndpoint: {
        type: "string",
        description: "被统计的公开接口标识",
        enum: [
          "PROJECT_DETAIL",
          "VERSION_LIST",
          "VERSION_LATEST",
          "VERSION_LATEST_PREVIEW",
          "VERSION_BY_VERSION",
          "VERSION_CHECK_UPDATE",
          "ANNOUNCEMENT_LIST",
          "ANNOUNCEMENT_LATEST",
          "FEEDBACK_SUBMIT",
          "LOG_UPLOAD",
          "ACTION_RECORD",
        ],
      },
      StatPlatform: {
        type: "string",
        description:
          "统计维度上的来源平台，取值同 `Platform` 但为大写形式。\n优先取 SDK 显式声明（`x-verhub-platform` 请求头、query 或 body 的\nplatform 字段），否则由 User-Agent 推断，无法识别时为 OTHERS。\n`WEB` 只在客户端显式声明时出现：浏览器 User-Agent 本身带真实系统，\n推断结果永远是具体系统而非 WEB。\n",
        enum: ["WINDOWS", "LINUX", "MACOS", "IOS", "ANDROID", "WEB", "OTHERS"],
      },
      RequestStatsOverview: {
        type: "object",
        required: [
          "start_time",
          "end_time",
          "total",
          "by_endpoint",
          "by_platform",
          "by_region",
          "by_province",
        ],
        properties: {
          start_time: {
            type: "integer",
            format: "int64",
          },
          end_time: {
            type: "integer",
            format: "int64",
          },
          total: {
            type: "integer",
            description: "时间范围内的请求总数",
          },
          by_endpoint: {
            type: "array",
            description: "按接口汇总，按请求数降序",
            items: {
              type: "object",
              required: ["endpoint", "count"],
              properties: {
                endpoint: {
                  $ref: "#/components/schemas/PublicEndpoint",
                },
                count: {
                  type: "integer",
                },
              },
            },
          },
          by_platform: {
            type: "array",
            description: "按平台汇总，按请求数降序",
            items: {
              type: "object",
              required: ["platform", "count"],
              properties: {
                platform: {
                  $ref: "#/components/schemas/StatPlatform",
                },
                count: {
                  type: "integer",
                },
              },
            },
          },
          by_region: {
            type: "array",
            description:
              "按地区汇总，按请求数降序。取值为调用方 IP 解析出的 ISO-3166 alpha-2\n国家代码，另有两个哨兵值：`UNKNOWN`（无 IP，或所有解析服务均失败）、\n`LOCAL`（私有网段/回环地址，不会送去外部解析）。\n",
            items: {
              type: "object",
              required: ["region", "count"],
              properties: {
                region: {
                  type: "string",
                },
                count: {
                  type: "integer",
                },
              },
            },
          },
          by_province: {
            type: "array",
            description:
              "国内省份分布，按请求数降序。取值为省级行政区划码（GB/T 2260，如\n`210000`）+ 标准中文省名。仅有中国大陆流量时非空；按行政区划码聚合以\n规避不同解析服务省市命名不一致导致的分桶碎片。境外流量只体现在\n`by_region` 的国家分布中。\n",
            items: {
              type: "object",
              required: ["code", "name", "count"],
              properties: {
                code: {
                  type: "string",
                  description: "省级行政区划码（GB/T 2260）",
                },
                name: {
                  type: "string",
                  description: "标准中文省名",
                },
                count: {
                  type: "integer",
                },
              },
            },
          },
        },
        example: {
          start_time: 1760000000,
          end_time: 1762000000,
          total: 12840,
          by_endpoint: [
            {
              endpoint: "VERSION_CHECK_UPDATE",
              count: 8210,
            },
            {
              endpoint: "VERSION_LATEST",
              count: 3120,
            },
          ],
          by_platform: [
            {
              platform: "WINDOWS",
              count: 9020,
            },
            {
              platform: "MAC",
              count: 2400,
            },
          ],
          by_region: [
            {
              region: "CN",
              count: 9600,
            },
            {
              region: "US",
              count: 2100,
            },
            {
              region: "UNKNOWN",
              count: 1140,
            },
          ],
          by_province: [
            {
              code: "440000",
              name: "广东省",
              count: 4200,
            },
            {
              code: "310000",
              name: "上海市",
              count: 2600,
            },
            {
              code: "210000",
              name: "辽宁省",
              count: 1800,
            },
          ],
        },
      },
      RequestStatsTimeseries: {
        type: "object",
        required: [
          "start_time",
          "end_time",
          "granularity",
          "tz_offset_minutes",
          "endpoint",
          "group_by",
          "data",
          "series",
        ],
        properties: {
          start_time: {
            type: "integer",
            format: "int64",
          },
          end_time: {
            type: "integer",
            format: "int64",
          },
          granularity: {
            type: "string",
            enum: ["hour", "day"],
          },
          tz_offset_minutes: {
            type: "integer",
            description: "回显本次折叠所用的时区偏移",
          },
          endpoint: {
            oneOf: [
              {
                $ref: "#/components/schemas/PublicEndpoint",
              },
              {
                type: "null",
              },
            ],
            description: "若查询时指定了接口则回显，否则为 null",
          },
          group_by: {
            oneOf: [
              {
                type: "string",
                enum: ["endpoint", "platform"],
              },
              {
                type: "null",
              },
            ],
            description: "若查询时指定了拆分维度则回显，否则为 null",
          },
          series: {
            oneOf: [
              {
                type: "array",
                items: {
                  type: "object",
                  required: ["key", "data"],
                  properties: {
                    key: {
                      type: "string",
                      description: "该序列的维度取值（端点名或平台名），按区间内总量降序",
                    },
                    data: {
                      $ref: "#/components/schemas/TimeseriesPoints",
                    },
                  },
                },
              },
              {
                type: "null",
              },
            ],
            description:
              "仅在指定 group_by 时非空。各序列的时间桶与 `data` 逐一对齐（含 0 值桶），\n可直接用作堆叠图。序列之和小于总量的差额应归入「其他」。\n",
          },
          data: {
            type: "array",
            items: {
              type: "object",
              required: ["bucket", "count"],
              properties: {
                bucket: {
                  type: "integer",
                  format: "int64",
                  description:
                    "时间桶起点（Unix 秒）。granularity=hour 时对齐到 UTC 整点；\ngranularity=day 时为 tz_offset_minutes 所指时区当天零点对应的时刻，\n直接用本地时间格式化即可得到正确日期。\n",
                },
                count: {
                  type: "integer",
                },
              },
            },
          },
        },
        example: {
          start_time: 1760000000,
          end_time: 1760086400,
          granularity: "hour",
          tz_offset_minutes: 480,
          endpoint: "VERSION_CHECK_UPDATE",
          data: [
            {
              bucket: 1760000000,
              count: 320,
            },
            {
              bucket: 1760003600,
              count: 287,
            },
          ],
        },
      },
      TimeseriesPoints: {
        type: "array",
        description: "按时间桶升序，范围内无数据的桶以 0 返回，便于直接绘制曲线。",
        items: {
          type: "object",
          required: ["bucket", "count"],
          properties: {
            bucket: {
              type: "integer",
              format: "int64",
              description: "时间桶起点（Unix 秒），口径同 RequestStatsTimeseries.data",
            },
            count: {
              type: "integer",
            },
          },
        },
      },
      VersionAdoptionStats: {
        type: "object",
        required: ["start_time", "end_time", "granularity", "tz_offset_minutes", "series"],
        properties: {
          start_time: {
            type: "integer",
            format: "int64",
          },
          end_time: {
            type: "integer",
            format: "int64",
          },
          granularity: {
            type: "string",
            enum: ["hour", "day"],
          },
          tz_offset_minutes: {
            type: "integer",
          },
          series: {
            type: "array",
            description: "按区间内总上报量降序，最多 limit 条",
            items: {
              type: "object",
              required: ["version", "data"],
              properties: {
                version: {
                  type: "string",
                  description: "客户端自报的版本号原文",
                },
                data: {
                  $ref: "#/components/schemas/TimeseriesPoints",
                },
              },
            },
          },
        },
        example: {
          start_time: 1760000000,
          end_time: 1762000000,
          granularity: "day",
          tz_offset_minutes: 480,
          series: [
            {
              version: "2.3.0",
              data: [
                {
                  bucket: 1760000000,
                  count: 120,
                },
                {
                  bucket: 1760086400,
                  count: 340,
                },
              ],
            },
            {
              version: "2.2.1",
              data: [
                {
                  bucket: 1760000000,
                  count: 480,
                },
                {
                  bucket: 1760086400,
                  count: 260,
                },
              ],
            },
          ],
        },
      },
      LogLevelStats: {
        type: "object",
        required: ["start_time", "end_time", "total", "by_level"],
        properties: {
          start_time: {
            type: "integer",
            format: "int64",
          },
          end_time: {
            type: "integer",
            format: "int64",
          },
          total: {
            type: "integer",
          },
          by_level: {
            type: "array",
            description: "恒定四项，按等级升序；该等级没有日志时 count 为 0",
            items: {
              type: "object",
              required: ["level", "count"],
              properties: {
                level: {
                  type: "integer",
                  enum: [0, 1, 2, 3],
                  description: "0=DEBUG，1=INFO，2=WARN，3=ERROR，与日志上报接口取值一致",
                },
                count: {
                  type: "integer",
                },
              },
            },
          },
        },
        example: {
          start_time: 1760000000,
          end_time: 1762000000,
          total: 1840,
          by_level: [
            {
              level: 0,
              count: 120,
            },
            {
              level: 1,
              count: 1500,
            },
            {
              level: 2,
              count: 180,
            },
            {
              level: 3,
              count: 40,
            },
          ],
        },
      },
      FeedbackRatingStats: {
        type: "object",
        required: ["start_time", "end_time", "total", "unrated", "average_rating", "by_rating"],
        properties: {
          start_time: {
            type: "integer",
            format: "int64",
          },
          end_time: {
            type: "integer",
            format: "int64",
          },
          total: {
            type: "integer",
            description: "范围内反馈总条数，含未打分的",
          },
          unrated: {
            type: "integer",
            description: "未打分的条数，不并入任何档位",
          },
          average_rating: {
            type: ["number", "null"],
            description: "仅按已打分的条数计算；无人打分时为 null",
          },
          by_rating: {
            type: "array",
            description: "恒定五项（1..5 星），缺档也返回 0",
            items: {
              type: "object",
              required: ["rating", "count"],
              properties: {
                rating: {
                  type: "integer",
                  minimum: 1,
                  maximum: 5,
                },
                count: {
                  type: "integer",
                },
              },
            },
          },
        },
        example: {
          start_time: 1760000000,
          end_time: 1762000000,
          total: 96,
          unrated: 12,
          average_rating: 4.3,
          by_rating: [
            {
              rating: 1,
              count: 3,
            },
            {
              rating: 2,
              count: 5,
            },
            {
              rating: 3,
              count: 9,
            },
            {
              rating: 4,
              count: 22,
            },
            {
              rating: 5,
              count: 45,
            },
          ],
        },
      },
      ClientVersionStats: {
        type: "object",
        required: ["start_time", "end_time", "total", "data"],
        properties: {
          start_time: {
            type: "integer",
            format: "int64",
          },
          end_time: {
            type: "integer",
            format: "int64",
          },
          total: {
            type: "integer",
            description: "范围内全部版本的上报总数（不受 limit 截断影响），用于计算占比",
          },
          data: {
            type: "array",
            description: "按上报数降序，最多返回 limit 条",
            items: {
              type: "object",
              required: ["version", "count"],
              properties: {
                version: {
                  type: "string",
                  description: "客户端自报的版本号原文",
                },
                count: {
                  type: "integer",
                },
              },
            },
          },
        },
        example: {
          start_time: 1760000000,
          end_time: 1762000000,
          total: 8210,
          data: [
            {
              version: "2.3.0",
              count: 5120,
            },
            {
              version: "2.2.1",
              count: 2380,
            },
          ],
        },
      },
      PlatformVersionStats: {
        type: "object",
        required: ["start_time", "end_time", "total", "data"],
        properties: {
          start_time: {
            type: "integer",
            format: "int64",
          },
          end_time: {
            type: "integer",
            format: "int64",
          },
          total: {
            type: "integer",
            description: "范围内全部系统版本桶的请求总数（不受 limit 截断影响），用于计算占比",
          },
          data: {
            type: "array",
            description: "按请求数降序，最多返回 limit 条",
            items: {
              type: "object",
              required: ["platform", "platform_version", "count"],
              properties: {
                platform: {
                  $ref: "#/components/schemas/StatPlatform",
                },
                platform_version: {
                  type: "string",
                  description: "系统版本明细，已归一为小写；空串表示该平台下未上报明细的那部分流量",
                },
                count: {
                  type: "integer",
                },
              },
            },
          },
        },
        example: {
          start_time: 1760000000,
          end_time: 1762000000,
          total: 9600,
          data: [
            {
              platform: "WINDOWS",
              platform_version: "11",
              count: 5120,
            },
            {
              platform: "WINDOWS",
              platform_version: "10",
              count: 2380,
            },
            {
              platform: "LINUX",
              platform_version: "ubuntu 24.04",
              count: 1400,
            },
            {
              platform: "MACOS",
              platform_version: "",
              count: 700,
            },
          ],
        },
      },
      RequestStatsHeatmap: {
        type: "object",
        required: ["start_time", "end_time", "tz_offset_minutes", "data"],
        properties: {
          start_time: {
            type: "integer",
            format: "int64",
          },
          end_time: {
            type: "integer",
            format: "int64",
          },
          tz_offset_minutes: {
            type: "integer",
            description: "回显无法定位来源时的兜底时区偏移",
          },
          data: {
            type: "array",
            description: "固定 168 个格子（7 天 × 24 小时），无流量的格子以 0 返回",
            items: {
              type: "object",
              required: ["weekday", "hour", "count"],
              properties: {
                weekday: {
                  type: "integer",
                  minimum: 0,
                  maximum: 6,
                  description:
                    "0=周日 … 6=周六，按来源当地时区（无法定位则按 tz_offset_minutes 兜底）",
                },
                hour: {
                  type: "integer",
                  minimum: 0,
                  maximum: 23,
                  description: "小时，按来源当地时区（无法定位则按 tz_offset_minutes 兜底）",
                },
                count: {
                  type: "integer",
                },
              },
            },
          },
        },
        example: {
          start_time: 1760000000,
          end_time: 1762000000,
          tz_offset_minutes: 480,
          data: [
            {
              weekday: 1,
              hour: 9,
              count: 412,
            },
            {
              weekday: 1,
              hour: 10,
              count: 508,
            },
          ],
        },
      },
      ProjectListResponse: {
        type: "object",
        required: ["total", "data"],
        properties: {
          total: {
            type: "integer",
            example: 1,
          },
          data: {
            type: "array",
            items: {
              $ref: "#/components/schemas/ProjectItem",
            },
          },
        },
      },
      Platform: {
        type: "string",
        description:
          "平台取值，发布目标（版本 / 公告）与来源统计共用一套。提交时大小写不敏感，\n返回时统一为小写。具体系统版本不进本字段，走 `platform_version`。\n`others` 是兜底：识别不出、未声明，或不属于上述分类的平台。\n",
        enum: ["windows", "linux", "macos", "ios", "android", "web", "others"],
      },
      VersionDownloadLink: {
        type: "object",
        required: ["url"],
        properties: {
          url: {
            type: "string",
            maxLength: 2048,
            format: "uri",
          },
          name: {
            type: "string",
            maxLength: 128,
          },
          platform: {
            type: "string",
            maxLength: 64,
          },
        },
        example: {
          url: "https://example.com/download/verhub-1.0.0.zip",
          name: "Windows 包",
          platform: "windows",
        },
      },
      CreateVersionDto: {
        type: "object",
        required: ["version", "comparable_version"],
        properties: {
          version: {
            type: "string",
            maxLength: 64,
          },
          comparable_version: {
            type: "string",
            maxLength: 64,
            description: "可比较版本号，格式如 1.2.3、1.2.3-alpha 或 1.2.3-rc.2",
          },
          title: {
            type: "string",
            maxLength: 128,
          },
          content: {
            type: "string",
            maxLength: 4096,
          },
          download_url: {
            type: ["string", "null"],
            maxLength: 2048,
          },
          download_links: {
            type: "array",
            items: {
              $ref: "#/components/schemas/VersionDownloadLink",
            },
          },
          is_latest: {
            type: "boolean",
          },
          is_preview: {
            type: "boolean",
          },
          is_milestone: {
            type: "boolean",
          },
          is_deprecated: {
            type: "boolean",
          },
          published_at: {
            type: "integer",
            format: "int64",
          },
          platform: {
            $ref: "#/components/schemas/Platform",
          },
          platforms: {
            type: "array",
            items: {
              $ref: "#/components/schemas/Platform",
            },
          },
          custom_data: {
            type: "object",
            additionalProperties: true,
          },
        },
        example: {
          version: "1.2.0",
          comparable_version: "1.2.0",
          title: "稳定版",
          content: "修复若干问题并优化更新检查。",
          download_links: [
            {
              url: "https://example.com/download/verhub-1.2.0.zip",
              name: "Windows 包",
              platform: "windows",
            },
          ],
          is_latest: true,
          is_preview: false,
          is_milestone: false,
          is_deprecated: false,
          published_at: 1760000000,
          platforms: ["windows", "mac"],
        },
      },
      CreateProjectVersionDto: {
        allOf: [
          {
            $ref: "#/components/schemas/CreateVersionDto",
          },
          {
            type: "object",
            required: ["project_key"],
            properties: {
              project_key: {
                type: "string",
                maxLength: 64,
              },
            },
          },
        ],
      },
      UpdateVersionDto: {
        type: "object",
        properties: {
          version: {
            type: "string",
            maxLength: 64,
          },
          comparable_version: {
            type: "string",
            maxLength: 64,
          },
          title: {
            type: "string",
            maxLength: 128,
          },
          content: {
            type: "string",
            maxLength: 4096,
          },
          download_url: {
            type: ["string", "null"],
            maxLength: 2048,
            description: "传 null 清空下载地址；省略该字段则保持原值",
          },
          download_links: {
            type: "array",
            items: {
              $ref: "#/components/schemas/VersionDownloadLink",
            },
          },
          is_latest: {
            type: "boolean",
          },
          is_preview: {
            type: "boolean",
          },
          is_milestone: {
            type: "boolean",
          },
          is_deprecated: {
            type: "boolean",
          },
          published_at: {
            type: "integer",
            format: "int64",
          },
          platform: {
            $ref: "#/components/schemas/Platform",
          },
          platforms: {
            type: "array",
            items: {
              $ref: "#/components/schemas/Platform",
            },
          },
          custom_data: {
            type: "object",
            additionalProperties: true,
          },
        },
        example: {
          title: "稳定版-修订",
          content: "补充发布说明。",
          is_latest: true,
          is_deprecated: false,
        },
      },
      UpsertVersionDto: {
        allOf: [
          {
            $ref: "#/components/schemas/UpdateVersionDto",
          },
        ],
        description:
          "全部字段可选。目标版本号取自路径，`version` 可以省略；若提交则必须与路径一致。 更新已有版本时，省略的字段保持原值，显式提交 null 的字段被置空。 新建时 `comparable_version` 省略则由版本号推导（去掉前导 v）。\n",
      },
      VersionItem: {
        type: "object",
        required: [
          "id",
          "version",
          "comparable_version",
          "title",
          "content",
          "download_url",
          "download_links",
          "forced",
          "is_latest",
          "is_preview",
          "is_milestone",
          "is_deprecated",
          "platform",
          "platforms",
          "custom_data",
          "published_at",
          "created_at",
        ],
        properties: {
          id: {
            type: "string",
          },
          version: {
            type: "string",
          },
          comparable_version: {
            type: "string",
          },
          title: {
            type: ["string", "null"],
          },
          content: {
            type: ["string", "null"],
          },
          download_url: {
            type: ["string", "null"],
          },
          download_links: {
            type: "array",
            items: {
              $ref: "#/components/schemas/VersionDownloadLink",
            },
          },
          forced: {
            type: "boolean",
          },
          is_latest: {
            type: "boolean",
          },
          is_preview: {
            type: "boolean",
          },
          is_milestone: {
            type: "boolean",
          },
          is_deprecated: {
            type: "boolean",
          },
          platform: {
            oneOf: [
              {
                $ref: "#/components/schemas/Platform",
              },
              {
                type: "null",
              },
            ],
          },
          platforms: {
            type: "array",
            items: {
              $ref: "#/components/schemas/Platform",
            },
          },
          custom_data: {
            oneOf: [
              {
                type: "object",
                additionalProperties: true,
              },
              {
                type: "null",
              },
            ],
          },
          created_at: {
            type: "integer",
            format: "int64",
          },
          published_at: {
            type: "integer",
            format: "int64",
          },
        },
        example: {
          id: "ver-001",
          version: "1.0.0",
          comparable_version: "1.0.0",
          title: "首发版本",
          content: "首个正式版本，支持版本发布与公告推送。",
          download_url: "https://example.com/download/verhub-1.0.0.zip",
          download_links: [
            {
              url: "https://example.com/download/verhub-1.0.0.zip",
              name: "Windows 包",
              platform: "windows",
            },
          ],
          forced: false,
          is_latest: true,
          is_preview: false,
          is_milestone: true,
          is_deprecated: false,
          platform: "windows",
          platforms: ["windows", "mac"],
          custom_data: {
            channel: "stable",
          },
          created_at: 1760000000,
          published_at: 1760000000,
        },
      },
      GithubReleaseVersionPreview: {
        type: "object",
        required: [
          "version",
          "comparable_version",
          "forced",
          "is_latest",
          "is_preview",
          "is_deprecated",
          "published_at",
          "platforms",
          "custom_data",
        ],
        properties: {
          version: {
            type: "string",
          },
          comparable_version: {
            type: "string",
          },
          title: {
            type: "string",
          },
          content: {
            type: "string",
          },
          download_url: {
            type: "string",
          },
          download_links: {
            type: "array",
            items: {
              $ref: "#/components/schemas/VersionDownloadLink",
            },
          },
          forced: {
            type: "boolean",
          },
          is_latest: {
            type: "boolean",
          },
          is_preview: {
            type: "boolean",
          },
          is_milestone: {
            type: "boolean",
          },
          is_deprecated: {
            type: "boolean",
          },
          platform: {
            oneOf: [
              {
                $ref: "#/components/schemas/Platform",
              },
              {
                type: "null",
              },
            ],
          },
          platforms: {
            type: "array",
            items: {
              $ref: "#/components/schemas/Platform",
            },
          },
          published_at: {
            type: "integer",
            format: "int64",
          },
          custom_data: {
            type: "object",
            additionalProperties: true,
          },
        },
      },
      GithubRepoProjectPreview: {
        type: "object",
        required: [
          "project_key",
          "name",
          "repo_url",
          "description",
          "author",
          "author_homepage_url",
          "icon_url",
          "website_url",
          "docs_url",
          "published_at",
        ],
        properties: {
          project_key: {
            type: "string",
          },
          name: {
            type: "string",
          },
          repo_url: {
            type: "string",
            format: "uri",
          },
          description: {
            type: ["string", "null"],
          },
          author: {
            type: ["string", "null"],
          },
          author_homepage_url: {
            type: ["string", "null"],
            format: "uri",
          },
          icon_url: {
            type: ["string", "null"],
            format: "uri",
          },
          website_url: {
            type: ["string", "null"],
            format: "uri",
          },
          docs_url: {
            type: ["string", "null"],
            format: "uri",
          },
          published_at: {
            type: ["integer", "null"],
            format: "int64",
          },
        },
      },
      VersionImportResult: {
        type: "object",
        required: ["imported", "skipped", "scanned"],
        properties: {
          imported: {
            type: "integer",
          },
          skipped: {
            type: "integer",
          },
          scanned: {
            type: "integer",
          },
        },
      },
      VersionListResponse: {
        type: "object",
        required: ["total", "data"],
        properties: {
          total: {
            type: "integer",
            example: 1,
          },
          data: {
            type: "array",
            items: {
              $ref: "#/components/schemas/VersionItem",
            },
          },
        },
      },
      CheckVersionUpdateDto: {
        type: "object",
        description:
          "current_version 与 current_comparable_version 至少提交一个，否则返回 400。 二者的取舍见字段说明；最终服务端必须能拿到一个可比较版本号用于判定。",
        properties: {
          current_version: {
            type: "string",
            maxLength: 64,
            description:
              "当前语义化版本号。仅提交该字段时，服务端会按此版本查库并取其登记的 comparable_version 进行比较；若该版本未登记或未配置 comparable_version，则返回 400。",
          },
          current_comparable_version: {
            type: "string",
            maxLength: 64,
            description:
              "当前可比较版本号，须符合可比较版本规范（如 1.20.326、2.0.0-rc.1）。 提交后直接用于比较，无需依赖服务端已登记该版本；两者同时提交时以此字段为准。",
          },
          include_preview: {
            type: "boolean",
            description: "是否将 preview 版本纳入“是否有更新”的比较候选",
          },
        },
        example: {
          current_version: "v1.20.326",
          current_comparable_version: "1.20.326",
          include_preview: false,
        },
      },
      CheckVersionUpdateResponse: {
        type: "object",
        required: [
          "should_update",
          "required",
          "reason_codes",
          "current_version",
          "current_comparable_version",
          "latest_version",
          "latest_preview_version",
          "target_version",
          "milestone",
        ],
        properties: {
          should_update: {
            type: "boolean",
          },
          required: {
            type: "boolean",
          },
          reason_codes: {
            type: "array",
            items: {
              type: "string",
            },
          },
          current_version: {
            type: ["string", "null"],
          },
          current_comparable_version: {
            type: "string",
          },
          latest_version: {
            $ref: "#/components/schemas/VersionItem",
          },
          latest_preview_version: {
            oneOf: [
              {
                $ref: "#/components/schemas/VersionItem",
              },
              {
                type: "null",
              },
            ],
          },
          target_version: {
            oneOf: [
              {
                $ref: "#/components/schemas/VersionItem",
              },
              {
                type: "null",
              },
            ],
            description: "建议升级到的目标版本；无可升级目标时为 null",
          },
          milestone: {
            type: "object",
            required: ["current", "latest", "target_is_milestone"],
            properties: {
              current: {
                type: "boolean",
                description: "当前版本是否为里程碑版本",
              },
              latest: {
                type: "boolean",
                description: "最新版本是否为里程碑版本",
              },
              target_is_milestone: {
                type: "boolean",
                description:
                  "目标版本是否因里程碑拦截而被下调（命中时 reason_codes 含 milestone_guard）",
              },
            },
          },
        },
      },
      CreateAnnouncementDto: {
        type: "object",
        required: ["title", "content"],
        properties: {
          title: {
            type: "string",
            maxLength: 128,
          },
          content: {
            type: "string",
            maxLength: 4096,
          },
          is_pinned: {
            type: "boolean",
          },
          is_hidden: {
            type: "boolean",
          },
          platforms: {
            type: "array",
            maxItems: 8,
            items: {
              $ref: "#/components/schemas/Platform",
            },
          },
          author: {
            type: "string",
            maxLength: 64,
          },
          published_at: {
            type: "integer",
            format: "int64",
          },
        },
        example: {
          title: "系统维护通知",
          content: "平台将于本周六 02:00-04:00 停机维护。",
          is_pinned: true,
          is_hidden: false,
          platforms: ["windows", "web"],
          author: "运维团队",
          published_at: 1760000000,
        },
      },
      CreateProjectAnnouncementDto: {
        allOf: [
          {
            $ref: "#/components/schemas/CreateAnnouncementDto",
          },
          {
            type: "object",
            required: ["project_key"],
            properties: {
              project_key: {
                type: "string",
                maxLength: 64,
              },
            },
          },
        ],
      },
      UpdateAnnouncementDto: {
        type: "object",
        properties: {
          title: {
            type: "string",
            maxLength: 128,
          },
          content: {
            type: "string",
            maxLength: 4096,
          },
          is_pinned: {
            type: "boolean",
          },
          is_hidden: {
            type: "boolean",
          },
          platforms: {
            type: "array",
            maxItems: 8,
            items: {
              $ref: "#/components/schemas/Platform",
            },
          },
          author: {
            type: "string",
            maxLength: 64,
          },
          published_at: {
            type: "integer",
            format: "int64",
          },
        },
        example: {
          title: "系统维护通知（延期）",
          content: "维护时间调整为下周六 02:00-04:00。",
          is_pinned: false,
        },
      },
      AnnouncementItem: {
        type: "object",
        required: [
          "id",
          "title",
          "content",
          "is_pinned",
          "is_hidden",
          "platforms",
          "published_at",
          "created_at",
          "updated_at",
        ],
        properties: {
          id: {
            type: "string",
          },
          title: {
            type: "string",
          },
          content: {
            type: "string",
          },
          is_pinned: {
            type: "boolean",
          },
          is_hidden: {
            type: "boolean",
          },
          platforms: {
            type: "array",
            items: {
              $ref: "#/components/schemas/Platform",
            },
          },
          author: {
            type: ["string", "null"],
          },
          published_at: {
            type: "integer",
            format: "int64",
          },
          created_at: {
            type: "integer",
            format: "int64",
          },
          updated_at: {
            type: "integer",
            format: "int64",
          },
        },
        example: {
          id: "ann-001",
          title: "系统维护通知",
          content: "平台将于本周六 02:00-04:00 停机维护。",
          is_pinned: true,
          is_hidden: false,
          platforms: ["windows", "web"],
          author: "运维团队",
          published_at: 1760000000,
          created_at: 1760000000,
          updated_at: 1760000000,
        },
      },
      AnnouncementListResponse: {
        type: "object",
        required: ["total", "data"],
        properties: {
          total: {
            type: "integer",
            example: 1,
          },
          data: {
            type: "array",
            items: {
              $ref: "#/components/schemas/AnnouncementItem",
            },
          },
        },
      },
      CreateFeedbackDto: {
        type: "object",
        required: ["content"],
        properties: {
          user_id: {
            type: "string",
            maxLength: 64,
          },
          rating: {
            type: "integer",
            minimum: 1,
            maximum: 5,
          },
          content: {
            type: "string",
            maxLength: 4096,
          },
          contact: {
            type: "string",
            maxLength: 128,
            description: "联系方式，邮箱 / 手机号 / IM 账号皆可，不做格式校验。",
          },
          forward_to_github: {
            type: "boolean",
            default: false,
            description:
              "由提交者选择是否把这条反馈转发成 GitHub Issue。项目开放转发只是「允许」，\n并不代表每条反馈都转发。传 true 时 `contact` 必填、受单 IP 转发限流约束，\n且只有 Issue 建成功这条反馈才会被记录。\n仅公开提交接口生效，管理端补录忽略该字段。\n",
          },
          is_hidden: {
            type: "boolean",
            default: false,
            description: "隐藏后后台列表默认不返回（需 `include_hidden=true`），评分仍计入统计。",
          },
          platform: {
            $ref: "#/components/schemas/Platform",
          },
          platform_version: {
            type: "string",
            maxLength: 32,
            description: "具体系统版本，如 `11`、`ubuntu 24.04`、`26`；与 platform 分开提交。",
          },
          custom_data: {
            type: "object",
            additionalProperties: true,
          },
        },
        example: {
          user_id: "user-001",
          rating: 5,
          content: "更新检查很好用。",
          contact: "user@example.com",
          forward_to_github: false,
          platform: "windows",
          platform_version: "11",
          custom_data: {
            app_version: "1.2.0",
          },
        },
      },
      UpdateFeedbackDto: {
        type: "object",
        properties: {
          user_id: {
            type: "string",
            maxLength: 64,
          },
          rating: {
            type: "integer",
            minimum: 1,
            maximum: 5,
          },
          content: {
            type: "string",
            maxLength: 4096,
          },
          contact: {
            type: "string",
            maxLength: 128,
            description: "联系方式，邮箱 / 手机号 / IM 账号皆可，不做格式校验。",
          },
          is_hidden: {
            type: "boolean",
            description: "隐藏后后台列表默认不返回（需 `include_hidden=true`），评分仍计入统计。",
          },
          platform: {
            $ref: "#/components/schemas/Platform",
          },
          platform_version: {
            type: "string",
            maxLength: 32,
            description: "具体系统版本，如 `11`、`ubuntu 24.04`、`26`；与 platform 分开提交。",
          },
          custom_data: {
            type: "object",
            additionalProperties: true,
          },
        },
        example: {
          rating: 4,
          content: "补充说明：偶发网络超时。",
          is_hidden: true,
        },
      },
      FeedbackItem: {
        type: "object",
        required: [
          "id",
          "user_id",
          "rating",
          "content",
          "contact",
          "is_hidden",
          "platform",
          "platform_version",
          "custom_data",
          "forwarded_to_github",
          "github_issue_number",
          "github_issue_url",
          "ip",
          "user_agent",
          "country_code",
          "country_name",
          "region_name",
          "city",
          "created_at",
        ],
        properties: {
          id: {
            type: "string",
          },
          user_id: {
            type: ["string", "null"],
          },
          rating: {
            type: ["integer", "null"],
          },
          content: {
            type: "string",
          },
          contact: {
            type: ["string", "null"],
            description: "提交者留下的联系方式；未填写为 null。",
          },
          is_hidden: {
            type: "boolean",
            description: "隐藏的反馈默认不出现在后台列表里，但记录与评分统计都保留。",
          },
          platform: {
            oneOf: [
              {
                $ref: "#/components/schemas/Platform",
              },
              {
                type: "null",
              },
            ],
            description: "客户端提交时声明的平台；未声明则由 User-Agent 推断。",
          },
          platform_version: {
            type: ["string", "null"],
            description:
              "具体系统版本，如 `11`、`ubuntu 24.04`；客户端未提交且无法从 User-Agent 解析时为 null。",
          },
          custom_data: {
            oneOf: [
              {
                type: "object",
                additionalProperties: true,
              },
              {
                type: "null",
              },
            ],
          },
          forwarded_to_github: {
            type: "boolean",
            description:
              "该反馈是否已转成 GitHub Issue。转发失败的提交不会被记录，\n所以能查到的记录里为 true 的都是真的建成了 Issue。\n",
          },
          github_issue_number: {
            type: ["integer", "null"],
            description: "生成的 Issue 编号；未转发或 GitHub 未返回编号时为 null。",
          },
          github_issue_url: {
            type: ["string", "null"],
            description: "生成的 Issue 链接；未转发时为 null。",
          },
          ip: {
            type: ["string", "null"],
            description: "服务端观测到的调用方地址；提交时采集，历史数据为 null。",
          },
          user_agent: {
            type: ["string", "null"],
          },
          country_code: {
            type: ["string", "null"],
            description: "ISO-3166 alpha-2；私有网段为 LOCAL，无法定位时为 null。",
          },
          country_name: {
            type: ["string", "null"],
          },
          region_name: {
            type: ["string", "null"],
            description: "省/州级区域，取决于解析服务返回的粒度。",
          },
          city: {
            type: ["string", "null"],
          },
          created_at: {
            type: "integer",
            format: "int64",
          },
        },
        example: {
          id: "fb-001",
          user_id: "user-001",
          rating: 5,
          content: "更新检查很好用。",
          contact: "user@example.com",
          is_hidden: false,
          platform: "windows",
          platform_version: "11",
          custom_data: {
            app_version: "1.2.0",
          },
          ip: "203.0.113.9",
          user_agent: "verhub-sdk/1.0",
          country_code: "CN",
          country_name: "中国",
          region_name: "广东省",
          city: "深圳",
          created_at: 1760000000,
        },
      },
      FeedbackListResponse: {
        type: "object",
        required: ["total", "data"],
        properties: {
          total: {
            type: "integer",
            example: 1,
          },
          data: {
            type: "array",
            items: {
              $ref: "#/components/schemas/FeedbackItem",
            },
          },
        },
      },
      UploadLogDto: {
        type: "object",
        required: ["level", "content"],
        properties: {
          level: {
            type: "integer",
            minimum: 0,
            maximum: 3,
          },
          content: {
            type: "string",
            maxLength: 4096,
          },
          device_info: {
            type: "object",
            additionalProperties: true,
          },
          custom_data: {
            type: "object",
            additionalProperties: true,
          },
        },
        example: {
          level: 2,
          content: "更新检查请求超时，已重试。",
          device_info: {
            os: "Windows 11",
            arch: "x64",
          },
          custom_data: {
            app_version: "1.2.0",
          },
        },
      },
      CreateLogDto: {
        allOf: [
          {
            $ref: "#/components/schemas/UploadLogDto",
          },
          {
            type: "object",
            description:
              "后台手动补录时使用。多出的 platform / platform_version 在客户端上报路径上 由 User-Agent 推断，手动补录没有客户端可推断，只能显式指定。",
            properties: {
              platform: {
                $ref: "#/components/schemas/Platform",
              },
              platform_version: {
                type: "string",
                maxLength: 32,
              },
            },
          },
        ],
        example: {
          level: 2,
          content: "定时任务执行失败，已人工恢复。",
          platform: "windows",
          platform_version: "11",
        },
      },
      LogItem: {
        type: "object",
        required: [
          "id",
          "level",
          "content",
          "device_info",
          "custom_data",
          "ip",
          "user_agent",
          "country_code",
          "country_name",
          "region_name",
          "city",
          "platform",
          "platform_version",
          "created_at",
        ],
        properties: {
          id: {
            type: "string",
          },
          level: {
            type: "integer",
            minimum: 0,
            maximum: 3,
          },
          content: {
            type: "string",
          },
          device_info: {
            oneOf: [
              {
                type: "object",
                additionalProperties: true,
              },
              {
                type: "null",
              },
            ],
            description: "客户端自报，内容不可信；服务端观测到的信息见下方独立字段。",
          },
          custom_data: {
            oneOf: [
              {
                type: "object",
                additionalProperties: true,
              },
              {
                type: "null",
              },
            ],
          },
          ip: {
            type: ["string", "null"],
            description: "服务端观测到的调用方地址；上报时采集，历史数据为 null。",
          },
          user_agent: {
            type: ["string", "null"],
          },
          country_code: {
            type: ["string", "null"],
            description: "ISO-3166 alpha-2；私有网段为 LOCAL，无法定位时为 null。",
          },
          country_name: {
            type: ["string", "null"],
          },
          region_name: {
            type: ["string", "null"],
            description: "省/州级区域，取决于解析服务返回的粒度。",
          },
          city: {
            type: ["string", "null"],
          },
          platform: {
            oneOf: [
              {
                $ref: "#/components/schemas/Platform",
              },
              {
                type: "null",
              },
            ],
            description: "由 User-Agent 推断，日志上报接口本身没有平台字段。",
          },
          platform_version: {
            type: ["string", "null"],
            description:
              "具体系统版本，如 `11`、`ubuntu 24.04`；客户端未提交且无法从 User-Agent 解析时为 null。",
          },
          created_at: {
            type: "integer",
            format: "int64",
          },
        },
        example: {
          id: "log-001",
          level: 2,
          content: "更新检查请求超时，已重试。",
          device_info: {
            os: "Windows 11",
            arch: "x64",
          },
          custom_data: {
            app_version: "1.2.0",
          },
          ip: "203.0.113.9",
          user_agent: "verhub-sdk/1.0",
          country_code: "CN",
          country_name: "中国",
          region_name: "广东省",
          city: "深圳",
          platform: "windows",
          created_at: 1760000000,
        },
      },
      LogListResponse: {
        type: "object",
        required: ["total", "data"],
        properties: {
          total: {
            type: "integer",
            example: 1,
          },
          data: {
            type: "array",
            items: {
              $ref: "#/components/schemas/LogItem",
            },
          },
        },
      },
      CreateActionDto: {
        type: "object",
        required: ["project_key", "name", "description"],
        properties: {
          project_key: {
            type: "string",
            maxLength: 64,
          },
          name: {
            type: "string",
            maxLength: 128,
          },
          description: {
            type: "string",
            maxLength: 512,
          },
          custom_data: {
            type: "object",
            additionalProperties: true,
          },
        },
        example: {
          project_key: "verhub",
          name: "点击更新按钮",
          description: "用户在更新弹窗点击立即更新。",
          custom_data: {
            category: "update",
          },
        },
      },
      UpdateActionDto: {
        type: "object",
        properties: {
          name: {
            type: "string",
            maxLength: 128,
          },
          description: {
            type: "string",
            maxLength: 512,
          },
          custom_data: {
            type: "object",
            additionalProperties: true,
          },
        },
        example: {
          name: "点击更新按钮（新版）",
          description: "用户在新版更新弹窗点击立即更新。",
        },
      },
      ActionItem: {
        type: "object",
        required: [
          "action_id",
          "project_key",
          "name",
          "description",
          "custom_data",
          "created_time",
        ],
        properties: {
          action_id: {
            type: "string",
          },
          project_key: {
            type: "string",
          },
          name: {
            type: "string",
          },
          description: {
            type: "string",
          },
          custom_data: {
            oneOf: [
              {
                type: "object",
                additionalProperties: true,
              },
              {
                type: "null",
              },
            ],
          },
          created_time: {
            type: "integer",
          },
        },
        example: {
          action_id: "act-001",
          project_key: "verhub",
          name: "点击更新按钮",
          description: "用户在更新弹窗点击立即更新。",
          custom_data: {
            category: "update",
          },
          created_time: 1760000000,
        },
      },
      ActionListResponse: {
        type: "object",
        required: ["total", "data"],
        properties: {
          total: {
            type: "integer",
            example: 1,
          },
          data: {
            type: "array",
            items: {
              $ref: "#/components/schemas/ActionItem",
            },
          },
        },
      },
      CreateActionRecordDto: {
        type: "object",
        required: ["action_id"],
        properties: {
          action_id: {
            type: "string",
            maxLength: 64,
          },
          custom_data: {
            type: "object",
            additionalProperties: true,
          },
        },
        example: {
          action_id: "act-001",
          custom_data: {
            app_version: "1.2.0",
          },
        },
      },
      ActionRecordItem: {
        type: "object",
        required: [
          "action_record_id",
          "action_id",
          "created_time",
          "http",
          "custom_data",
          "ip",
          "user_agent",
          "country_code",
          "country_name",
          "region_name",
          "city",
          "platform",
          "platform_version",
        ],
        properties: {
          action_record_id: {
            type: "string",
          },
          action_id: {
            type: "string",
          },
          created_time: {
            type: "integer",
          },
          http: {
            oneOf: [
              {
                type: "object",
                additionalProperties: true,
              },
              {
                type: "null",
              },
            ],
            description: "原始请求快照（方法、完整请求头、请求体）。常用字段已提升为下方独立列。",
          },
          custom_data: {
            oneOf: [
              {
                type: "object",
                additionalProperties: true,
              },
              {
                type: "null",
              },
            ],
          },
          ip: {
            type: ["string", "null"],
            description: "服务端观测到的调用方地址；提交时采集，历史数据为 null。",
          },
          user_agent: {
            type: ["string", "null"],
          },
          country_code: {
            type: ["string", "null"],
            description: "ISO-3166 alpha-2；私有网段为 LOCAL，无法定位时为 null。",
          },
          country_name: {
            type: ["string", "null"],
          },
          region_name: {
            type: ["string", "null"],
            description: "省/州级区域，取决于解析服务返回的粒度。",
          },
          city: {
            type: ["string", "null"],
          },
          platform: {
            oneOf: [
              {
                $ref: "#/components/schemas/Platform",
              },
              {
                type: "null",
              },
            ],
            description: "由 SDK 声明或 User-Agent 推断。",
          },
          platform_version: {
            type: ["string", "null"],
            description:
              "具体系统版本，如 `11`、`ubuntu 24.04`；客户端未提交且无法从 User-Agent 解析时为 null。",
          },
        },
        example: {
          action_record_id: "rec-001",
          action_id: "act-001",
          created_time: 1760000000,
          http: {
            method: "POST",
            ip: "203.0.113.7",
            ua: "Verhub-SDK/1.2.0",
          },
          custom_data: {
            app_version: "1.2.0",
          },
          ip: "203.0.113.7",
          user_agent: "Verhub-SDK/1.2.0",
          country_code: "CN",
          country_name: "中国",
          region_name: "广东省",
          city: "深圳",
          platform: "windows",
        },
      },
      ActionRecordListResponse: {
        type: "object",
        required: ["total", "data"],
        properties: {
          total: {
            type: "integer",
            example: 1,
          },
          data: {
            type: "array",
            items: {
              $ref: "#/components/schemas/ActionRecordItem",
            },
          },
        },
      },
    },
  },
}
