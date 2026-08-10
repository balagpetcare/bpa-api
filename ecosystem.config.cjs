// PM2 production process manager config for BPA API (Express/TS backend).
//
// PROPOSED — this file did not previously exist in this repository. Process
// names below (`bpa-api`, `bpa-worker`) are proposals, not confirmed
// production names. If the target VPS already runs these processes under
// different names (started manually via `pm2 start`), reconcile the names
// before using `pm2 reload`/`pm2 restart` with this file — see
// docs/releases/spay-neuter-production-runbook.md, "Values that must be
// confirmed on the real VPS".
//
// Entrypoints match package.json exactly:
//   API:    npm run start        -> node -r dotenv/config dist/server.js
//   Worker: npm run worker:start -> node -r dotenv/config dist/worker.js
// Both require `npm run build` (tsc -> dist/) and `npx prisma generate`
// to have already run. This file does not build or migrate — it only runs
// the already-built output.
//
// No secrets are set here. Real environment variables (DATABASE_URL,
// EPS_*, CENTRAL_AUTH_*, FIREBASE_*, etc.) must come from the process's
// actual environment (e.g. a `.env` file loaded by `-r dotenv/config`, or
// PM2's own env file mechanism configured on the host) — never hard-code
// them in this committed file.
//
// Usage:
//   pm2 start ecosystem.config.cjs
//   pm2 logs bpa-api
//   pm2 logs bpa-worker
//   pm2 reload bpa-api --update-env
//   pm2 reload bpa-worker --update-env

module.exports = {
  apps: [
    {
      name: 'bpa-api',
      script: 'dist/server.js',
      node_args: '-r dotenv/config',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      kill_timeout: 10000,
      wait_ready: false,
      listen_timeout: 10000,
      env: {
        NODE_ENV: 'production',
      },
      out_file: './logs/bpa-api.out.log',
      error_file: './logs/bpa-api.error.log',
      merge_logs: true,
      time: true,
    },
    {
      name: 'bpa-worker',
      script: 'dist/worker.js',
      node_args: '-r dotenv/config',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      // The worker owns the only recurring in-process job (spay reminder
      // scan, plus any other existing setInterval jobs registered in
      // src/worker.ts). A clean SIGTERM handler in src/worker.ts should
      // clear these intervals before exit; kill_timeout below gives it
      // room to do so before PM2 escalates to SIGKILL.
      kill_timeout: 15000,
      env: {
        NODE_ENV: 'production',
      },
      out_file: './logs/bpa-worker.out.log',
      error_file: './logs/bpa-worker.error.log',
      merge_logs: true,
      time: true,
    },
  ],
};
