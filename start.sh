#!/bin/sh
set -e

# Bothost иногда запускает node web/admin/app.js — удаляем устаревший файл
rm -f web/admin/app.js 2>/dev/null || true

export DATA_DIR="${DATA_DIR:-/app/data}"
export PYTHONUNBUFFERED="${PYTHONUNBUFFERED:-1}"
mkdir -p "$DATA_DIR"

echo "[metro-shop] DATA_DIR=$DATA_DIR"
echo "[metro-shop] Starting admin on 0.0.0.0:${PORT:-8080}"

python admin_server.py &
ADMIN_PID=$!

cleanup() {
  kill "$ADMIN_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo "[metro-shop] Starting Telegram bot (main.py)"
exec python main.py
