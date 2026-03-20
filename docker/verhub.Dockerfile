# ===== Stage 1: Backend Builder =====
FROM node:22-alpine AS backend-builder

RUN apk add --no-cache openssl python3 make g++
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10.20.0 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY packages/backend/package.json packages/backend/package.json
COPY packages/eslint-config/package.json packages/eslint-config/package.json
COPY packages/typescript-config/package.json packages/typescript-config/package.json

RUN pnpm install --filter @workspace/backend... --frozen-lockfile

COPY packages ./packages

RUN pnpm --filter @workspace/backend prisma:generate
RUN pnpm --filter @workspace/backend build

# ===== Stage 2: Frontend Builder =====
FROM node:22-alpine AS frontend-builder

WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.20.0 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY web/package.json web/package.json
COPY packages/ui/package.json packages/ui/package.json
COPY packages/eslint-config/package.json packages/eslint-config/package.json
COPY packages/typescript-config/package.json packages/typescript-config/package.json

RUN pnpm install --filter web... --frozen-lockfile

COPY packages ./packages
COPY web ./web

ARG NEXT_PUBLIC_API_BASE_URL=/api/v1
ENV NEXT_PUBLIC_API_BASE_URL=${NEXT_PUBLIC_API_BASE_URL}

RUN pnpm --filter web build

# ===== Stage 3: Runtime =====
FROM node:22-alpine AS runtime

WORKDIR /app

# 启用 pnpm
RUN corepack enable && corepack prepare pnpm@10.20.0 --activate

# 复制 workspace 配置
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./

# 复制后端依赖和构建产物
COPY packages/backend/package.json packages/backend/package.json
COPY packages/eslint-config/package.json packages/eslint-config/package.json
COPY packages/typescript-config/package.json packages/typescript-config/package.json

# 复制后端运行时依赖
COPY --from=backend-builder /app/node_modules ./node_modules
COPY --from=backend-builder /app/packages/backend/node_modules ./packages/backend/node_modules
COPY --from=backend-builder /app/packages/backend/dist ./packages/backend/dist
COPY --from=backend-builder /app/packages/backend/prisma ./packages/backend/prisma

# 复制后端启动脚本
COPY docker/backend-entrypoint.sh /usr/local/bin/backend-entrypoint.sh
RUN chmod +x /usr/local/bin/backend-entrypoint.sh && mkdir -p /bootstrap

# 按 Next.js standalone 约定复制完整运行时产物（含所需 node_modules）
COPY --from=frontend-builder /app/web/.next/standalone ./
COPY --from=frontend-builder /app/web/.next/static ./web/.next/static

# 复制启动脚本
COPY docker/app-entrypoint.sh /usr/local/bin/app-entrypoint.sh
RUN chmod +x /usr/local/bin/app-entrypoint.sh

# 环境变量
ENV NODE_ENV=production
ENV BOOTSTRAP_SECRET_DIR=/bootstrap

# 暴露前端服务端口
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["app-entrypoint.sh"]

