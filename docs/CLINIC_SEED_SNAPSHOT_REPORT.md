# Clinic Seed Snapshot Report

Repository path confirmed:

- `D:\bpa_main\bpa_api`

Source database:

- PostgreSQL database: `bpa_db`
- Schema: `public`
- Live server: `172.18.0.4:5432`

Export date:

- July 22, 2026

## Summary

The clinic directory stored in `bpa_db` was exported into a deterministic seed snapshot and a clinic-only seed runner. The snapshot is idempotent, preserves existing logical records, and does not rely on the broken master seed runner.

The export was validated against the live database, and the clinic seed was executed twice inside a rollback-only transaction. The second run created no additional rows.

## Exported counts

| Dataset | Count |
|---|---:|
| Clinic organizations | 87 |
| Clinic branches | 94 |
| Branch phones | 115 |
| Opening hours | 0 |
| Branch services | 3 |
| Branch animal types | 16 |
| Branch facilities | 6 |
| Branch sources | 159 |
| Organization social links | 0 |
| Branch social links | 0 |
| Branch images | 0 |

## Data-quality findings

No duplicate organization names were found.

No duplicate organization slugs were found.

No duplicate branch slugs were found.

Normalized phone numbers are shared across multiple branches, which is expected for several clinic directories and not treated as an error:

- `01701022274` appears 6 times
- `01306929232` appears 2 times
- `01635817270` appears 2 times
- `01710517715` appears 2 times
- `01715078434` appears 2 times
- `01723649754` appears 2 times
- `01731492093` appears 2 times
- `01770476749` appears 2 times
- `01818417804` appears 2 times

Other notable gaps in the live source data:

- 93 of 94 branches have no postal code
- all 94 branches have no district value
- 93 branches have a Google Maps URL; 1 does not
- 91 branches are `verificationStatus = UNKNOWN`
- 93 branches are `open24Hours = UNKNOWN`
- 93 branches are `appointmentRequired = UNKNOWN`
- 93 branches are `emergencyAvailability = UNKNOWN`
- 87 organizations have no description, website, email, or media references in the live data

No orphan relations were detected in the clinic tables that were checked.

## Identity strategy

The seed uses stable natural keys:

- organization identity: `slug`
- branch identity: `slug`
- branch phone identity: `branch slug + normalized phone number`
- branch opening hours identity: `branch slug + dayOfWeek`
- branch services identity: `branch slug + serviceName`
- branch animal types identity: `branch slug + animalType`
- branch facilities identity: `branch slug + facilityType`
- branch sources identity: `branch slug + sourceUrl`
- social links identity: `platform + url` scoped to organization or branch

This avoids reliance on database-generated IDs and keeps repeated runs deterministic.

## Upsert and reconciliation strategy

The clinic seed runner:

- upserts organizations by slug
- upserts branches by slug
- upserts child rows with composite natural keys where Prisma exposes them
- uses `findFirst` + `create`/`update` reconciliation for relation tables that do not have a unique composite key
- does not delete records
- does not use `deleteMany`, `truncate`, `reset`, `db push`, or schema recreation

Unexported bookkeeping fields are left alone:

- `id`
- `createdAt`
- `updatedAt`
- `createdById`
- `updatedById`
- `archivedById`
- request/audit rows
- user/session/auth data
- secrets and tokens

## Missing or invisible clinic data

Nothing in the clinic directory is currently hidden by publish/archive filters. The source rows themselves are present and visible in the database.

No current record set contains opening hours, social links, or media relations, so those tables export as empty arrays and the seed runner leaves them empty.

## Video category note

This command did not modify the master seed runner. That remains deferred until the app-control mismatch is repaired in Command 3.

## First-run and second-run results

Rollback-only idempotency test:

| Checkpoint | Organizations | Branches | Phones | Hours | Services | Animal types | Facilities | Sources | Images |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Before seed | 87 | 94 | 115 | 0 | 3 | 16 | 6 | 159 | 0 |
| After first seed | 87 | 94 | 115 | 0 | 3 | 16 | 6 | 159 | 0 |
| After second seed | 87 | 94 | 115 | 0 | 3 | 16 | 6 | 159 | 0 |

Result:

- second run created no duplicates
- live database state was rolled back after the test

## Generated files

- `scripts/export-clinic-seed.ts`
- `scripts/validate-clinic-seed.ts`
- `prisma/seed/clinic-directory.seed.ts`
- `prisma/seed/data/clinic-directory.seed-data.ts`
- `package.json`

## Package commands

- `npm run clinic:seed:export`
- `npm run clinic:seed:validate`
- `npm run clinic:seed`

## Test, validation, and build results

- `npm run clinic:seed:validate` — passed
- `npm run typecheck` — passed
- `npm test -- --runInBand src/modules/clinics/__tests__/clinic-import-service.test.ts src/modules/clinics/__tests__/clinics-public.service.test.ts` — passed, 24 tests
- `npm run build` — passed

## Records that could not be represented safely

None of the current clinic records required omission for safety.

No stable media references were present in the live clinic data, so no media IDs or media-backed relations were exported.

No timestamps that change on every export were emitted.
