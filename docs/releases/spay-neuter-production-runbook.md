# Spay & Neuter — Production Release Runbook

Status: **DRAFT — not executed against production.** Every command in this file is either
marked SAFE (read-only, or writes only to a disposable/local resource) or MUTATES
PRODUCTION (documented but not run). No command in this file has been run against any
production resource while preparing or updating this runbook. See "Commands documented but
not executed" (§17) for the full list of what was deliberately not run.

Scope: rollout of the verified BPA Spay & Neuter booking feature (`bpa_api` module
`src/modules/spay-neuter/**`, `bpa_admin` route group `src/app/(admin)/spay-neuter/**`,
`bpa_user_app` feature `lib/features/spay_neuter/**`) to the production VPS.

Target stack (confirmed from repo config):
- Ubuntu 24.04 VPS, PostgreSQL 16, PM2-managed Node services, Nginx, no Docker.

**No positively identified staging host currently exists.** Two candidate IPs are known
(`163.227.239.5`, previously associated with a production-facing BPA/Vaccination
deployment — not staging, and not to be used; `144.79.249.80`, present only in a local
`known_hosts` file with no confirmed role, username, or environment classification). Per
the standing safety boundary, **no SSH connection has been attempted against either
address**, and none should be until a host is explicitly provisioned and confirmed as
staging by its owner. Every deployment/discovery phase in this document (§4 onward)
remains **BLOCKED — STAGING INFRASTRUCTURE UNAVAILABLE** until that happens — see
`docs/releases/spay-neuter-staging-provisioning-checklist.md` for exactly what's needed to
unblock it.

---

## 0. Backend regression suite — exact verification record

This closes a gap from the prior pass, where two backend test runs were left buffering in
piped background shells with no captured exit code. Both orphaned processes (confirmed via
task-notification exit code 137) were killed, and the full suite was rerun cleanly in the
foreground:

- **Command:** `npx jest --runInBand --forceExit` (run from `bpa_api/`)
- **Exit code:** `1`
- **Log path:** `bpa_api/docs/releases/_test-logs/backend-full-test-20260804_235351.log`
- **Totals:** 62 test suites (61 passed, 1 failed) · 588 tests (587 passed, **1 failed**,
  0 skipped, 0 todo — Jest's summary block reports only "Tests:" with a pass/fail split
  when nothing was skipped or marked `.todo`; the absence of separate "skipped"/"todo"
  lines in the log **is** the record of zero in each category, not an omission)
- **The 1 failure:** `src/modules/campaigns/__tests__/campaign-discovery.test.ts:136`
  (`discoverCampaignsByLocation` nationwide-matching assertion). Classified as
  **pre-existing and unrelated to Spay & Neuter**, on the following direct evidence:
  - `git status --short` shows **zero** working-tree changes to this file or any file in
    `src/modules/campaigns/`.
  - `git log --oneline -- src/modules/campaigns/__tests__/campaign-discovery.test.ts`
    shows exactly one commit — the initial repository commit — meaning this test has not
    been touched during the entire Spay & Neuter implementation.
  - Rerun in isolation (`npx jest --runInBand --forceExit
    src/modules/campaigns/__tests__/campaign-discovery.test.ts`) fails **deterministically**
    with the identical assertion, indicating a test-database fixture/seed-state dependency
    in the vaccination-campaign location-matching logic, not flakiness and not an
    interaction with anything Spay & Neuter added.
  - The failing assertion concerns cat-vaccination-campaign nationwide/location matching —
    zero code or schema overlap with the spay-neuter domain.
- **Targeted re-verification after this pass's fixes:** `npx jest --runInBand --forceExit
  src/modules/spay-neuter src/middlewares/__tests__/spayNeuterEnabled.test.ts` →
  **142/142 passed**, 14/14 suites, exit code 0.

---

## 1. Confirmed process entrypoints

Read directly from each repo's `package.json` — not inferred:

| Repo | Process | Command | Entry file |
|---|---|---|---|
| `bpa_api` | API | `npm run start` | `node -r dotenv/config dist/server.js` |
| `bpa_api` | Worker | `npm run worker:start` | `node -r dotenv/config dist/worker.js` |
| `bpa_admin` | Admin | `npm run start` (via PM2: `next start -p 3001`) | `node_modules/next/dist/bin/next` |

Build commands:
- `bpa_api`: `npm run build` → `tsc` (emits to `dist/`). Requires `npx prisma generate` to
  have run first (the build does not run it automatically).
- `bpa_admin`: `npm run build` → `next typegen && tsc && next build`.

---

## 2. PM2 configuration and process names

**Correction (this revision):** an earlier draft of this document labeled the bpa_admin
ecosystem file "HOST-CONFIRMED." That was inaccurate and has been corrected below. Only
the file's *existence in the repository* was confirmed by reading the repo — nothing about
it has been verified against any real host's actual running PM2 process list, cwd, Node
binary, environment-file path, or log paths. Until a real staging (or production) host is
reached and `pm2 describe <name>` is run against it, every process-identity claim in this
section is **REPOSITORY-SIDE ONLY**, not host-confirmed.

### bpa_admin — REPOSITORY-SIDE RESOLVED (file exists); HOST VERIFICATION REQUIRED (everything about how it actually runs)
`bpa_admin/ecosystem.config.cjs` exists in the repo, declares process name **`bpa-admin`**,
`next start -p 3001`, fork mode, 512M memory cap, logs at
`bpa_admin/logs/bpa-admin.{out,error}.log`. Its own comment states env vars come from
`.env.production.local` symlinked to `/srv/config/bpa/admin.env`. **None of the following
has been confirmed on any real host**: that this file is the one actually loaded by
`pm2 start` on the target host (vs. a process started manually with different flags), that
the process name in a real `pm2 list` is actually `bpa-admin`, that the symlink target
exists, or that the declared log paths are writable on that host.

### bpa_api — REPOSITORY-SIDE RESOLVED (file created this pass); HOST VERIFICATION REQUIRED (reconciliation with whatever the host already runs, if anything)
`bpa_api/ecosystem.config.cjs` (new file), two apps:

| Process name | Script | Notes |
|---|---|---|
| `bpa-api` | `dist/server.js` (`-r dotenv/config`) | fork, 512M cap, 10s kill_timeout (matches `server.ts`'s SIGTERM handler) |
| `bpa-worker` | `dist/worker.js` (`-r dotenv/config`) | fork, 512M cap, 15s kill_timeout (matches `worker.ts`'s SIGTERM handler, gives the reminder-scan interval time to clear) |

**These process names are proposals, not confirmed production names.** If the VPS already
runs `bpa_api`'s server/worker under different PM2 names (started manually at some point in
the past), reconcile the names in §13 before using `pm2 reload`/`pm2 restart` against this
file — using the wrong name creates a second, duplicate process instead of reloading the
existing one.

No secrets are set in either ecosystem file — both only set `NODE_ENV: 'production'` and
rely on the process's real environment (`.env` loaded via `-r dotenv/config`, or a
host-managed env file) for everything else.

---

## 3. Complete environment-variable matrix

Legend: **REQUIRED_API** / **REQUIRED_WORKER** / **REQUIRED_ADMIN** / **OPTIONAL** /
**HOST_VERIFICATION_REQUIRED** (value cannot be determined from source — must be confirmed
on the real VPS or with the external provider).

### bpa_api / bpa_worker (shared process env — both read the same `config/index.ts` schema)

| Variable | Tag | Notes |
|---|---|---|
| `DATABASE_URL` | REQUIRED_API, REQUIRED_WORKER | PostgreSQL 16 connection string |
| `NODE_ENV=production` | REQUIRED_API, REQUIRED_WORKER | enables the fail-fast secret checks in `config/index.ts` |
| `BACKEND_URL` | REQUIRED_API | must be the public HTTPS URL of `bpa_api`; used to build EPS callback URLs |
| `FRONTEND_URL` | REQUIRED_API | non-spay flows' redirect target; unaffected by this feature but must already be correct |
| `ADMIN_BASE_URL` | OPTIONAL | informational only in current code paths |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` | REQUIRED_API | ≥32 chars |
| `CENTRAL_AUTH_JWT_SECRET`, `CENTRAL_AUTH_JWT_ISSUER`, `CENTRAL_AUTH_JWT_AUDIENCE` | REQUIRED_API | gates every `/me/spay-neuter/*` owner-booking route |
| `CENTRAL_AUTH_JWT_PUBLIC_KEY`, `CENTRAL_AUTH_ADDITIONAL_JWT_AUDIENCES`, `CENTRAL_AUTH_JWT_ALGORITHM` | OPTIONAL | only needed if RS256 or multi-audience is in use |
| `AUTH_JWT_SECRET` | REQUIRED_API | ≥32 chars; process **exits at boot** in production if left at the insecure default (`config/index.ts:217`) |
| `EPS_ENABLED` | REQUIRED_API | must be `'true'` for spay advance payment to function at all |
| `EPS_ENV` | REQUIRED_API | must be `production` for go-live (not `demo`/`sandbox`) |
| `PAYMENT_CHANNEL_MODE` | REQUIRED_API | must be `EPS` |
| `EPS_MERCHANT_ID`, `EPS_STORE_ID` (or `EPS_APP_KEY`), `EPS_USERNAME`, `EPS_PASSWORD`, `EPS_HASH_KEY` (or `EPS_SECRET_KEY`) | REQUIRED_API, HOST_VERIFICATION_REQUIRED | production EPS merchant credentials — provisioning status unknown from source |
| `EPS_CALLBACK_IPS` | REQUIRED_API, HOST_VERIFICATION_REQUIRED | comma-separated allowlist; blank = accept all IPs (dev-only posture) — must be populated with EPS's published production IPs before go-live |
| `EPS_BASE_URL` / `EPS_API_BASE_URL` | OPTIONAL | only needed if the SDK's built-in domain doesn't match the real gateway domain |
| `QR_SECRET` | REQUIRED_API | shared HMAC secret spay QR tokens reuse; process **exits at boot** in production if left at the insecure default |
| `REDIS_URL` (or `REDIS_HOST`/`PORT`/`PASSWORD`) | REQUIRED_WORKER | BullMQ notification queue — booking confirmations and reminders depend on this |
| `WORKER_HEALTH_PORT` | REQUIRED_WORKER | default `4100`; confirm no PM2 process collision on the host |
| `FIREBASE_PROJECT_ID` + (`FIREBASE_SERVICE_ACCOUNT_JSON` or `_PATH`) | REQUIRED_WORKER, HOST_VERIFICATION_REQUIRED | push delivery for booking-confirmed/arrival/cutoff reminders runs in the **worker** process specifically; if unset, push fails closed with a `console.warn` + `FCM_DISABLED` no-op (does not crash) — but this must be a deliberate choice, not an oversight |
| `EMAIL_HOST`/`PORT`/`SECURE`/`USER`/`PASS`/`FROM` | REQUIRED_WORKER | transactional email (receipts, confirmations) |
| `CORS_ORIGINS` | REQUIRED_API | must include the production admin and (if applicable) web origins |
| `SPAY_HOLD_RATE_LIMIT_MAX` | OPTIONAL | defaults to `20` if unset |
| `SPAY_BOOKING_RATE_LIMIT_MAX` | OPTIONAL | defaults to `10` if unset |
| `SPAY_NEUTER_ENABLED` | OPTIONAL | defaults to `'true'` (enabled); set to `'false'` only for emergency disable — see §7 |
| `MAIL_CREDENTIAL_SECRET` | REQUIRED_API | ≥32 chars; process exits at boot in production if missing/short |
| `AUTH_COOKIE_NAME`, `AUTH_JWT_EXPIRES_IN`, `AUTH_PUBLIC_WEB_URL`, `AUTH_ADMIN_WEB_URL`, `AUTH_API_URL` | REQUIRED_API | shared web/app auth cookie config, unaffected by this feature but must already be correct |

### bpa_admin

| Variable | Tag | Notes |
|---|---|---|
| `NEXTAUTH_URL` | REQUIRED_ADMIN | e.g. `https://admin.<domain>` |
| `NEXTAUTH_SECRET` | REQUIRED_ADMIN | |
| `BACKEND_API_URL` | REQUIRED_ADMIN | server-side, e.g. `https://api.<domain>/api/v1` |
| `NEXT_PUBLIC_API_BASE_URL`, `NEXT_PUBLIC_API_URL` | REQUIRED_ADMIN | client-side, baked in at build time — a wrong value here requires a **rebuild**, not just an env change |
| `CENTRAL_AUTH_WEB_URL`, `CENTRAL_AUTH_API_URL`, `NEXT_PUBLIC_AUTH_WEB_URL`, `ADMIN_PANEL_URL` | REQUIRED_ADMIN | Central Auth SSO; production values differ from the `localhost` dev defaults in `.env.example` |
| `NEXT_PUBLIC_GTM_ID`, `NEXT_PUBLIC_GA_ID`, `NEXT_PUBLIC_META_PIXEL_ID`, `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION`, `NEXT_PUBLIC_FACEBOOK_DOMAIN_VERIFICATION`, `NEXT_PUBLIC_GOOGLE_ADS_ID` | OPTIONAL | analytics/marketing, unrelated to this feature |

No spay-specific env vars are needed in `bpa_admin` — it calls the feature exclusively
through the existing `/api/backend/[...path]` proxy to `bpa_api`.

### bpa_user_app (Flutter)

No new build-time secrets. Uses the existing configured API base URL. Sends
`platform: 'mobile'` on every booking request (fixed in this pass — see §9) so the EPS
post-payment callback redirects via the `bpa://payment/...` deep link instead of a web URL.

`.env.example` in `bpa_api` has been updated with `SPAY_HOLD_RATE_LIMIT_MAX` and
`SPAY_BOOKING_RATE_LIMIT_MAX` (previously used in code with silent defaults but undocumented).

---

## 4. Nginx — read-only host-verification commands

No committed Nginx site config exists in any of the three repos — this section is entirely
HOST_VERIFICATION_REQUIRED. This feature adds **no new Nginx routes**: all endpoints are
under the existing `/api/v1/**` prefix, which is presumed already proxied as a block.
Confirm, do not assume:

```bash
# SAFE — read-only
sudo nginx -t
grep -n "location" /etc/nginx/sites-enabled/*.conf
curl -sf https://api.<domain>/api/v1/health
curl -sf https://api.<domain>/api/v1/public/spay-neuter/verify/nonexistent-token   # expect 404, not 502/timeout — proves the prefix routes through
```

---

## 5. EPS provider prerequisites

- Confirm production `EPS_MERCHANT_ID`/`EPS_STORE_ID`/`EPS_USERNAME`/`EPS_PASSWORD`/
  `EPS_HASH_KEY` are provisioned and distinct from sandbox credentials.
- Confirm `BACKEND_URL`'s production value is registered with EPS as the allowed callback
  origin for `/api/v1/payment/callback/{success,fail,cancel}` and
  `/api/v1/public/payments/eps/{callback,ipn}` (these are shared with the existing
  campaign-payment flow — spay reuses them exactly, no new callback routes were added).
- Confirm `EPS_CALLBACK_IPS` is populated with EPS's published production callback IP
  range — leaving it blank accepts callbacks from any IP, which is acceptable in
  development only.
- **No live EPS sandbox/production credential was available to this pass** — the callback
  authenticity mechanism was verified by reading `settlePayment()`
  (`src/modules/payments/payments.service.ts:117-176`): the callback body's claimed status
  is **never trusted**; the backend always re-verifies with EPS server-to-server via
  `eps.verifyPayment({merchantTransactionId})` before changing any payment/booking state.
  The callback payload is used only to look up *which* transaction to re-verify. This is a
  sound design, but it has not been exercised against a live EPS endpoint in this pass —
  treat the first live callback as higher-risk than the rest of the smoke suite.

---

## 6. Firebase worker prerequisites

- `FIREBASE_PROJECT_ID` + service-account credential must be set on the **worker**
  process's environment specifically — the spay reminder scan
  (`startSpayReminderScanJob`, `src/worker.ts`) and all push delivery run there, not in
  the API process.
- Confirmed by reading `src/providers/firebase.provider.ts`: initialization is lazy
  (`ensureInitialized()`, guarded by `initAttempted` so it only runs once), and fails
  **safely closed**, not crashing — with no credentials it logs one `console.warn` and all
  subsequent `send()` calls return `{ ok: false, error: 'FCM_DISABLED' }`. Outbox/inbox
  writes still happen; only the actual push delivery no-ops. This is acceptable for a
  soft-launch (push is a nice-to-have for reminders, not a booking-blocking dependency) but
  must be a **deliberate choice**, confirmed with stakeholders, not a silent gap.
- Confirmed via `grep`: `startSpayReminderScanJob` is imported and invoked **only** in
  `src/worker.ts`; `src/server.ts` does not reference it. Starting both `bpa-api` and
  `bpa-worker` cannot double-register the reminder interval, because only one process ever
  calls the function that creates it.

---

## 7. `SPAY_NEUTER_ENABLED` — emergency disable / re-enable procedure

Implemented in this pass (previously did not exist in code, despite being named in the
original architecture contract):

- **Config**: `SPAY_NEUTER_ENABLED` in `src/config/index.ts`, zod enum `'true'|'false'`,
  **default `'true'`** (this is a live, released feature — the flag is a kill switch, not
  an opt-in gate).
- **Enforcement**: new middleware `src/middlewares/spayNeuterEnabled.ts`
  (`requireSpayNeuterEnabled`), wired onto exactly two routes in
  `spay-neuter.router.ts`: `POST /me/spay-neuter/holds` and `POST /me/spay-neuter/bookings`
  — the only two entry points that start a new money-committing flow.
- **What stays available when disabled**: all reads (offer/availability browsing, booking
  history, receipts, QR verification), reschedule/cancel of an **existing** booking, and
  every admin/clinic route (historical records, reports, refund review, check-in for
  already-confirmed bookings). Disabling never hides or corrupts existing data — it only
  blocks the creation of new holds/bookings.
- **Error contract**: disabled requests receive a typed `503 SERVICE_UNAVAILABLE` with
  `error.code = "SPAY_NEUTER_DISABLED"` (via new `AppError.serviceUnavailable()`), a stable
  shape both Flutter and Admin can pattern-match on.
- **Tests**: `src/middlewares/__tests__/spayNeuterEnabled.test.ts` — 3 tests (enabled →
  `next()`, disabled → typed 503, and a defensive case-sensitivity guard) — all passing.

**Emergency disable procedure** (mutates production — requires a process restart to take
effect, since env vars are read once at process boot via `config/index.ts`):
```bash
# MUTATES PRODUCTION — edit the host's env file for bpa-api (path is
# HOST_VERIFICATION_REQUIRED — wherever bpa-api's real .env lives), set:
#   SPAY_NEUTER_ENABLED=false
pm2 reload bpa-api --update-env
```
Note this only needs to touch `bpa-api` (the process serving `/me/spay-neuter/holds` and
`/bookings`) — `bpa-worker` and `bpa-admin` don't need to be touched to take effect, though
reloading the worker too is harmless.

**Re-enable**: set `SPAY_NEUTER_ENABLED=true` (or remove the line, since `true` is the
default) and `pm2 reload bpa-api --update-env` again.

**Faster, data-level alternative** that requires no deploy/reload at all: an Admin can
Pause every published `SpayOffer` (Admin → Spay & Neuter → Offers → Pause). This is
enforced server-side in `getPublicOffer` (offers must be `status: 'published'`), not just
hidden client-side, and takes effect the next request with no process restart. Prefer this
for a fast, surgical pause; use `SPAY_NEUTER_ENABLED=false` for a hard kill switch that
also blocks the raw hold/booking endpoints directly regardless of offer state (e.g. if an
offer's own pause logic were ever found to be broken).

---

## 8. Database backup and migration sequence

### Backup (SAFE — read-only against the database)
```bash
mkdir -p /srv/bpa/bpa_api/backups
pg_dump --format=custom \
  --file="/srv/bpa/bpa_api/backups/bpa_db_backup_$(date +%Y%m%d_%H%M%S)_pre_spay_neuter.dump" \
  "$DATABASE_URL"
pg_restore --list "/srv/bpa/bpa_api/backups/bpa_db_backup_<timestamp>_pre_spay_neuter.dump" | head -50
```
(Matches the existing convention already present in the repo: `backups/bpa_db_backup_20260723_123756.dump`.)

### Migrations, in execution order (all additive — new tables/enums only, no drops)
1. `20260803214227_add_spay_neuter_booking_system`
2. `20260803214500_add_spay_booking_number_seq`
3. `20260803223154_add_spay_scheduling_engine`
4. `20260804080615_add_spay_booking_payment_refund_workflow`
5. `20260804153000_add_spay_operation_day_workflow`
6. `20260804153100_add_spay_reporting_indexes`

### Preflight (SAFE — read-only)
```bash
cd /srv/bpa/bpa_api
npx prisma migrate status
```
**Verified in this pass** on a disposable local database (`spay_readiness_check`, created
and dropped locally, never touching any shared dev or production database): a full
`prisma migrate deploy` from empty fails at an **unrelated, pre-existing** migration,
`20260723111920_add_push_notification_system` — `relation "partner_clinics" does not
exist`. Evidence this is not caused by this feature: the migration's timestamp is 11 days
older than the first spay migration, its SQL contains zero references to spay/neuter
tables, and `git log` shows this migration file has not changed since the initial commit.
Reproduced identically both in the prior verification pass and again in this pass — stable,
not flaky.

Structural validity of the full current schema (spay tables included) was confirmed
separately on the same disposable database via `prisma db push --force-reset
--accept-data-loss` (schema-driven, bypasses the broken history) — **succeeded cleanly**.

The local dev database (`bpa_db`) already has all 60 migrations applied
(`npx prisma migrate status` → "Database schema is up to date!"), meaning it already has
`partner_clinics`, which is strong indirect evidence — **not proof** — that a real,
continuously-operated production database (which must predate this migration to be
running at all) already has it too. **This must still be confirmed directly against the
production database with `migrate status` before running `migrate deploy`** — do not treat
the dev-DB result as a substitute for checking prod.

If `migrate status` against production shows any unexpected pending/failed migration
besides the 6 spay migrations, STOP — this is a production-DB state question outside the
scope of what this runbook can resolve in advance.

### Apply (MUTATES PRODUCTION — do not run without go/no-go sign-off, §12)
```bash
cd /srv/bpa/bpa_api
npx prisma migrate deploy   # NEVER use `prisma migrate dev` against production
```

### Backward-compatibility
The 6 spay migrations are purely additive (new tables, new enums — confirmed by listing
each migration's SQL; none contain `DROP`/`ALTER ... DROP COLUMN`/`ALTER TYPE ... DROP
VALUE`). Old application code (pre-this-release) run against a post-migration schema is
safe — it simply never queries the new tables. This means the **application rollback**
path (§10) does not require any database rollback.

---

## 9. Confirmed defect fixed in this pass: mobile deep-link redirect

**Root cause found by code inspection, not observed in production**: spay-neuter bookings
are created exclusively from the Flutter app (there is no web booking flow for this
feature), but `createBookingFromHold()` never set `Payment.payload.platform`, so the
EPS success/fail/cancel callback's `isMobilePayment()` check
(`payment-callbacks.router.ts:93-94`, which reads `payload?.platform === 'mobile'`) would
always evaluate false for spay payments — meaning **every** spay-neuter payer would have
been redirected to a web URL after paying instead of returning to the app via the
`bpa://payment/...` deep link, mirroring the existing, working campaign-registration
pattern (`campaign-registrations.service.ts`, which does set `platform` from a client
DTO field).

**Fix applied**:
- `bpa_api/src/modules/spay-neuter/spay-neuter.types.ts` — added
  `platform: z.enum(['web','mobile']).optional().default('web')` to `createBookingSchema`.
- `bpa_api/src/modules/spay-neuter/spay-neuter.booking.service.ts` — added `platform` to
  `CreateBookingInput`, stamped onto `Payment.payload.platform` at creation.
- `bpa_api/src/modules/spay-neuter/spay-neuter.controller.ts` — threads `dto.platform`
  through to the service call.
- `bpa_user_app/lib/services/api/bpa_api_service.dart` — `createSpayBooking()` now sends
  `'platform': 'mobile'` in the request body, matching the existing campaign-registration
  convention exactly.
- New test: `spay-neuter.booking-platform.test.ts` (2 tests) — proves `'mobile'` propagates
  to `Payment.payload.platform`, and that omitting it defaults safely to `'web'` rather
  than leaving the field undefined.

This must be deployed as a matched pair — an old Flutter app build talking to a new
backend still defaults to `'web'` (safe, just doesn't fix the redirect); a new Flutter app
build talking to an old backend sends `platform: 'mobile'` into a body the old schema
simply ignores (safe, zod schemas here don't reject unknown-but-harmless extra fields in
this codebase's convention — verified no `.strict()` on `createBookingSchema`). Neither
combination breaks; only the new+new combination gets the actual fix.

---

## 10. Deployment order

**database → API → worker → admin → mobile/web publication controls**

```bash
# MUTATES PRODUCTION — run only after go/no-go sign-off (§12)

# 1. Backup + migrate (§8)
pg_dump ... && npx prisma migrate deploy

# 2. Build + reload API
cd /srv/bpa/bpa_api && npm ci && npx prisma generate && npm run build
pm2 reload bpa-api --update-env

# 3. Reload worker (same build output, separate process)
pm2 reload bpa-worker --update-env

# 4. Build + reload Admin
cd /srv/bpa/bpa_admin && npm ci && npm run build
pm2 reload bpa-admin --update-env

# 5. Publication controls — only AFTER 1-4 pass health checks (§4):
#    Admin creates/publishes the first live SpayOffer (SpayOffer.status: draft -> published).
#    Until this step, the feature is deployed but inert (no offers visible), regardless of
#    SPAY_NEUTER_ENABLED — see §7 for how these two controls relate.
#    Flutter app store rollout (if a new build is needed for the platform:'mobile' fix in
#    §9) proceeds on its own store-review timeline, independent of the backend/admin
#    deploy — old app builds remain safe against the new backend (see §9's compatibility note).
```

---

## 11. Smoke-test matrix

All against production only after go/no-go sign-off. Each marked with its data footprint.

| # | Test | Expected result | Data footprint |
|---|---|---|---|
| 1 | Offer visibility | `GET /public/spay-neuter/offers/:offerId` returns the published test offer; a paused/draft offer returns 404 | read-only |
| 2 | Slot capacity | Availability endpoint reflects clinic's configured concurrent-operation capacity; a fully-booked slot is excluded | read-only |
| 3 | Temporary hold | `POST /me/spay-neuter/holds` succeeds, returns `expiresAt` ~10 min out; a second hold for the same last-capacity slot from a different user is rejected | creates 1-2 disposable holds |
| 4 | Successful advance payment | Complete EPS payment for the test hold; booking transitions `pending_payment` → `confirmed` only after the server-verified callback lands, never on client redirect alone | 1 real test booking + real EPS transaction |
| 5 | Failed/cancelled payment | Cancel at the EPS gateway; booking transitions to `cancelled_by_owner` with `cancellationReasonCode: payment_failed`; slot capacity is released (provable by successfully re-holding the same slot) | 1 test booking, cancelled |
| 6 | Duplicate callback | Manually replay the same EPS callback (or let IPN + redirect both fire naturally); booking is confirmed exactly once, `advancePaidBdt` not double-applied, exactly one `confirmed` status-history row | uses booking from #4 |
| 7 | Booking confirmation | Confirmation push/email/in-app notification received for the confirmed test booking | read-only observation |
| 8 | Remaining clinic balance | Confirmed booking's `balanceDueBdt == totalPriceBdt - advancePaidBdt` exactly | read-only |
| 9 | Admin status update | Admin/clinic role transitions the test booking through check-in → pre-op → ready → operation → complete (or a cancel path); each transition writes an audit row and status-history row | mutates test booking |
| 10 | Reminder delivery | Spay reminder scan (runs every 5 min in `bpa-worker`) picks up the test booking if its `arriveByAt`/cutoff window is reached; confirm via `pm2 logs bpa-worker \| grep SpayReminderScan` | read-only observation |
| 11 | QR/booking verification | `GET /public/spay-neuter/verify/:qrToken` for the test booking's real QR returns output-minimized data (no medical fields); an unknown/stale token returns the documented not-found/stale response | read-only |
| 12 | Disabled kill-switch behavior | With `SPAY_NEUTER_ENABLED=false` on a **non-production** environment (staging, or a scoped canary), confirm `POST /me/spay-neuter/holds` and `/bookings` return `503 SPAY_NEUTER_DISABLED`, while `GET /me/spay-neuter/bookings` (history) and admin routes remain 200 | staging/canary only — **do not disable production to run this test**; covered locally by `spayNeuterEnabled.test.ts` |

Clean up the test booking through the normal cancellation flow after the suite (not a
direct row delete), so the audit trail and refund logic get exercised as a side effect.

---

## 12. GO/NO-GO checklist

All must be true before proceeding past §10 step 1:

- [ ] `npx prisma migrate status` against **production** shows only the 6 spay migrations
      pending, nothing failed/drifted.
- [ ] Pre-migration backup taken and its table-of-contents verified with `pg_restore --list`.
- [ ] `EPS_ENABLED=true`, `EPS_ENV=production`, `PAYMENT_CHANNEL_MODE=EPS`, all 5 EPS
      credential vars set, `EPS_CALLBACK_IPS` populated — confirmed on the real host, not
      assumed.
- [ ] `BACKEND_URL` production value registered with EPS as an allowed callback origin.
- [ ] `FIREBASE_PROJECT_ID` + service-account set on the **worker** process specifically
      (or a deliberate, stakeholder-approved decision to launch with push disabled).
- [ ] `QR_SECRET`, `AUTH_JWT_SECRET`, `MAIL_CREDENTIAL_SECRET` are non-default production
      values (the app will refuse to boot in production otherwise — this is enforced in
      code, not just a checklist item).
- [ ] `bpa_api/ecosystem.config.cjs` process names reconciled against whatever the VPS
      actually runs (§2) — or the VPS's real ecosystem file confirmed to match.
- [ ] Nginx confirmed (read-only) to proxy `/api/v1/**` through to `bpa-api`.
- [ ] No `SpayOffer` is `published` yet (deploy dark first — see §10 step 5), unless a
      deliberate immediate-launch decision has been made and communicated.
- [ ] Rollback owner and communication channel identified for the release window.

If any box is unchecked: **NO-GO**.

---

## 13. Values that must be confirmed on the real VPS

**Correction (this revision):** a prior version of this section implied 7 flat, equally-
weighted unknowns. That undercounted and mis-categorized the actual gap — several items
bundle multiple independently-verifiable facts, and each has a different verification
*owner* (host administrator vs. EPS vs. Firebase). Restated below as a categorized status
matrix; nothing in this table should be read as "resolved" until the specific check next
to it has actually been run against a real host or provider dashboard.

| # | Item | Status | Owner |
|---|---|---|---|
| 1 | PM2 ecosystem file for bpa_api (process definitions exist) | **REPOSITORY-SIDE RESOLVED** — file created this pass | — |
| 2 | PM2 process **names**, `cwd`, Node binary path, environment-file path, log paths actually in use on the host | **HOST VERIFICATION REQUIRED** | host admin |
| 3 | `/srv/config/bpa/admin.env` symlink existence/target (bpa_admin) | **HOST VERIFICATION REQUIRED** | host admin |
| 4 | Nginx site config and `/api/v1/` proxy_pass routing | **HOST VERIFICATION REQUIRED** — no config file exists in any of the three repos to check against | host admin |
| 5 | EPS production/sandbox merchant credentials provisioned | **PROVIDER VERIFICATION REQUIRED** | EPS |
| 6 | EPS callback origin registered for `BACKEND_URL` | **PROVIDER VERIFICATION REQUIRED** | EPS |
| 7 | EPS sandbox end-to-end payment test (create → pay → server-verified callback → confirm) | **STILL REQUIRED — NOT YET PERFORMED**, mocked coverage only exists at the unit-test level | this team, against EPS sandbox |
| 8 | Firebase service-account credentials on the **worker** process specifically | **HOST/PROVIDER VERIFICATION REQUIRED** | host admin + Firebase |
| 9 | Whether the target database already contains `partner_clinics` (resolves the migration-history gap, §8) | **HOST VERIFICATION REQUIRED** — near-certain for any already-running system, confirmed only on the local dev DB in this pass, never checked against staging or production | host admin / DBA |
| 10 | Real staging/production domain names | **HOST VERIFICATION REQUIRED** — this document uses `<domain>` placeholders throughout | host admin |

**Do not describe PM2 (or any other row above) as "fully resolved"** in status updates —
only item 1 (the file's existence) is repository-side resolved; every other row requires an
action against a real host or external provider that has not yet happened.

---

## 14. Rollback decision tree

```
Did the migration (prisma migrate deploy) fail or leave a partial/failed migration row?
├─ YES → STOP. Do not proceed to API/worker/admin reload. Investigate the specific
│        migration failure directly (do not blindly retry). Since all 6 migrations are
│        additive, a clean re-run after fixing the blocking issue is safe; do NOT attempt
│        `prisma migrate resolve --rolled-back` or hand-write DROP statements.
└─ NO → did API/worker reload succeed and pass health checks (§4)?
    ├─ NO (crash-loop / health check fails) → Application rollback (§15). DB stays as-is
    │    (additive migrations are safe under old code — see §8 "Backward-compatibility").
    └─ YES → run smoke tests (§11). Any BLOCKER-class failure (overbooking, cross-branch
             leak, payment confirms without verified callback, refund/payment alterable by
             clinic role)?
        ├─ YES → Application rollback (§15) AND flip SPAY_NEUTER_ENABLED=false (or pause
        │        all offers) even after rollback, until root-caused.
        └─ NO → proceed to §10 step 5 (publication).
```

---

## 15. Application rollback and forward-only database recovery strategy

**Application rollback (safe, fast — mutates production process state, not the DB schema):**
```bash
# MUTATES PRODUCTION
cd /srv/bpa/bpa_api && git checkout <previous-release-tag-or-sha> && npm ci && npm run build
pm2 reload bpa-api --update-env
pm2 reload bpa-worker --update-env

cd /srv/bpa/bpa_admin && git checkout <previous-release-tag-or-sha> && npm ci && npm run build
pm2 reload bpa-admin --update-env
```

**Database is forward-only.** Do not attempt to reverse `migrate deploy`. All 6 spay
migrations are strictly additive; old code never queries the new tables, so rolling the
application back while the new schema remains in place is safe by construction. Do not run
`prisma migrate resolve --rolled-back` or hand-written `DROP TABLE`/`DROP TYPE` against
production — Postgres enum values cannot be cleanly removed once added, and there is no
technical need to remove them.

If a migration itself is later found to be defective (not just the application code): pause
the feature (§7), restore the pre-migration backup into a **separate scratch database** to
inspect/extract any data written during the incident window, then write and test a proper
forward-fix migration. Never restore a backup directly over live production while it
continues serving unrelated traffic — that is a destructive action against every other
feature in the same database, not a scoped fix.

---

## 16. Post-release reconciliation checks (SAFE, read-only)

```sql
-- Every confirmed booking should have exactly one settled advance payment
select b.id from spay_bookings b
  left join payments p on p.id = b.payment_id and p.status = 'success'
  where b.status not in ('pending_payment','cancelled_by_owner','cancelled_by_clinic')
    and p.id is null;
-- expect 0 rows

-- No slot should show booked_count exceeding capacity
select id, booked_count, capacity from spay_slots where booked_count > capacity;
-- expect 0 rows

-- Every processed refund must trace to a central-admin actor, never a clinic-role actor
select r.id from spay_refund_requests r
  join audit_logs a on a.resource_id = r.id and a.action = 'update' and a.resource = 'spay_refund_requests'
  join users u on u.id = a.actor_id
  where r.status = 'processed' and u.role like 'clinic_%';
-- expect 0 rows
```
Reconcile advance-collection totals from `GET /admin/spay-neuter/reports/summary` against
actual EPS settlement reports for the release window before declaring the release
financially clean.

---

## 17. Commands documented but not executed

Every command in this document tagged "MUTATES PRODUCTION" was written for operator use
during the real release and was **not run** while preparing this runbook. Specifically not
executed against any host: `pm2 start|reload|restart` of any kind, `prisma migrate deploy`
against any non-disposable database, `pg_dump`/`pg_restore` against any real database,
`git checkout` of any release tag/sha, `nginx -t`/`systemctl reload nginx` on a real host,
any `curl` against a `<domain>` placeholder, and the entire smoke-test matrix (§11). What
**was** executed in preparing this runbook: `npm ci`/build/test/typecheck commands against
the three local repo checkouts, and `prisma migrate deploy` / `prisma db push` against a
disposable, locally-created-and-dropped PostgreSQL database (`spay_readiness_check`) that
touched no shared or production resource.
