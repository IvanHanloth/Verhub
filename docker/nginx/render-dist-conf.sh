#!/bin/sh
# 按 VERHUB_DIST_BASE_URL 生成分发相关的 nginx 配置 http.d/00-verhub-dist.conf：
#   $verhub_serve_dist  该请求域名是否提供 /f/ 直链
#   $verhub_serve_app   该请求域名是否提供后台、页面与接口
#   verhub_dist         /f/ 的分片缓存区，大小由 VERHUB_DIST_CACHE_MAX_SIZE 控制（默认 10g）
# 未配置分发域名，或分发域名与 NEXT_PUBLIC_SITE_URL 相同时，所有域名两者都提供。
set -eu

OUT=/etc/nginx/http.d/00-verhub-dist.conf
CACHE_DIR=/var/cache/nginx/verhub-dist

url_host() {
  printf '%s' "$1" | sed -E 's#^[A-Za-z][A-Za-z0-9+.-]*://##; s#[/?#].*$##; s#^.*@##; s#:[0-9]+$##' | tr 'A-Z' 'a-z'
}

DIST_HOST=$(url_host "${VERHUB_DIST_BASE_URL:-}")
SITE_HOST=$(url_host "${NEXT_PUBLIC_SITE_URL:-}")
CACHE_SIZE=${VERHUB_DIST_CACHE_MAX_SIZE:-10g}

if [ -n "$DIST_HOST" ] && ! printf '%s' "$DIST_HOST" | grep -Eq '^[a-z0-9.-]+$'; then
  echo "[verhub][nginx] invalid VERHUB_DIST_BASE_URL host: $DIST_HOST" >&2
  exit 1
fi

if ! printf '%s' "$CACHE_SIZE" | grep -Eq '^[0-9]+[kKmMgG]?$'; then
  echo "[verhub][nginx] invalid VERHUB_DIST_CACHE_MAX_SIZE: $CACHE_SIZE" >&2
  exit 1
fi

mkdir -p "$CACHE_DIR"

{
  echo "proxy_cache_path $CACHE_DIR levels=1:2 keys_zone=verhub_dist:32m max_size=$CACHE_SIZE inactive=30d use_temp_path=off;"
  if [ -n "$DIST_HOST" ] && [ "$DIST_HOST" != "$SITE_HOST" ]; then
    echo "map \$host \$verhub_serve_dist { hostnames; default 0; $DIST_HOST 1; }"
    echo "map \$host \$verhub_serve_app { hostnames; default 1; $DIST_HOST 0; }"
  else
    echo 'map $host $verhub_serve_dist { default 1; }'
    echo 'map $host $verhub_serve_app { default 1; }'
  fi
} > "$OUT"

if [ -n "$DIST_HOST" ] && [ "$DIST_HOST" != "$SITE_HOST" ]; then
  echo "[verhub][nginx] distribution host: $DIST_HOST (serves /f/ only)"
else
  echo "[verhub][nginx] distribution served on every host"
fi
