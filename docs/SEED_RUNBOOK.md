# BPA Seed Runbook

Last verified: July 22, 2026

Confirmed repository path:

- `D:\bpa_main\bpa_api`

Exact Prisma seed entry point:

- `npm run db:seed`
- resolves to `ts-node -r dotenv/config prisma/seed/index.ts`

Available seed commands:

- Complete master seed: `npm run db:seed`
- Clinic-only seed: `npm run clinic:seed`
- Video-category-only seed: `npm run seed:video-categories`
- Video-content-only seed: `npm run seed:video-content`
- Video-category API verification: `npm run verify:video-categories`
- Clinic snapshot export/regeneration: `npm run clinic:seed:export`
- Clinic snapshot validation: `npm run clinic:seed:validate`
- Seed verification tests: `npm run seed:verify`

Recommended new-environment bootstrap:

1. Set the target `DATABASE_URL` to the intended environment.
2. Run migrations:
   - `npm run db:migrate:prod`
3. Generate Prisma client if needed:
   - `npm run db:generate`
4. Run the complete seed:
   - `npm run db:seed`
5. Verify the seed contract:
   - `npm run seed:verify`

Safe production deployment procedure:

1. Back up the target database.
2. Confirm the target database name and environment variables before running any command.
3. Run only additive production-safe migration deployment:
   - `npm run db:migrate:prod`
4. Run the complete idempotent seed:
   - `npm run db:seed`
5. Verify critical seeded tables:
   - content categories
   - clinic organizations and branches
   - membership reference data
   - contact inquiry lookup data
   - app control tables
6. Verify API behavior:
   - admin category listing should return the seeded category rows
   - public video-category listing returns categories only when published VIDEO posts exist

Rollback procedure:

1. Stop application writes if a rollback is required.
2. Restore the database from the pre-seed backup or point-in-time recovery snapshot.
3. Re-run `npm run db:migrate:prod` only after the schema is restored to the expected revision.
4. Re-run `npm run db:seed` only after the rollback target has been confirmed.

Operational warnings:

- Do not run `prisma migrate reset` on production.
- Do not run `prisma db push` on production as a substitute for reviewed migrations.
- Do not truncate or manually delete seeded reference tables to “reseed” production.
- The public `/video-categories` API is intentionally empty until published VIDEO posts exist. Empty public results do not by themselves indicate a failed category seed.
- Sample video content is disabled by default and should be used only in development/test unless explicitly enabled.

Seed dependency order:

1. roles and permissions
2. site bootstrap
3. location hierarchy and location nodes
4. campaigns and campaign coverage
5. community and membership engine
6. membership reference data
7. donations, CMS, payments, mail, contact inquiry lookups
8. clinic directory
9. campaign FAQs
10. video categories
11. app control core
12. app control reference data

Seed regeneration notes:

- Clinic directory reference data is regenerated from the source clinic database through `npm run clinic:seed:export`.
- Regeneration must preserve stable natural keys:
  - clinic organization slug
  - clinic branch slug
  - branch child-row composite natural keys
- Regeneration must not export secrets, auth data, temporary URLs, or unstable timestamps.
