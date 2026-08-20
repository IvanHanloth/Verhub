# Shared dependency + source layer. The production build and the hot-reload dev
# stage both branch off this so they resolve identical dependencies.
FROM node:24-alpine AS backend-deps

# openssl 供 Prisma 的 linux-musl-openssl-3.0.x query engine 使用。
# 不装 node-gyp 工具链：bcrypt 自带 musl 预编译产物，且 pnpm 10 默认不执行依赖的
# install 脚本（无 onlyBuiltDependencies 白名单），没有任何依赖会从源码编译。
RUN apk add --no-cache openssl
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10.20.0 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY packages/backend/package.json packages/backend/package.json
COPY packages/eslint-config/package.json packages/eslint-config/package.json
COPY packages/typescript-config/package.json packages/typescript-config/package.json

RUN pnpm install --filter @workspace/backend... --frozen-lockfile

COPY packages ./packages

RUN pnpm --filter @workspace/backend prisma:generate

FROM backend-deps AS backend-builder

RUN pnpm --filter @workspace/backend build

# Hot-reload development stage: sources are bind-mounted by docker-compose.dev.yml
# and `nest start --watch` recompiles in place. Never used for production images.
FROM backend-deps AS backend-dev

COPY docker/backend-dev-entrypoint.sh /usr/local/bin/backend-dev-entrypoint.sh
RUN chmod +x /usr/local/bin/backend-dev-entrypoint.sh && mkdir -p /bootstrap

ENV NODE_ENV=development
ENV PORT=4000
ENV BOOTSTRAP_SECRET_DIR=/bootstrap

EXPOSE 4000

# Longer start period than production: the first watch build compiles from scratch.
HEALTHCHECK --interval=10s --timeout=5s --start-period=120s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:4000/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["backend-dev-entrypoint.sh"]

FROM node:24-alpine AS backend-runtime

ARG VERHUB_BUILD_VERSION=dev
ARG VERHUB_BUILD_PUBLISHED_AT=unknown
LABEL org.opencontainers.image.version=$VERHUB_BUILD_VERSION
LABEL org.opencontainers.image.created=$VERHUB_BUILD_PUBLISHED_AT

WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.20.0 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY packages/backend/package.json packages/backend/package.json
COPY packages/eslint-config/package.json packages/eslint-config/package.json
COPY packages/typescript-config/package.json packages/typescript-config/package.json

COPY --from=backend-builder /app/node_modules ./node_modules
COPY --from=backend-builder /app/packages/backend/node_modules ./packages/backend/node_modules
COPY --from=backend-builder /app/packages/backend/dist ./packages/backend/dist
COPY --from=backend-builder /app/packages/backend/prisma ./packages/backend/prisma

COPY docker/backend-entrypoint.sh /usr/local/bin/backend-entrypoint.sh
RUN chmod +x /usr/local/bin/backend-entrypoint.sh && mkdir -p /bootstrap
RUN printf '{"version":"%s","published_at":"%s"}\n' "$VERHUB_BUILD_VERSION" "$VERHUB_BUILD_PUBLISHED_AT" > /app/build-info.json

ENV NODE_ENV=production
ENV PORT=4000
ENV BOOTSTRAP_SECRET_DIR=/bootstrap

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:4000/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["backend-entrypoint.sh"]
