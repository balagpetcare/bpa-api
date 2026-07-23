# Master Seed Verification Report

Verification date: July 22, 2026

Confirmed repository path:

- `D:\bpa_main\bpa_api`

Disposable verification database:

- PostgreSQL database: `bpa_seed_verify_20260722`

Source clinic snapshot database:

- PostgreSQL database: `bpa_db`

## Root cause of the missing video categories

The original live-database failure had two separate effects:

1. `content_categories` in `bpa_db` had `0` rows, so the categories were absent.
2. The old master seed order ran `seedAppControl()` before the video-category step, and the live database was missing the `app_*` table family required by that seed.

That meant `npm run db:seed` failed before it reached `seedVideoCategories()`.

The public video-category endpoint had a second independent behavior:

- `listPublicVideoCategories()` filters out categories with zero published `VIDEO` posts.

So even after category restoration, the public endpoint remains empty until published videos exist.

## Fix implemented

The seed system was repaired without introducing a second category architecture:

- kept the existing `ContentCategory` model and `prisma/seed/video-categories.seed.ts`
- preserved the existing Prisma seed entry point: `ts-node -r dotenv/config prisma/seed/index.ts`
- moved the video-category step ahead of app-control in the master seed order
- added the missing `app_*` tables through migration so the full master seed can complete
- integrated the clinic-directory seed into the master runner after required location/reference seeders
- added missing reproducible reference seeders for:
  - `campaign_coverages`
  - `membership_benefits`
  - `membership_plan_benefits`
  - `membership_faqs`
  - `contact_departments`
  - `contact_priority_rules`
  - `app_quick_actions`
  - `app_featured_services`
  - `app_offers`
  - `app_tutorial_guides`

## Categories restored

Video categories restored by the seeded slug set:

- `pet-care-health`
- `vaccination-prevention`
- `diseases-symptoms-treatment`
- `pet-nutrition-food`
- `training-behavior`
- `grooming-hygiene`
- `emergency-first-aid`
- `puppy-kitten-care`
- `senior-pet-care`
- `spay-neuter-reproductive-health`
- `adoption-rescue`
- `pet-owner-awareness`
- `animal-law-welfare`
- `bpa-campaigns-activities`
- `expert-advice`
- `success-stories`
- `pet-community`
- `pet-industry-economy`
- `events-webinars`
- `entertainment-pet-stories`

Seeder behavior:

- model: `ContentCategory`
- seed mechanism: `upsert`
- unique key: `slug`
- idempotent on repeated runs: yes

## Master seed modules connected

The complete master runner now executes this order:

1. `roles-permissions`
2. `admin-user`
3. `site-settings`
4. `locations`
5. `location-nodes`
6. `campaigns`
7. `campaign-coverages`
8. `community-membership`
9. `membership-reference`
10. `donations`
11. `cms`
12. `payments`
13. `mail`
14. `contact-inquiry`
15. `clinic-directory`
16. `campaign-faqs`
17. `video-categories`
18. `app-control`
19. `app-control-reference`

## First-run and second-run verification

Validation was performed only on the disposable database `bpa_seed_verify_20260722`.

Sequence executed:

1. `npm run db:migrate:prod`
2. `npm run db:seed`
3. `npm run db:seed`
4. duplicate and count checks
5. seed tests
6. Prisma validation
7. build

Post-second-run counts:

| Table / dataset | Count |
|---|---:|
| Content categories | 20 |
| Campaign coverages | 1 |
| Membership benefits | 13 |
| Membership plan benefits | 27 |
| Membership FAQs | 4 |
| Clinic organizations | 87 |
| Clinic branches | 94 |
| Clinic branch phones | 115 |
| Clinic branch services | 3 |
| Clinic branch facilities | 6 |
| Clinic branch animal types | 16 |
| Clinic branch sources | 159 |
| App home sections | 11 |
| App quick actions | 3 |
| App featured services | 2 |
| App offers | 1 |
| App tutorial guides | 2 |

Idempotency result:

- second run completed successfully
- post-seed counts matched the first-run steady state
- duplicate checks remained zero

## Duplicate checks

| Check | Result |
|---|---:|
| Duplicate category slugs | 0 |
| Duplicate clinic organization slugs | 0 |
| Duplicate clinic branch slugs | 0 |

## Clinic restoration counts

The integrated clinic seed restored and preserved:

- 87 organizations
- 94 branches
- 115 phones
- 0 opening-hours rows
- 3 branch services
- 16 branch animal-type rows
- 6 branch facility rows
- 159 branch source rows

The live clinic snapshot contained no stable opening hours, social links, or media rows to restore.

## API verification

Verified through the real repository content service path against the disposable database:

- admin category listing (`listCategories`) returned `20` categories
- public category listing (`listPublicVideoCategories`) returned `0` categories

Interpretation:

- video categories are restored and queryable through the admin path
- public emptiness is expected because there are no published `VIDEO` posts yet
- no seed change to the public filter was required

## Tests, validation, and build

Completed successfully:

- `npx prisma validate`
- `npm run seed:verify`
- `npm test -- --runInBand src/modules/app/__tests__/app-home-content.service.test.ts`
- `npm run typecheck`
- `npm run build`

Added targeted seed tests for:

- video categories created and verified as a complete slug set
- clinic directory seed processing the full exported snapshot deterministically
- master seed order contract:
  - clinic seed runs after location seeds
  - clinic seed runs before video categories
  - video categories run before app-control

## Exact seed-related files changed

- `package.json`
- `prisma/seed/index.ts`
- `prisma/seed/contact-inquiry.seed.ts`
- `prisma/seed/campaign-coverages.seed.ts`
- `prisma/seed/membership-reference.seed.ts`
- `prisma/seed/app-control-reference.seed.ts`
- `prisma/seed/manifest.ts`
- `prisma/seed/clinic-directory.seed.ts`
- `prisma/seed/data/clinic-directory.seed-data.ts`
- `prisma/__tests__/master-seed.contract.test.ts`
- `prisma/__tests__/video-categories.seed.test.ts`
- `prisma/__tests__/clinic-directory.seed.test.ts`
- `scripts/export-clinic-seed.ts`
- `scripts/validate-clinic-seed.ts`
- `prisma/migrations/20260722160714_clinic_org_archive_restore_and_org_profile_fields/migration.sql`
- `prisma/migrations/20260722182103_clinic_media_library_references/migration.sql`
- `prisma/migrations/20260722220000_finalize_clinic_directory_fields/migration.sql`
- `prisma/migrations/20260722230000_add_app_control_tables/migration.sql`
- `docs/SEED_RUNBOOK.md`
- `docs/MASTER_SEED_VERIFICATION_REPORT.md`

## Remaining manual action

No further schema or seed repair is required for the seed system itself.

Operational follow-up remains:

1. run the verified migration-and-seed flow on the intended target environment
2. create published `VIDEO` posts if the public `/video-categories` endpoint must return non-empty results
3. keep clinic snapshot regeneration tied to reviewed source-data updates through `npm run clinic:seed:export`

## Safe operator commands

New environment:

1. `npm run db:migrate:prod`
2. `npm run db:generate`
3. `npm run db:seed`

Clinic-only:

- `npm run clinic:seed`

Video-category-only:

- `npm run seed:video-categories`

Clinic snapshot regeneration:

- `npm run clinic:seed:export`

Production warning:

- never use `prisma migrate reset` on production
