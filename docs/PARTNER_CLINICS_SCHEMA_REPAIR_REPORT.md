# Partner Clinics Schema Repair Report

## Root cause

The `PartnerClinic` model has existed in `prisma/schema.prisma` (mapped to
`public.partner_clinics`) since the project's initial commit, but **no migration in
`prisma/migrations/` ever created the table**. All 52 pre-existing migrations were
already correctly recorded as applied by Prisma (`npx prisma migrate status` showed the
database schema in sync before this fix) — this was not a case of a migration being
incorrectly baselined/marked-applied without its objects existing. It was model/schema
drift: the model was added to `schema.prisma` without ever generating and committing the
corresponding `prisma migrate dev` migration folder.

The dependent enum `AppContentStatus` (`draft` / `published` / `archived`) already
existed in the database, created by migration `20260722230000_add_app_control_tables`,
and is reused as-is — no duplicate enum was created. All parent tables the model's
foreign keys point to (`divisions`, `districts`, `users`) already existed and were
unaffected.

## Historical migration involved

None. Investigated all 52 migrations in `prisma/migrations/` — zero references to
`partner_clinics`. This confirms the table was simply never generated, not dropped or
rolled back.

## Backup

Taken before any schema change, via `pg_dump -F c` (custom format) inside the
`wpa-postgres` Docker container, then copied out:

```
D:\bpa_main\bpa_api\backups\bpa_db_backup_20260723_123756.dump   (~1.0 MB)
```

## Migration added

`prisma/migrations/20260723130000_create_missing_partner_clinics/migration.sql`

- Additive only — every `CREATE TABLE`, `CREATE INDEX`, `CREATE TYPE`, and
  `ALTER TABLE ... ADD CONSTRAINT` statement is guarded with `IF NOT EXISTS` / a
  `pg_constraint` existence check, so it is idempotent and safe to run against a
  partially-repaired database.
- No pre-existing migration file was edited.
- Creates exactly the columns, defaults, nullability, indexes, and foreign keys implied
  by the current `PartnerClinic` Prisma model (verified field-by-field, see below).

## Table / enum / index / FK verification (post-migration, `\d public.partner_clinics`)

- Columns: `id (uuid, pk, default gen_random_uuid())`, `name (varchar(255) not null)`,
  `logo_url (text)`, `short_description (text)`, `phone (varchar(20))`,
  `show_phone_publicly (boolean not null default false)`, `address (text)`,
  `division_id (uuid)`, `district_id (uuid)`, `area (varchar(160))`,
  `latitude (numeric(9,6))`, `longitude (numeric(9,6))`, `rating (numeric(2,1))`,
  `review_count (integer)`, `is_verified (boolean not null default false)`,
  `sort_order (integer not null default 0)`, `is_active (boolean not null default true)`,
  `status ("AppContentStatus" not null default 'draft')`, `created_by_id (uuid)`,
  `updated_by_id (uuid)`, `created_at (timestamptz not null default now)`,
  `updated_at (timestamptz not null default now)`.
- Indexes: `partner_clinics_pkey` (PK on `id`), `partner_clinics_sort_order_is_active_idx`
  (`sort_order, is_active`), `partner_clinics_status_idx` (`status`),
  `partner_clinics_division_id_district_id_idx` (`division_id, district_id`) — matching
  the model's `@@index` directives.
- Foreign keys: `division_id → divisions(id)`, `district_id → districts(id)`,
  `created_by_id → users(id)`, `updated_by_id → users(id)`, all `ON DELETE SET NULL`,
  matching the Prisma relations.
- Enum: reused existing `AppContentStatus` (no duplicate type created).

All confirmed matching exactly via `psql \d public.partner_clinics` after migration.

## Final row count

**0** rows. Per the task's explicit instruction, the 87 existing clinic-directory
organizations (`ClinicOrganization`/`ClinicBranch` — a separate, complete clinic dataset)
were **not** copied into `partner_clinics`. `partner_clinics` is a curated
homepage/app-control list, populated only by administrators selecting specific real
clinics through the BPA Admin app-control interface.

A new idempotent seed step, `prisma/seed/partner-clinics.seed.ts`
(`seedPartnerClinics`), was added and wired into `prisma/seed/index.ts` as step 20. It
intentionally inserts nothing — it only reports the current curated count — so running
`npm run db:seed` repeatedly never creates sample/fake partner-clinic records.

## Endpoint response

`GET /api/v1/app/home/partner-clinics?limit=10` → `200 OK`, `{"success":true,"data":[]}`
(empty table, valid empty list — not a 500).

`GET /api/v1/app/home` (homepage feed) → `200 OK`, unaffected by this change.

## Tests / build results

- `npx prisma validate` — schema valid.
- `npx prisma migrate status` — database schema up to date, all 53 migrations applied.
- Targeted Jest suites:
  - `src/modules/app/__tests__/app-home-content.service.test.ts` — includes existing
    coverage (active/published returned, inactive/draft excluded, division/district
    filters, `sortOrder` then `name` ordering) plus two new cases added for this repair:
    empty table → `[]`, and a simulated DB error (e.g. P2021-style) propagates as a
    rejection rather than being swallowed as an empty result.
  - `src/middlewares/__tests__/errorHandler.test.ts` (new) — verifies P2021/P2022
    (missing table/column) errors are always logged, even in `production`, and are
    answered with a `500`, never misreported as a `200`/empty-list "no data" response.
  - Result: **20 passed, 20 total**.
- `npm run typecheck` — clean, no errors.
- `npm run build` — succeeded.
- `npx prisma generate` — succeeded after stopping only the 3 Node processes belonging
  to `bpa_api`'s `npm run dev` (ts-node-dev) that held the Windows query-engine DLL lock;
  no other project's Node processes (gateway, auth, admin, web) were touched.

## Error-handling hardening

`src/middlewares/errorHandler.ts` was updated so that Prisma `P2021` (table does not
exist) and `P2022` (column does not exist) errors are **always** logged via
`console.error` — including in `production`, where generic errors were previously only
logged when `NODE_ENV !== 'production'`. This ensures a future schema-drift regression
is never silently misreported as "no data" — it still returns the existing generic
`500` response shape to clients, but is now guaranteed to be visible in server logs.

## Data inserted

None. No sample or production partner-clinic records were inserted into `bpa_db`.

## Production impact

Only the local Docker-backed `bpa_db` (development database) was touched. No
production database was accessed or modified.
