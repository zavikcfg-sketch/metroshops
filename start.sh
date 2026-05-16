#!/bin/sh
set -e

export DATA_DIR="${DATA_DIR:-/app/data}"
export NODE_ENV="${NODE_ENV:-production}"

# Один PORT для Bothost-прокси (панель + env должны совпадать)
if [ -z "$PORT" ] && [ -n "$ADMIN_PORT" ]; then
  export PORT="$ADMIN_PORT"
fi
export PORT="${PORT:-3000}"
export ADMIN_PORT="$PORT"

mkdir -p "$DATA_DIR"
echo "[metro-shop] DATA_DIR=$DATA_DIR"
echo "[metro-shop] PORT=$PORT (домен Bothost -> этот порт + резерв 3000/8080)"

exec node http-wrapper.js
