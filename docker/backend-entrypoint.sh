#!/bin/sh
set -eu

attempt=1
max_attempts=30

while [ "$attempt" -le "$max_attempts" ]; do
  echo "[verhub][backend] applying prisma migrations (attempt ${attempt}/${max_attempts})"
  if pnpm --filter @workspace/backend exec prisma migrate deploy; then
    break
  fi

  if [ "$attempt" -eq "$max_attempts" ]; then
    echo "[verhub][backend] failed to apply prisma migrations after ${max_attempts} attempts"
    exit 1
  fi

  attempt=$((attempt + 1))
  sleep 2
done

echo "[verhub][backend] starting api service"
exec node packages/backend/dist/main.js
