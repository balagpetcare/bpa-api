# Target Database Seed Reconciliation Report

Verification date: July 22, 2026

## Canonical repository path

- `D:\bpa_main\bpa_api`

## Repository identity

- working directory: `D:\bpa_main\bpa_api`
- Git root: `D:\bpa_main\bpa_api`
- branch: `main`
- remote: `https://github.com/balagpetcare/bpa-api.git`
- latest commit: `4c09b8f feat: initialize Bangladesh Pet Association API`
- package name: `bpa-backend-api`

## Sanitized target database identity

Target database selected by the repository:

- database name: `bpa_db`
- schema: `public`
- environment classification: local Docker-backed development database

Selection sources:

- `.env`: present and contains the active Prisma datasource selection
- `.env.local`: not present
- `.env.test`: not present
- current shell `DATABASE_URL`: not set
- PM2 configuration: not present in this repository; `pm2` CLI is not installed in this shell
- Docker: active local Postgres container is present and maps to the repository datasource
- package scripts: use `dotenv/config`, therefore `.env` is the active default source unless the shell overrides it

Database identities used by prior commands:

- Command 3 master-seed verification: `bpa_seed_verify_20260722`
- Command 4 configured database inspection: `bpa_db`
- disposable verification database: `bpa_seed_verify_20260722`
- current reconciliation target: `bpa_db`

## Reason Command 3 and Command 4 counts differed

The counts differed because they were not checking the same database.

Command 3 verified the repaired seed system on the disposable database:

- `bpa_seed_verify_20260722`

Command 4 inspected the configured live development database:

- `bpa_db`

Additional target-database issue:

- `bpa_db` had no `_prisma_migrations` history table
- the database already contained much of the application schema and clinic data, but Prisma did not know that history
- app-control tables were still missing
- `content_posts.duration_seconds` was still missing
- because of that drift, `bpa_db` never received the verified master-seed completion that Command 3 proved on the disposable database

## Backup result

Backup was created before migration-history reconciliation or seed execution.

- status: success
- backup path: `D:\bpa_backups\bpa_db_20260722_212509.dump`

Notes:

- two earlier zero-byte backup attempts were left as failed artifacts outside the repository
- the successful backup is the path above

## Migration status before reconciliation

Before reconciliation:

- Prisma reported 51 unapplied migrations
- `_prisma_migrations` table did not exist
- actual schema inspection showed the database was partially migrated outside Prisma history

Relevant seed-path schema state before reconciliation:

- `content_categories`: table existed
- `content_posts`: table existed
- `content_posts.duration_seconds`: missing
- required `app_*` tables for master seed: missing
- `clinic_organizations`: table existed with 87 rows
- `clinic_branches`: table existed with 94 rows

## Reconciliation method

Because the target database already contained historical schema objects, a straight replay of all migrations would have collided with existing tables.

Safe reconciliation used:

1. back up `bpa_db`
2. mark the first 49 historical migrations as applied in Prisma history
3. deploy only the two missing additive migrations:
   - `20260722230000_add_app_control_tables`
   - `20260722233000_add_content_post_duration_seconds`
4. run the complete idempotent master seed twice

Exact safe commands used:

- `npx prisma migrate resolve --applied <migration_name>` for the 49 historical migrations already reflected in `bpa_db`
- `npx prisma migrate deploy`
- `npm run db:seed`
- `npm run db:seed`

## Migration status after reconciliation

After reconciliation:

- Prisma migration status: up to date
- `_prisma_migrations` exists and includes the historical baseline plus the two deployed additive migrations
- `content_posts.duration_seconds` exists
- required `app_*` tables for the master seed exist

## First-run and second-run seed counts

Counts immediately before the first seed run:

| Dataset | Before seed |
|---|---:|
| Video categories | 0 |
| Clinic organizations | 87 |
| Clinic branches | 94 |
| Clinic phones | 115 |
| Clinic facilities | 6 |
| Clinic services | 3 |
| Video posts | 0 |
| Published video posts | 0 |

Counts after the first full seed run:

| Dataset | After first seed |
|---|---:|
| Video categories | 20 |
| Clinic organizations | 87 |
| Clinic branches | 94 |
| Clinic phones | 115 |
| Clinic facilities | 6 |
| Clinic services | 3 |
| Video posts | 0 |
| Published video posts | 0 |

Counts after the second full seed run:

| Dataset | After second seed |
|---|---:|
| Video categories | 20 |
| Clinic organizations | 87 |
| Clinic branches | 94 |
| Clinic phones | 115 |
| Clinic facilities | 6 |
| Clinic services | 3 |
| Video posts | 0 |
| Published video posts | 0 |

Idempotency result:

- second run completed successfully
- no duplicate category slugs were created
- no duplicate clinic organization slugs were created
- no duplicate clinic branch slugs were created
- no unexpected net count changes occurred between first and second runs

Duplicate checks after second run:

- duplicate category slugs: `0`
- duplicate clinic organization slugs: `0`
- duplicate clinic branch slugs: `0`

## Final clinic/category/video counts

Final target-database counts:

- video categories: `20`
- clinic organizations: `87`
- clinic branches: `94`
- clinic phones: `115`
- clinic facilities: `6`
- clinic services: `3`
- video posts: `0`
- published video posts: `0`

Expected reference-data comparison:

- expected video categories: `20` -> matched
- expected clinic organizations: `87` -> matched
- expected clinic branches: `94` -> matched

## Admin and public API verification

Verified on the reconciled target database `bpa_db`:

- admin category query result: `20`
- public video-category query result: `0`

Interpretation:

- admin surfaces can now use all 20 seeded categories
- public `/video-categories` correctly remains empty because there are still no published `VIDEO` posts

## Category creation and video-post creation verification

Rollback-only probes were executed inside a transaction and intentionally rolled back.

Results:

- category creation path succeeded
- video-post creation path succeeded
- no probe rows persisted

This confirms the missing `duration_seconds` column is no longer blocking video-post creation.

## Tests, validation, and build results

Completed successfully:

- `npx prisma validate`
- `npm run seed:verify`
- `npm run verify:video-categories`
- `npm run typecheck`
- `npm run build`

Additional notes:

- `npm run db:generate` was attempted after reconciliation
- it failed in this Windows shell because `node_modules/.prisma/client/query_engine-windows.dll.node` was locked by existing Node processes outside this task
- this did not block migration deployment, seeding, rollback-only probes, validation, typecheck, or build

## Production-data impact

- production data changed: no
- sample video content inserted: no
- real content posts modified: no

This reconciliation affected only the local Docker-backed development target database `bpa_db`.
