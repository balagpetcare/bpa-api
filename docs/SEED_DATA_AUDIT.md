# BPA API Seed Data Audit

Audit scope: read-only inspection of the current seed system, seed-related scripts, schema, and live database state.

## Database target

- Configured database: PostgreSQL `bpa_db`
- Schema: `public`
- Live server reported by the database: `172.18.0.4`, port `5432`
- No secrets, credentials, or connection strings are printed here.

## Exact seed entry point

- `npm run db:seed` → `ts-node -r dotenv/config prisma/seed/index.ts`
- `prisma.seed` in `package.json` points to the same file.

Legacy / standalone seed entry points also exist:

- `npm run seed:legacy` → `prisma/seed.ts`
- `npm run seed:hero` → `prisma/seed-hero.ts`
- `npm run seed:donations` → `prisma/seed-donations.ts`
- `npm run seed:root-admin` → `prisma/seed-root-admin.ts`
- `npm run seed:coverage-backfill` → `prisma/seed-coverage-areas-backfill.ts`
- `npm run seed:locations` → `scripts/location-data/seed-locations.ts`
- `npm run seed:video-categories` → `prisma/seed-video-categories.ts`

## Executive findings

1. The master seed runner exists and is wired correctly, but the live database is missing the entire `app_*` table family that `seedAppControl()` expects.
2. That schema drift causes `db:seed` to fail before the final video-category step, so the master runner does not currently complete on this database.
3. `content_categories` exists but currently has `0` rows, so video categories are absent, not merely hidden.
4. The public video-category endpoint also filters out categories with zero published videos, so even a seeded-but-empty catalog would still render empty.
5. Clinic organizations and branches are populated, but only through the clinic import path; there is no reusable Prisma seed file for that data yet.
6. Several lookup tables remain empty because they have no current seed coverage: `contact_departments`, `contact_priority_rules`, `membership_benefits`, `membership_plan_benefits`, `membership_faqs`, and `campaign_coverages` (the last one has a separate backfill script, but it is not wired into the master runner).

## Seed system inventory

### Core auth, roles, and location

| Table | Rows | Seed source | Wired to master | Mechanism | Idempotent | Notes |
|---|---:|---|---|---|---|---|
| `roles` | 9 | `prisma/seed/roles-permissions.seed.ts` | Yes | `upsert` | Yes | Includes `super_admin`, `admin`, `editor`, `viewer`, campaign/community roles. |
| `permissions` | 828 | `prisma/seed/roles-permissions.seed.ts` | Yes | `upsert` | Yes | Generated from resource/action matrix. |
| `role_permissions` | 2,117 | `prisma/seed/roles-permissions.seed.ts` | Yes | `upsert` + delete sync | Yes | Syncs mappings to target permissions. |
| `users` | 3 | `prisma/seed/users.seed.ts` | Yes | `upsert` | Yes | Admin user is env-driven; current DB has three users. |
| `user_roles` | 1 | `prisma/seed/users.seed.ts` | Yes | `upsert` | Yes | Only the primary admin link is present. |
| `site_settings` | 1 | `prisma/seed/site-settings.seed.ts` | Yes | `upsert` | Yes | Singleton row `default`. |
| `countries` | 1 | `prisma/seed/locations.seed.ts` | Yes | `upsert` | Yes | Bangladesh. |
| `divisions` | 8 | `prisma/seed/locations.seed.ts` | Yes | mixed create/upsert | Mostly | Manual helper functions use `findFirst` + `create`. |
| `districts` | 11 | `prisma/seed/locations.seed.ts` | Yes | mixed create/upsert | Mostly | Same pattern as divisions. |
| `city_corporations` | 2 | `prisma/seed/locations.seed.ts` | Yes | mixed create/upsert | Mostly | DNCC, DSCC. |
| `zones` | 20 | `prisma/seed/locations.seed.ts` | Yes | mixed create/upsert | Mostly | 10 DNCC + 10 DSCC zones. |
| `location_nodes` | 5,254 | `prisma/seed/location-nodes.seed.ts` | Yes | source-keyed upsert | Yes | Unified tree backfill/import is source-keyed. |
| `vaccine_catalog` | 5 | `prisma/seed/campaigns.seed.ts` and `prisma/seed/index.ts` | Yes | `create` guarded by `findFirst` | Yes | Also seeded in campaign helper. |
| `certificate_templates` | 1 | `prisma/seed/campaigns.seed.ts` | Yes | `create` guarded by `findFirst` | Yes | Default vaccination certificate template. |

### CMS and video/content catalog

| Table | Rows | Seed source | Wired to master | Mechanism | Idempotent | Notes |
|---|---:|---|---|---|---|---|
| `news_categories` | 7 | `prisma/seed/cms.seed.ts` | Yes | `upsert` | Yes | Public CMS taxonomy. |
| `news_tags` | 10 | `prisma/seed/cms.seed.ts` | Yes | `upsert` | Yes | Includes campaign/community tags. |
| `content_categories` | 0 | `prisma/seed/video-categories.seed.ts` | Yes | `upsert` | Yes | Video categories are absent right now. |
| `homepages` | 1 | `prisma/seed/cms.seed.ts` | Yes | `upsert` | Yes | Locale `en`, published. |
| `homepage_sections` | 10 | `prisma/seed/cms.seed.ts` | Yes | `create` guarded by `findFirst` | Yes | One row per homepage section type. |
| `hero_slides` | 3 | `prisma/seed/cms.seed.ts` | Yes | `create` guarded by `findFirst` | Yes | All published and active. |
| `footer_configs` | 1 | `prisma/seed/cms.seed.ts` | Yes | `create` guarded by `findFirst` | Yes | Locale `en`. |
| `footer_link_groups` | 3 | `prisma/seed/cms.seed.ts` | Yes | `create` | Yes | Created only when footer is first created. |
| `footer_links` | 11 | `prisma/seed/cms.seed.ts` | Yes | `create` | Yes | Nested under link groups. |

### Contact / inquiry lookup data

| Table | Rows | Seed source | Wired to master | Mechanism | Idempotent | Notes |
|---|---:|---|---|---|---|---|
| `contact_types` | 6 | `prisma/seed/contact-inquiry.seed.ts` | Yes | `create` after `findUnique` | Yes | Active lookup records. |
| `inquiry_categories` | 9 | `prisma/seed/contact-inquiry.seed.ts` | Yes | `create` after `findUnique` | Yes | Active lookup records. |
| `contact_departments` | 0 | none found | No | — | — | Missing seed coverage. |
| `contact_priority_rules` | 0 | none found | No | — | — | Missing seed coverage. |

### Community care and membership

| Table | Rows | Seed source | Wired to master | Mechanism | Idempotent | Notes |
|---|---:|---|---|---|---|---|
| `community_zones` | 8 | `prisma/seed/community.seed.ts` | Yes | `upsert` | Yes | All active/published. |
| `contribution_plans` | 1 | `prisma/seed/community.seed.ts` | Yes | `upsert` | Yes | Standard care partner plan. |
| `community_membership_programs` | 1 | `prisma/seed/community.seed.ts` | Yes | `upsert` | Yes | Singleton program row. |
| `community_membership_tiers` | 3 | `prisma/seed/community.seed.ts` | Yes | `upsert` | Yes | Primary, Premium, Enterprise. |
| `community_membership_services` | 10 | `prisma/seed/community.seed.ts` | Yes | `create` guarded by `findFirst` | Yes | Seeded service catalog. |
| `community_tier_service_discounts` | 30 | `prisma/seed/community.seed.ts` | Yes | `upsert` | Yes | Tier/service discount mappings. |
| `community_membership_benefits` | 13 | `prisma/seed/community.seed.ts` | Yes | `create` guarded by `findFirst` | Yes | Benefits for the community care engine. |
| `community_tier_benefit_mappings` | 27 | `prisma/seed/community.seed.ts` | Yes | `upsert` | Yes | Benefit-to-tier mappings. |
| `community_membership_documents` | 5 | `prisma/seed/community.seed.ts` | Yes | `create` guarded by `findFirst` | Yes | Document library for the community membership engine. |
| `membership_campaigns` | 1 | `prisma/seed/community.seed.ts` | Yes | `upsert` | Yes | Published campaign `bpa-membership-2026`. |
| `membership_plans` | 3 | `prisma/seed/community.seed.ts` | Yes | `upsert` | Yes | Primary, Premium, Enterprise campaign plans. |
| `membership_benefits` | 0 | none found | No | — | — | Missing seed coverage. |
| `membership_plan_benefits` | 0 | none found | No | — | — | Missing seed coverage. |
| `membership_media` | 5 | `prisma/seed/community.seed.ts` | Yes | `create` guarded by `findFirst` | Yes | Reuses media rows. |
| `membership_documents_v2` | 2 | `prisma/seed/community.seed.ts` | Yes | `create` guarded by `findFirst` | Yes | Campaign document rows. |
| `membership_faqs` | 0 | none found | No | — | — | Missing seed coverage. |

### Donations and communications

| Table | Rows | Seed source | Wired to master | Mechanism | Idempotent | Notes |
|---|---:|---|---|---|---|---|
| `donation_purposes` | 7 | `prisma/seed/donations.seed.ts` | Yes | `upsert` | Yes | Active donation purpose catalog. |
| `donation_campaigns` | 4 | `prisma/seed/donations.seed.ts` | Yes | `upsert` | Yes | All active and shown on donate page. |
| `donation_page_settings` | 1 | `prisma/seed/donations.seed.ts` | Yes | `create` / `update` | Yes | Singleton donation landing settings. |
| `donation_impact_stories` | 3 | `prisma/seed/donations.seed.ts` | Yes | `create` guarded by `findUnique` | Yes | Published stories. |
| `donation_transparency_reports` | 1 | `prisma/seed/donations.seed.ts` | Yes | `create` guarded by `findFirst` | Yes | Published report row. |
| `donation_qr_codes` | 4 | `prisma/seed/donations.seed.ts` | Yes | `create` guarded by `findUnique` | Yes | QR targets for donation entry points. |
| `email_layout_settings` | 2 | `prisma/seed/mail.seed.ts` | Yes | `create` after `findFirst` | Yes | EN and BN layouts. |
| `mail_accounts` | 6 | `prisma/seed/mail.seed.ts` | Yes | `upsert` | Yes | All six are intentionally inactive. |
| `pet_smart_sync_settings` | 5 | `prisma/seed/payments.seed.ts` | Yes | `upsert` | Yes | Placeholder integration settings. |

### Campaigns and campaign FAQs

| Table | Rows | Seed source | Wired to master | Mechanism | Idempotent | Notes |
|---|---:|---|---|---|---|---|
| `campaigns` | 1 | `prisma/seed/campaigns.seed.ts` | Yes | `create` guarded by `findUnique` | Yes | Cat vaccination campaign. |
| `campaign_services` | 3 | `prisma/seed/campaigns.seed.ts` | Yes | `create` guarded by `findFirst` | Yes | Linked to vaccine catalog. |
| `campaign_sessions` | 1 | `prisma/seed/campaigns.seed.ts` | Yes | `create` guarded by `findFirst` | Yes | Single pilot session. |
| `campaign_faqs` | 10 | `prisma/seed/campaign-faqs.seed.ts` | Yes | `createMany` | Yes after first run | Existing seed checks count first and skips on rerun. |
| `campaign_coverages` | 0 | `prisma/seed-coverage-areas-backfill.ts` | No | `create` | Yes | Separate backfill exists, but is not wired into master seed. |

### Clinic directory and reference tables

| Table | Rows | Seed source | Wired to master | Mechanism | Idempotent | Notes |
|---|---:|---|---|---|---|---|
| `clinic_organizations` | 87 | clinic import path (`src/modules/clinics/clinic-import.service.ts`) | No | `create` | Yes, by `importKey` | Imported clinic directory data, not a Prisma seed file. |
| `clinic_branches` | 94 | clinic import path | No | `create` | Yes, by `importKey` | Public query filters on `published` + `archivedAt`. |
| `clinic_branch_phones` | 115 | clinic import path | No | `createMany` | Yes | Nested branch child rows. |
| `clinic_branch_social_links` | 0 | none seeded | No | — | — | Empty. |
| `clinic_branch_opening_hours` | 0 | none seeded | No | — | — | Empty. |
| `clinic_branch_closures` | 0 | none seeded | No | — | — | Empty. |
| `clinic_branch_services` | 3 | clinic import path / manual admin writes | No | `createMany` | Yes | Very small set in current DB. |
| `clinic_branch_animal_types` | 16 | clinic import path / manual admin writes | No | `createMany` | Yes | Imported child rows. |
| `clinic_branch_facilities` | 6 | clinic import path / manual admin writes | No | `createMany` | Yes | Facilities enumerated by `ClinicFacilityType`. |
| `clinic_branch_images` | 0 | none seeded | No | — | — | Empty. |
| `clinic_branch_sources` | 159 | clinic import path | No | `createMany` | Yes | Source provenance URLs. |

### App control / mobile bootstrap tables

These tables exist in `prisma/schema.prisma` but are absent from the live database, so the current DB cannot satisfy `seedAppControl()`:

| Table | DB state | Seed source | Wired to master | Mechanism | Notes |
|---|---|---|---|---|---|
| `app_home_sections` | missing | `prisma/seed/app-control.seed.ts` | Yes | `upsert` | P2021 on count/create. |
| `app_navigation_items` | missing | `prisma/seed/app-control.seed.ts` | Yes | `upsert` | Missing table. |
| `app_page_contents` | missing | `prisma/seed/app-control.seed.ts` | Yes | `upsert` | Missing table. |
| `app_banners` | missing | `prisma/seed/app-control.seed.ts` | Yes | `upsert` | Missing table. |
| `app_quick_actions` | missing | none found | No | — | No seed coverage yet. |
| `app_featured_services` | missing | none found | No | — | No seed coverage yet. |
| `app_offers` | missing | none found | No | — | No seed coverage yet. |
| `app_theme_settings` | missing | `prisma/seed/app-control.seed.ts` | Yes | `upsert` | Missing table. |
| `app_version_settings` | missing | `prisma/seed/app-control.seed.ts` | Yes | `upsert` | Missing table. |
| `app_popup_notices` | missing | `prisma/seed/app-control.seed.ts` | Yes | `upsert` | Missing table. |
| `app_tutorial_guides` | missing | none found | No | — | No seed coverage yet. |

## Video-category flow trace

### Model → seed file → master runner → API

1. Database model: `ContentCategory` in `prisma/schema.prisma` mapped to `content_categories`.
2. Seed file: `prisma/seed/video-categories.seed.ts`
   - uses `contentCategory.upsert`
   - seeds the `VIDEO_CATEGORIES` list
   - verifies the expected slugs after writing
3. Master seed runner: `prisma/seed/index.ts`
   - imports `seedVideoCategories`
   - calls it in the final `Video Content Categories` section
4. API mount:
   - `src/app.ts` mounts `contentPublicRouter` at `/api/v1/public`
   - `src/modules/content/content.router.ts` exposes `GET /video-categories`
5. API handler / service:
   - `src/modules/content/content.controller.ts` → `getPublicVideoCategoriesHandler`
   - `src/modules/content/content.service.ts` → `listPublicVideoCategories()`
6. Public filter behavior:
   - loads all categories with `repo.listCategories()`
   - counts only `VIDEO` posts with `status = published` and `publishedAt <= now`
   - filters out categories whose published video count is `0`

### Why the video categories are not visible

Current state:

- `content_categories` row count: `0`
- `content_posts` with `type = VIDEO`: `0`
- public video-category endpoint therefore returns `0`

Root cause priority:

1. The master seed runner currently cannot complete on this DB because `seedAppControl()` hits missing tables.
2. The runner stops before reaching `seedVideoCategories()`.
3. There is no evidence of a slug conflict, locale filter, archived/deleted filter, or relation mismatch for `content_categories`; the table is simply empty.

Conclusion: video categories are absent in the current database, not merely invisible.

## Seeders that exist but are not wired into the master runner

- `prisma/seed.ts` — legacy seed script, not used by `db:seed`
- `prisma/seed-hero.ts` — standalone homepage hero seed
- `prisma/seed-donations.ts` — standalone donation seed
- `prisma/seed-root-admin.ts` — standalone root-admin bootstrap
- `prisma/seed-coverage-areas-backfill.ts` — separate backfill, not wired
- `scripts/location-data/seed-locations.ts` — standalone CLI import/seed helper, not wired into master runner
- `src/scripts/importClinicDirectory.ts` — repeatable clinic directory CLI import path, not a Prisma seed

## Missing seeders or missing reproducible coverage

Tables with data needs but no current seed coverage in this repository:

- `contact_departments`
- `contact_priority_rules`
- `membership_benefits`
- `membership_plan_benefits`
- `membership_faqs`
- `app_quick_actions`
- `app_featured_services`
- `app_offers`
- `app_tutorial_guides`

Tables that are present but have no seed coverage and are currently empty:

- `content_categories`
- `campaign_coverages`
- `clinic_branch_social_links`
- `clinic_branch_opening_hours`
- `clinic_branch_closures`
- `clinic_branch_images`

## Recommended implementation order

1. Make the clinic directory import reusable as a seed and wire it into the master runner.
2. Restore the app-control schema/runtime mismatch so the master seed can complete end-to-end.
3. Re-run or repair the video-category seed path and confirm public visibility.
4. Backfill the remaining empty reference tables that have no reproducible seed coverage.

## Exact files to change in Command 2

Recommended target files for the clinic reusable-seed refactor:

- `src/modules/clinics/clinic-import.service.ts`
- `src/scripts/importClinicDirectory.ts`
- `prisma/seed/index.ts`
- `package.json`
- add `prisma/seed/clinic-directory.seed.ts` or equivalent reusable seed module

## Exact files to change in Command 3

Recommended target files for the video-category / app-control repair:

- `prisma/seed/index.ts`
- `prisma/seed/app-control.seed.ts`
- `prisma/seed/video-categories.seed.ts`
- `src/modules/content/content.service.ts`
- `src/modules/content/content.router.ts`
- `src/modules/content/content.controller.ts`
- a new migration under `prisma/migrations/<timestamp>_app_control_tables/migration.sql` for the missing `app_*` tables

## Files inspected

- `package.json`
- `prisma/schema.prisma`
- `prisma/seed/index.ts`
- `prisma/seed.ts`
- `prisma/seed-video-categories.ts`
- `prisma/seed/video-categories.seed.ts`
- `prisma/seed/roles-permissions.seed.ts`
- `prisma/seed/locations.seed.ts`
- `prisma/seed/location-nodes.seed.ts`
- `prisma/seed/cms.seed.ts`
- `prisma/seed/community.seed.ts`
- `prisma/seed/campaigns.seed.ts`
- `prisma/seed/site-settings.seed.ts`
- `prisma/seed/contact-inquiry.seed.ts`
- `prisma/seed/app-control.seed.ts`
- `prisma/seed/mail.seed.ts`
- `prisma/seed/payments.seed.ts`
- `prisma/seed/campaign-faqs.seed.ts`
- `prisma/seed/users.seed.ts`
- `prisma/seed/donations.seed.ts`
- `prisma/seed-root-admin.ts`
- `prisma/seed-hero.ts`
- `prisma/seed-coverage-areas-backfill.ts`
- `src/app.ts`
- `src/modules/content/content.router.ts`
- `src/modules/content/content.controller.ts`
- `src/modules/content/content.service.ts`
- `src/modules/content/content.repository.ts`
- `src/modules/app/app.router.ts`
- `src/modules/app-control/app-control.router.ts`
- `src/scripts/importClinicDirectory.ts`
- `src/modules/clinics/clinic-import.service.ts`
- `src/modules/clinics/clinics-public.repository.ts`
- `src/modules/clinics/clinics.repository.ts`
- `prisma/migrations/20260613020000_homepage_cms/migration.sql`
- `prisma/migrations/20260722160714_clinic_org_archive_restore_and_org_profile_fields/migration.sql`

