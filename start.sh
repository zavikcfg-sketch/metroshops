#!/bin/sh
set -e

export DATA_DIR="${DATA_DIR:-/app/data}"
export NODE_ENV="${NODE_ENV:-production}"
mkdir -p "$DATA_DIR"

echo "[metro-shop] DATA_DIR=$DATA_DIR"
echo "[metro-shop] PORT=${PORT:-8080}"

# Веб для домена Bothost (adminpanelbots.bothost.tech)
node http-wrapper.js &
WRAPPER_PID=$!

cleanup() {
  kill "$WRAPPER_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo "[metro-shop] Starting Telegram bot"
exec node app.js
