#!/bin/sh
set -eu

FRONTEND_NODE_PORT=${FRONTEND_NODE_PORT:-3000}

mkdir -p /etc/nginx/certs
if [ ! -f /etc/nginx/certs/tls.crt ] || [ ! -f /etc/nginx/certs/tls.key ]; then
  echo "[verhub][frontend] generating self-signed TLS certificate"
  openssl req -x509 -nodes -days 3650 -newkey rsa:2048 \
    -subj "/CN=localhost" \
    -keyout /etc/nginx/certs/tls.key \
    -out /etc/nginx/certs/tls.crt >/dev/null 2>&1
fi

echo "[verhub][frontend] starting Next.js runtime"
HOSTNAME="0.0.0.0" PORT="$FRONTEND_NODE_PORT" node web/server.js &
NEXT_PID=$!

echo "[verhub][frontend] starting nginx gateway"
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
