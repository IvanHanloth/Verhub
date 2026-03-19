# Verhub Monorepo

Verhub is a version management platform with the following core capabilities:

- Version management
- Announcement management
- Feedback management
- Log management
- Admin-side project management

This repository uses `pnpm` + `turbo` monorepo architecture.

## Workspace Structure

- `web`: Next.js admin web app (React + shadcn + Tailwind CSS)
- `packages/ui`: shared UI component library
- `packages/backend`: NestJS backend service (PostgreSQL + Prisma)
- `packages/eslint-config`: shared ESLint config
- `packages/typescript-config`: shared TypeScript config

## Tech Stack

- Package manager: `pnpm`
- Monorepo orchestration: `turbo`
- Frontend: `Next.js` + `React` + `shadcn/ui` + `Tailwind CSS`
- Backend: `NestJS`
- Database: `PostgreSQL`
- ORM: `Prisma`
- Engineering tools: `ESLint` + `Prettier` + `lint-staged` + `Husky`

## Quick Start

1. Install dependencies

```bash
pnpm install
```

1. Configure backend environment

```bash
cp packages/backend/.env.example packages/backend/.env
```

1. Run development mode

```bash
pnpm dev
```

## Modern Admin Auth Flow

- Admin pages are under `/dashboard` with left sidebar navigation.
- Unauthenticated access to `/dashboard` is redirected to `/` (password login page).
- Login supports username/password only; direct token input login is disabled.
- Successful login issues a short-lived JWT session and redirects back to the original path.
- Long-lived API tokens can be created/revoked in `Dashboard -> Token 管理`.

## Bootstrap Admin Behavior

- Backend stores admin credentials in database (`User` table).
- On first startup with empty database, backend auto-creates `admin` with a random password.
- The bootstrap credential is written to a temporary file `verhub.bootstrap-admin.txt`.
- After first successful login, this temporary credential file is removed automatically.

## Quality Commands

- Lint all workspaces: `pnpm -r lint`
- Type check all workspaces: `pnpm -r typecheck`
- Format all files: `pnpm format`
- Check formatting: `pnpm format:check`
- Frontend tests: `pnpm --filter web test`

## Backend Commands

- Start backend in watch mode: `pnpm --filter @workspace/backend dev`
- Generate Prisma client: `pnpm --filter @workspace/backend prisma:generate`
- Run Prisma migrations: `pnpm --filter @workspace/backend prisma:migrate`
- Unit tests: `pnpm --filter @workspace/backend test`
- E2E tests: `pnpm --filter @workspace/backend test:e2e`

## Docker Deployment

The repository includes production-ready Docker artifacts:

- `docker-compose.yml`
- `docker/backend.Dockerfile`
- `docker/web.Dockerfile`
- `.env.example`

Quick start:

```bash
cp .env.example .env
docker compose --env-file .env up -d --build
```

For both deployment methods (Compose and direct Docker), see:

- `docs/DOCKER-DEPLOYMENT.md`

## Commit Gate

The repository enables `Husky` + `lint-staged` pre-commit checks.

When committing, staged files are automatically:

- linted and auto-fixed by ESLint
- formatted by Prettier

## Development Guide

- Detailed local setup, environment variables, and commit conventions: `docs/DEVELOPMENT.md`

## Current Progress

Current milestone has completed:

- monorepo and engineering tooling baseline
- backend NestJS scaffolding
- PostgreSQL Prisma schema baseline
- project module CRUD API (with pagination)
- version and announcement module CRUD API
- feedback module CRUD API (public create + admin query/update/delete)
- log upload/query API (public upload + admin filtered query)
- auth module (admin JWT login + API key validation)
- Next.js admin homepage framework (App Router + shadcn)

Next milestones continue from `TODO` in repository root.
