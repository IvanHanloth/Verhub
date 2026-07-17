#!/bin/sh
set -eu

attempt=1
max_attempts=30

while [ "$attempt" -le "$max_attempts" ]; do
  echo "[verhub][backend-dev] applying prisma migrations (attempt ${attempt}/${max_attempts})"
  if pnpm --filter @workspace/backend exec prisma migrate deploy; then
    break
  fi

  if [ "$attempt" -eq "$max_attempts" ]; then
    echo "[verhub][backend-dev] failed to apply prisma migrations after ${max_attempts} attempts"
    exit 1
  fi

  attempt=$((attempt + 1))
  sleep 2
done

# The schema is bind-mounted, so it may have changed since the image was built.
echo "[verhub][backend-dev] regenerating prisma client"
pnpm --filter @workspace/backend prisma:generate

echo "[verhub][backend-dev] starting api service in watch mode"
exec pnpm --filter @workspace/backend dev
