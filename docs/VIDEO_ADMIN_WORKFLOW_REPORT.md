# Video Admin Workflow Report

Verification date: July 22, 2026

## Repository scope

- API repository: `D:\bpa_main\bpa_api`
- Admin repository inspected and updated: `D:\bpa_main\bpa_admin`
- Target database: local Docker-backed `bpa_db`

## Current live database state

- video categories: `20`
- real VIDEO posts: `0`
- published VIDEO posts: `0`
- video posts with category assignments: `0`
- persistent video rows created during this command: `0`

## Admin pages and route flow

End-to-end path:

1. Admin pages
   - video list: `/content-hub/videos`
   - create video: `/content-hub/videos/create`
   - edit video: `/content-hub/videos/[id]/edit`
   - preview video: `/content-hub/videos/[id]/preview`
   - category management: `/content-hub/categories`
2. Admin BFF / client proxy
   - browser calls `/api/backend/...` in the admin app
3. BPA API admin endpoints
   - list posts: `GET /api/v1/admin/content/posts`
   - create post: `POST /api/v1/admin/content/posts`
   - edit post: `PATCH /api/v1/admin/content/posts/:id`
   - delete post: `DELETE /api/v1/admin/content/posts/:id`
   - load categories: `GET /api/v1/admin/content/categories`
4. BPA API public endpoints
   - list public videos: `GET /api/v1/public/videos`
   - public video detail: `GET /api/v1/public/videos/:slug`
   - public visible video categories: `GET /api/v1/public/video-categories`

## Category loading result

- Admin category query returns `20` records from `content_categories`
- The video form loads categories from `contentApi.listCategories()`
- The category picker remains single-category only
  - field: `content_posts.category_id`
  - multi-category assignment is not supported in the current schema

## Supported video sources

Confirmed supported source modes after repair:

- YouTube
  - accepts supported URL or raw video ID
- Vimeo
  - accepts supported URL or raw video ID
- Uploaded video
  - requires an existing central-media asset/file reference

## Central-media integration status

Confirmed.

The admin video form uses the existing central media picker for:

- uploaded video file
- video poster / thumbnail
- cover image

Operators do not need to paste internal storage URLs for assets already in the central media library.

## Public visibility rules

The public `/video-categories` query intentionally requires at least one matching content post where:

- `type = VIDEO`
- `status = published`
- `publishedAt <= now` or `publishedAt is null`

Empty categories remain hidden publicly. This behavior was preserved.

## Defects found and fixed

1. Admin content client type was wrong
   - `videoSourceType` allowed only `youtube | upload`
   - `durationSeconds` was missing from the admin contract

2. Video form source handling was wrong
   - YouTube and Vimeo were collapsed into one radio path
   - Vimeo could not be expressed as the real backend `videoSourceType`

3. Video form overwrote scheduled publishing
   - every save forced `publishedAt = now` when status was `published`
   - scheduled publish times could not survive an edit

4. Backend validation was too strict for external videos
   - only full URLs were accepted
   - raw YouTube/Vimeo IDs are now accepted and normalized

5. Public detail visibility had a scheduling leak
   - `GET /public/videos/:slug` could return a future-scheduled published row
   - future-scheduled content is now blocked until `publishedAt`

6. Admin preview workflow was incomplete
   - there was no dedicated video preview page
   - a preview page now exists at `/content-hub/videos/[id]/preview`

## Authorization result

Verified through targeted router tests:

- unauthenticated admin video creation is rejected with `401`
- unauthorized admin video creation is rejected with `403`
- authorized admins can create and manage videos
- category loading is permission-gated on the backend

## Rollback-only public visibility result

No persistent probe row was inserted into `bpa_db` because:

- real VIDEO post count is `0`
- sample content is prohibited
- no operator-provided real BPA video URL or uploaded asset was available

Public behavior was therefore verified through deterministic backend tests and live count verification:

- empty categories are excluded
- draft videos are excluded
- future-scheduled videos are excluded before publish time
- published non-VIDEO posts are excluded
- published VIDEO posts would surface through both `/public/videos` and `/public/video-categories`

## Create / edit / publish workflow status

Verified status:

- create: ready
- edit: ready
- preview: ready
- publish now: ready
- schedule publish: ready
- unpublish back to draft: ready
- archive through status: ready
- delete: ready

## Tests and build results

API repository:

- `npx prisma validate` ✅
- `npm test -- src/modules/content/__tests__/content.router.test.ts src/modules/content/__tests__/public-video-categories.service.test.ts src/modules/content/__tests__/public-videos.service.test.ts` ✅
- `npm run typecheck` ✅
- `npm run build` ✅
- `npm run verify:video-categories` ✅

Admin repository:

- `npm test -- src/app/'(admin)'/content-hub/components/content-post-form.helpers.test.ts src/hooks/usePermission.test.ts src/lib/api/media.api.test.ts` ✅
- `npm run typecheck` ✅
- `npm run build` ✅

Prisma generation:

- not required for this command
- no Prisma DLL lock remediation was needed

## Live API verification result

Against `bpa_db` on July 22, 2026:

- admin category count: `20`
- public category count: `0`
- real VIDEO count: `0`
- published VIDEO count: `0`

This matches the intended product behavior: public categories remain empty until at least one real published VIDEO post exists.

## Changed files

API repository:

- `src/modules/content/video-source.ts`
- `src/modules/content/content.types.ts`
- `src/modules/content/content.service.ts`
- `src/modules/content/__tests__/content.router.test.ts`
- `src/modules/content/__tests__/public-videos.service.test.ts`

Admin repository:

- `src/lib/api/content.api.ts`
- `src/app/(admin)/content-hub/components/ContentPostForm.tsx`
- `src/app/(admin)/content-hub/components/content-post-form.helpers.ts`
- `src/app/(admin)/content-hub/components/content-post-form.helpers.test.ts`
- `src/app/(admin)/content-hub/videos/page.tsx`
- `src/app/(admin)/content-hub/videos/[id]/preview/page.tsx`

## Exact operator steps for publishing the first real BPA video

1. Open BPA Admin: `/content-hub/videos/create`
2. Enter:
   - English and Bangla title
   - slug
   - summary and body fields as needed
   - one of the 20 seeded categories
3. Choose exactly one source type:
   - YouTube: paste a supported YouTube URL or 11-character video ID
   - Vimeo: paste a supported Vimeo URL or numeric video ID
   - Upload: select the video from the central media library
4. Select poster/thumbnail and cover image from the central media picker when needed
5. Enter duration in seconds if known
6. Either:
   - set status to `draft` and save, then preview and publish later
   - or set status to `published` and leave publish time blank for immediate release
   - or set status to `published` with a future publish date/time for scheduling
7. Save the post
8. Open `/content-hub/videos/[id]/preview` and verify the record
9. Once status is `published` and publish time has arrived:
   - the post appears in `GET /api/v1/public/videos`
   - its category appears in `GET /api/v1/public/video-categories`
   - unrelated empty categories remain hidden

## Remaining operator input required

An operator must provide the first real BPA video source:

- real YouTube URL or ID
- real Vimeo URL or ID
- or a real uploaded video asset in the media library

No fake or sample video was inserted.
