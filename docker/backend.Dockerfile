# syntax=docker/dockerfile:1.7

FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable

FROM base AS build
WORKDIR /workspace

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY packages/backend/package.json packages/backend/package.json
COPY packages/eslint-config/package.json packages/eslint-config/package.json
COPY packages/typescript-config/package.json packages/typescript-config/package.json

RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store pnpm install --frozen-lockfile

COPY . .

RUN pnpm --filter @workspace/backend prisma:generate
RUN pnpm --filter @workspace/backend build
RUN pnpm --filter @workspace/backend deploy --legacy /out/backend
RUN cd /out/backend && pnpm exec prisma generate

FROM build AS migrator
WORKDIR /workspace

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app

COPY --from=build /out/backend ./

USER node
EXPOSE 4000

CMD ["node", "dist/main.js"]