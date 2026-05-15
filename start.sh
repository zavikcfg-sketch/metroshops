#!/bin/sh
set -e
export DATA_DIR="${DATA_DIR:-/app/data}"
export NODE_ENV="${NODE_ENV:-production}"
mkdir -p "$DATA_DIR"
echo "[metro-shop] DATA_DIR=$DATA_DIR"
echo "[metro-shop] Starting Node (admin + bot)"
exec node app.js
