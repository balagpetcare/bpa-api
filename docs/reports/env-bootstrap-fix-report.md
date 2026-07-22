# Environment Bootstrap Fix Report

Date: 2026-06-11
Project: BPA Backend API

## Summary
The backend startup validation was failing because environment variables were being parsed at module import time before the .env file had been loaded into process.env. The validation logic in src/config/index.ts executes immediately when the config module is imported, so any startup path that imports config (including src/server.ts and src/app.ts) could report DATABASE_URL, JWT_ACCESS_SECRET, and JWT_REFRESH_SECRET as missing even when they exist in the local .env file.

## Root Cause
- src/config/index.ts performs `envSchema.safeParse(process.env)` at module load.
- src/server.ts imports `config` at startup, which triggers that validation immediately.
- src/app.ts also imports `config`, so the same validation path is reached during app bootstrap.
- The runtime entrypoints did not preload dotenv before that validation, so process.env did not yet contain the values from .env at the moment the schema was checked.

## Fix Applied
1. Added dotenv loading before config validation in the config module itself.
2. Added dotenv loading in the runtime bootstrap path used by development.
3. Updated the package scripts so:
   - `npm run dev` uses `node -r dotenv/config ...`
   - `npm run build` uses `node -r dotenv/config ...`
   - `npm run start` uses `node -r dotenv/config dist/server.js`
4. Updated the Docker startup path to use `node -r dotenv/config dist/server.js` so container runtime also loads .env values before validation.

## Files Changed
- backend-api/src/config/index.ts
- backend-api/src/server.ts
- backend-api/package.json
- backend-api/docker-entrypoint.sh

## Why This fixes the bootstrap order
The configuration module now loads dotenv before it runs the Zod validation. This means the values from .env are available in `process.env` before the code checks for required variables. As a result, the validation now sees the real secrets and connection string instead of treating them as missing.

## Verification
The following checks were run after the fix:

1. `npm run build`
   - Completed successfully.
2. `npm run dev`
   - Started successfully with:
     - `Database connection established`
     - `BPA API running on port 4000 [development]`
3. Health endpoint check
   - `GET /api/v1/health` returned HTTP 200 with:
     - `{"status":"ok","timestamp":"..."}`
4. Login endpoint check
   - `POST /api/v1/auth/login` returned HTTP 401 with:
     - `{"success":false,"error":{"code":"INVALID_CREDENTIALS","message":"Invalid credentials"}}`

This confirms the backend now starts successfully and the HTTP routes respond, which verifies the environment bootstrap order is fixed for the local development/startup path.

## PM2 / Docker Notes
- PM2 uses the package start script; the updated `start` command now loads dotenv before the built server starts.
- Docker uses the updated entrypoint so the production container also loads dotenv before validation and startup.
