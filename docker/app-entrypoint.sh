#!/bin/sh
set -e

BACKEND_PORT=${BACKEND_PORT:-4000}
FRONTEND_PORT=${FRONTEND_PORT:-3000}

# 启动后端服务（在后台）
echo "Starting backend service..."
PORT="$BACKEND_PORT" backend-entrypoint.sh &
BACKEND_PID=$!

# 等待后端启动
sleep 2

# 启动前端应用
echo "Starting frontend application..."
cd /app && PORT="$FRONTEND_PORT" exec node web/server.js
