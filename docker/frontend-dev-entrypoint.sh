#!/bin/sh
set -eu

FRONTEND_NODE_PORT=${FRONTEND_NODE_PORT:-3000}

mkdir -p /etc/nginx/certs
if [ ! -f /etc/nginx/certs/tls.crt ] || [ ! -f /etc/nginx/certs/tls.key ]; then
  echo "[verhub][frontend-dev] generating self-signed TLS certificate"
  openssl req -x509 -nodes -days 3650 -newkey rsa:2048 \
    -subj "/CN=localhost" \
    -keyout /etc/nginx/certs/tls.key \
    -out /etc/nginx/certs/tls.crt >/dev/null 2>&1
fi

# Force webpack instead of the web package's `dev` script (which uses Turbopack,
# also the Next 16 default). Turbopack's watcher does not see writes arriving
# through a bind mount from a Windows/macOS host and offers no polling escape
# hatch; webpack honours WATCHPACK_POLLING, set in docker-compose.dev.yml.
echo "[verhub][frontend-dev] starting Next.js dev server (webpack + polling)"
HOSTNAME="0.0.0.0" PORT="$FRONTEND_NODE_PORT" \
  pnpm --filter web exec next dev --webpack --port "$FRONTEND_NODE_PORT" --hostname 0.0.0.0 &
NEXT_PID=$!

echo "[verhub][frontend-dev] starting nginx gateway"
nginx -g "daemon off;" &
NGINX_PID=$!

on_term() {
  kill -TERM "$NEXT_PID" "$NGINX_PID" 2>/dev/null || true
}

trap on_term TERM INT

while true; do
  if ! kill -0 "$NEXT_PID" 2>/dev/null; then
    set +e
    wait "$NEXT_PID" 2>/dev/null
    EXIT_CODE=$?
    set -e
    on_term
    wait "$NGINX_PID" 2>/dev/null || true
    exit "$EXIT_CODE"
  fi

  if ! kill -0 "$NGINX_PID" 2>/dev/null; then
    set +e
    wait "$NGINX_PID" 2>/dev/null
    EXIT_CODE=$?
    set -e
    on_term
    wait "$NEXT_PID" 2>/dev/null || true
    exit "$EXIT_CODE"
  fi

  sleep 1
done
