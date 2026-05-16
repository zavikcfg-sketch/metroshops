#!/bin/sh
set -e

export DATA_DIR="${DATA_DIR:-/app/data}"
export NODE_ENV="${NODE_ENV:-production}"
# Bothost проксирует домен на PORT из панели
export PORT="${PORT:-3000}"

mkdir -p "$DATA_DIR"
echo "[metro-shop] DATA_DIR=$DATA_DIR PORT=$PORT"

exec node http-wrapper.js
