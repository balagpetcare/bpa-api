#!/bin/sh
# docker-entrypoint.sh — runs before the API server starts.
# Applies any pending Prisma migrations then hands off to the server.
set -e

echo "[entrypoint] Running database migrations..."
npx prisma migrate deploy

echo "[entrypoint] Migrations complete. Starting BPA API..."
exec node -r dotenv/config dist/server.js
