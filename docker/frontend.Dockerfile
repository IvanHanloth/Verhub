FROM node:24-alpine AS frontend-builder

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

ARG VERHUB_BUILD_VERSION=dev
ARG VERHUB_BUILD_PUBLISHED_AT=unknown
RUN printf '{"version":"%s","published_at":"%s"}\n' "$VERHUB_BUILD_VERSION" "$VERHUB_BUILD_PUBLISHED_AT" > /app/web/public/build-info.json

RUN pnpm --filter web build

FROM node:24-alpine AS frontend-runtime

ARG VERHUB_BUILD_VERSION=dev
ARG VERHUB_BUILD_PUBLISHED_AT=unknown
LABEL org.opencontainers.image.version=$VERHUB_BUILD_VERSION
LABEL org.opencontainers.image.created=$VERHUB_BUILD_PUBLISHED_AT

RUN apk add --no-cache nginx openssl
WORKDIR /app

# Copy Next.js standalone runtime output (includes required node_modules)
COPY --from=frontend-builder /app/web/.next/standalone ./
COPY --from=frontend-builder /app/web/.next/static ./web/.next/static
COPY --from=frontend-builder /app/web/public ./web/public

COPY docker/nginx/default.conf /etc/nginx/http.d/default.conf
COPY docker/frontend-entrypoint.sh /usr/local/bin/frontend-entrypoint.sh
RUN chmod +x /usr/local/bin/frontend-entrypoint.sh && mkdir -p /run/nginx /etc/nginx/certs
RUN printf '{"version":"%s","published_at":"%s"}\n' "$VERHUB_BUILD_VERSION" "$VERHUB_BUILD_PUBLISHED_AT" > /app/build-info.json

ENV NODE_ENV=production
ENV FRONTEND_NODE_PORT=3000
ENV BACKEND_UPSTREAM=http://backend:4000

EXPOSE 80 443

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["frontend-entrypoint.sh"]
