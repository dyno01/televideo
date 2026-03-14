#!/bin/bash
set -e

# Define the database path
DB_PATH="/app/db/app.db"

# 1. Restore the database from the replica on startup
# If the bucket is empty, it will just skip this and start fresh.
echo "[Litestream] Checking for existing database backups..."
litestream restore -config /app/litestream.yml -if-db-not-exists -if-replica-exists "$DB_PATH"

# 2. Run Litestream and the Node.js app together
# Litestream will replicate changes to the bucket every second.
echo "[Litestream] Starting application with replication..."
exec litestream replicate -config /app/litestream.yml -exec "node server.js"
