# Video Category Visibility Report

Verification date: July 22, 2026

## Repository identity

Canonical repository path:

- `D:\bpa_main\bpa_api`

Path comparison:

- `D:\bpa_main\bpa-api` does not exist on this machine
- `D:\bpa_main\bpa_api` exists and is the active Git checkout

Repository identity details:

- current working directory: `D:\bpa_main\bpa_api`
- Git root: `D:\bpa_main\bpa_api`
- Git remote: `https://github.com/balagpetcare/bpa-api.git`
- current branch: `main`
- package name: `bpa-backend-api`
- latest commit: `4c09b8f feat: initialize Bangladesh Pet Association API`

Seed changes were made in the correct checkout:

- yes

## Content/category relationship status

The repository content model supports a single category assignment per content post:

- table: `content_posts`
- foreign key: `category_id`
- Prisma relation: `ContentPost.categoryId -> ContentCategory.id`
- join table for multi-category content assignment: not present

Implication:

- one video can belong to one category in the current schema
- true multi-category assignment is not supported without a schema change

Video-specific content fields present in the Prisma model:

- `type`
- `video_source_type`
- `video_url`
- `video_provider`
- `video_file_url`
- `video_file_key`
- `video_poster_url`
- `duration_seconds`
- `status`
- `published_at`
- `category_id`

## Public `/video-categories` behavior

The exact public query path is:

1. `src/modules/content/content.router.ts`
2. `src/modules/content/content.controller.ts`
3. `src/modules/content/content.service.ts -> listPublicVideoCategories()`

Confirmed behavior:

- the public endpoint intentionally counts only posts where:
  - `type = VIDEO`
  - `status = published`
  - `publishedAt <= now` or `publishedAt is null`
- categories with zero matching published VIDEO posts are excluded

No filter change was made.

## Configured database findings

Configured database inspected:

- PostgreSQL database: `bpa_db`

Current live data state in `bpa_db`:

- content categories: `0`
- real video posts: `0`
- published video posts: `0`
- categorized video posts: `0`

Category relation status:

- no current content/video category relations exist in the configured database

Reason public categories were empty in the configured database:

1. no `content_categories` rows are currently present there
2. no `VIDEO` posts are currently present there
3. therefore the public category query returns `0`

## Runtime schema repair

An additional runtime schema mismatch was found during verification:

- Prisma `ContentPost` includes `durationSeconds`
- the actual `content_posts` table was missing column `duration_seconds`

This would block normal Prisma-backed content-post creation and update flows, including admin-created video content.

Repair added:

- migration: `prisma/migrations/20260722233000_add_content_post_duration_seconds/migration.sql`

This is additive and non-destructive.

## Development sample-seed behavior

Because the configured database has no real videos, a reusable sample video-content seed was added for development/test verification only.

Behavior:

- disabled by default
- runs only when `ENABLE_SAMPLE_VIDEO_CONTENT=true`
- not connected to the master seed
- production does not receive sample content by default

Sample seed characteristics:

- type: `VIDEO`
- idempotent by `slug`
- bilingual titles and summaries
- sample external YouTube URLs only
- published and draft examples
- category assignment by category slug

## Disposable verification result

Disposable verification database used:

- PostgreSQL database: `bpa_seed_verify_20260722`

Verification sequence:

1. applied migrations
2. verified categories with no videos: public count `0`
3. ran sample video-content seed
4. ran sample video-content seed a second time
5. verified category visibility again

Disposable verification results after sample seed:

- admin category count: `20`
- total sample video posts: `3`
- published sample video posts: `2`
- visible public category count: `2`
- visible public category slugs:
  - `pet-care-health`
  - `vaccination-prevention`

Idempotency result:

- second sample-seed run created no duplicate logical records

## Public API verification result

Configured database `bpa_db`:

- `npm run verify:video-categories` returned:
  - admin categories: `0`
  - public categories: `0`
  - real videos: `0`
  - published videos: `0`

Disposable verification database `bpa_seed_verify_20260722` after sample content:

- `npm run verify:video-categories` returned:
  - admin categories: `20`
  - public categories: `2`
  - real videos: `3`
  - published videos: `2`

Interpretation:

- the public category query works as intended
- categories become publicly visible as soon as published VIDEO posts are assigned to them

## Changed files

Command 4 changes:

- `package.json`
- `docs/SEED_RUNBOOK.md`
- `docs/VIDEO_CATEGORY_VISIBILITY_REPORT.md`
- `prisma/seed/data/video-content.seed-data.ts`
- `prisma/seed/video-content.seed.ts`
- `prisma/seed-video-content.ts`
- `prisma/migrations/20260722233000_add_content_post_duration_seconds/migration.sql`
- `scripts/verify-video-category-api.ts`
- `prisma/__tests__/video-content.seed.test.ts`
- `src/modules/content/__tests__/public-video-categories.service.test.ts`

## Tests and build results

Completed successfully:

- `npx prisma validate`
- `npm test -- --runInBand prisma/__tests__/video-content.seed.test.ts src/modules/content/__tests__/public-video-categories.service.test.ts`
- `npm run seed:verify`
- `npm run typecheck`
- `npm run build`

## Exact safe production procedure for publishing the first real video

1. Confirm the target repository is `D:\bpa_main\bpa_api`.
2. Back up the target database.
3. Deploy additive migrations:
   - `npm run db:migrate:prod`
4. Seed reference data:
   - `npm run db:seed`
5. In the admin panel, create a real BPA content post with:
   - `type = VIDEO`
   - `status = published`
   - `categoryId` set to one of the seeded video categories
   - valid `videoSourceType`
   - real BPA video URL or file-backed source
   - `publishedAt` set to now or an earlier timestamp
6. Verify the category appears through:
   - `GET /api/v1/public/video-categories`
   - or `npm run verify:video-categories`

Production safety note:

- do not run `npm run seed:video-content` in production unless sample content is explicitly and intentionally required
- do not use `prisma migrate reset` on production
