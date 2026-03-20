# Verhub Backend

NestJS backend for Verhub using PostgreSQL + Prisma.

## Scripts

- `pnpm --filter @workspace/backend dev`: run in watch mode
- `pnpm --filter @workspace/backend build`: compile TypeScript
- `pnpm --filter @workspace/backend test`: run unit tests
- `pnpm --filter @workspace/backend test:e2e`: run e2e tests
- `pnpm --filter @workspace/backend prisma:migrate`: run local migrations
- `pnpm --filter @workspace/backend admin:reset`: reset admin username/password and regenerate bootstrap credential file

## Admin Reset

Reset command reuses bootstrap behavior: it sets admin username to `admin`, resets password, writes `verhub.bootstrap-admin.txt`, and prints credentials in console.

- Local: `pnpm --filter @workspace/backend admin:reset`
- Docker: `docker compose exec verhub pnpm --filter @workspace/backend admin:reset`

## Environment

Copy `.env.example` to `.env` and update values before running local database operations.

## Current Status

Implemented modules:

- `auth`: admin login (JWT) + API key validation guard
- `projects`: admin CRUD + pagination
- `versions`: admin CRUD + pagination
- `announcements`: admin CRUD + pagination
- `feedbacks`: public create + admin query/update/delete
- `logs`: public upload + admin query with level/time filters

Planned next milestones continue from the root `TODO`, including auth module, OpenAPI alignment and broader test coverage.
