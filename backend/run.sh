#!/bin/bash
set -e

# Define the database path
DB_PATH="/app/db/app.db"

# 1. Check if Litestream is configured
if [ -n "$LITESTREAM_BUCKET" ] && [ -n "$LITESTREAM_ACCESS_KEY_ID" ]; then
  echo "[Litestream] Checking for existing database backups..."
  litestream restore -config /app/litestream.yml -if-db-not-exists -if-replica-exists "$DB_PATH" || true

  # 2. Run Litestream and the Node.js app together
  echo "[Litestream] Starting application with replication..."
  exec litestream replicate -config /app/litestream.yml -exec "node server.js"
else
  echo "[Backend] Litestream bucket/credentials not detected. Starting Node server directly..."
  exec node server.js
fi
